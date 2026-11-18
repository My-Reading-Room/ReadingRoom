-- My Reading Room v1.1 -- upgrade an EXISTING v1 schema.
-- Run once in the Supabase SQL editor AFTER backing up your project.
-- For a fresh project run schema.sql (which includes this upgrade).

-- Sessions retain the two original methods (pages or exact chapters), with a
-- third audio-specific method: duration + audiobook start/end timestamps.
-- No time-only entries; pages from audio positions are NULL (never guessed).
alter table public.reading_sessions
  add column if not exists activity_mode text not null default 'reading',
  add column if not exists audio_start_minute integer,
  add column if not exists audio_end_minute integer;
alter table public.reading_sessions drop constraint if exists reading_sessions_log_type_check;
alter table public.reading_sessions drop constraint if exists reading_sessions_pages_read_check;
alter table public.reading_sessions drop constraint if exists valid_chapter_session;
alter table public.reading_sessions drop constraint if exists valid_reading_session_fields;
alter table public.reading_sessions alter column pages_read drop not null;
alter table public.reading_sessions
  add constraint valid_reading_session_fields check (
    activity_mode in ('reading','audiobook','read_listen')
    and (
      (log_type='pages' and activity_mode <> 'audiobook'
        and pages_read > 0 and chapter_from is null and chapter_to is null
        and audio_start_minute is null and audio_end_minute is null)
      or (log_type='chapters' and chapter_from > 0 and chapter_to >= chapter_from
        and pages_read > 0 and audio_start_minute is null and audio_end_minute is null)
      or (log_type='audio_position' and activity_mode in ('audiobook','read_listen')
        and pages_read is null and chapter_from is null and chapter_to is null
        and audio_start_minute >= 0 and audio_end_minute > audio_start_minute)
    )
  );
create index if not exists reading_sessions_mode_idx
  on public.reading_sessions(user_id,activity_mode,session_date);

-- Existing trigger is redefined to keep exact chapter-page calculations enforced
-- at the DATABASE, rather than trusting a browser-calculated value.
create or replace function public.validate_reading_session()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_owner uuid; v_mapped bigint; v_pages bigint; v_required bigint;
begin
 select user_id into v_owner from public.user_books where id=new.user_book_id;
 if v_owner is null or new.user_id <> v_owner then
    raise exception 'The reading session must belong to the book owner.';
 end if;
 if new.log_type='chapters' then
   v_required := new.chapter_to-new.chapter_from+1;
   select count(cb.id),coalesce(sum(cb.end_page-cb.start_page+1),0)
   into v_mapped,v_pages
   from generate_series(new.chapter_from,new.chapter_to) chapter(n)
   left join public.chapter_boundaries cb
     on cb.user_book_id=new.user_book_id and cb.chapter_number=chapter.n;
   if v_mapped <> v_required then
      raise exception 'Exact page boundaries are required for every chapter.';
   end if;
   new.pages_read := v_pages;
 elsif new.log_type='audio_position' then
   new.pages_read := null;
 end if;
 return new;
end;
$$;

-- Pairwise, direction-specific access: owner A can share full with B and only a
-- summary with C. C never gets RLS access to A's books or sessions.
create table if not exists public.profile_shares (
 owner_id uuid not null references auth.users(id) on delete cascade,
 viewer_id uuid not null references auth.users(id) on delete cascade,
 access_level text not null check (access_level in ('full','summary')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key(owner_id,viewer_id),
 check(owner_id <> viewer_id)
);
create index if not exists profile_shares_viewer_idx on public.profile_shares(viewer_id,owner_id);

create table if not exists public.profile_share_invites (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 invite_code text not null unique,
 access_level text not null check (access_level in ('full','summary')),
 expires_at timestamptz not null default (now()+interval '7 days'),
 redeemed_by uuid references auth.users(id),
 redeemed_at timestamptz,
 created_at timestamptz not null default now()
);
create index if not exists profile_share_invites_owner_idx on public.profile_share_invites(owner_id);

-- A full profile includes all library data. Summary access is deliberately NOT
-- enough for raw session / book / chapter table reads.
create or replace function public.can_view_profile(p_owner uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select p_owner=(select auth.uid()) or exists(
   select 1 from public.profile_shares sh
   where (sh.owner_id=p_owner and sh.viewer_id=(select auth.uid()))
      or (sh.owner_id=(select auth.uid()) and sh.viewer_id=p_owner)
 );
$$;
create or replace function public.can_view_full(p_owner uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select p_owner=(select auth.uid()) or exists(
   select 1 from public.profile_shares sh
   where sh.owner_id=p_owner and sh.viewer_id=(select auth.uid())
     and sh.access_level='full'
 );
$$;
revoke all on function public.can_view_profile(uuid),public.can_view_full(uuid) from public;
grant execute on function public.can_view_profile(uuid),public.can_view_full(uuid) to authenticated;

-- Preserve the original two-person mutual view access when upgrading v1.
insert into public.profile_shares(owner_id,viewer_id,access_level)
select a.user_id,b.user_id,'full'
from public.circle_members a
join public.circle_members b on a.circle_id=b.circle_id and a.user_id<>b.user_id
on conflict(owner_id,viewer_id) do nothing;

-- Also create explicit mutual grants when the original circle invitation flow
-- is still used after this upgrade. The circle remains capped at two members.
create or replace function public.join_reading_circle(p_invite_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_id uuid; v_count integer; v_partner uuid;
begin
 if v_user is null then raise exception 'Sign in first.'; end if;
 if exists(select 1 from public.circle_members where user_id=v_user) then
   raise exception 'You already belong to a reading circle.';
 end if;
 select id into v_id from public.reading_circles
 where invite_code=upper(trim(p_invite_code)) for update;
 if v_id is null then raise exception 'Invite code not found.'; end if;
 select count(*) into v_count from public.circle_members where circle_id=v_id;
 if v_count >= 2 then raise exception 'This reading circle is full.'; end if;
 select user_id into v_partner from public.circle_members where circle_id=v_id limit 1;
 insert into public.circle_members(circle_id,user_id) values(v_id,v_user);
 if v_partner is not null then
   insert into public.profile_shares(owner_id,viewer_id,access_level)
     values(v_partner,v_user,'full'),(v_user,v_partner,'full')
   on conflict(owner_id,viewer_id) do update set access_level='full',updated_at=now();
 end if;
 return v_id;
end;
$$;

create or replace function public.create_profile_share_invite(p_level text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_code text;
begin
 if v_user is null then raise exception 'Sign in first.'; end if;
 if p_level not in ('full','summary') then raise exception 'Invalid access level.'; end if;
 v_code:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,20));
 insert into public.profile_share_invites(owner_id,invite_code,access_level)
 values(v_user,v_code,p_level);
 return v_code;
end;
$$;

create or replace function public.redeem_profile_share_invite(p_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_inv public.profile_share_invites%rowtype;
begin
 if v_user is null then raise exception 'Sign in first.'; end if;
 select * into v_inv from public.profile_share_invites
 where invite_code=upper(trim(p_code)) and redeemed_at is null
   and expires_at>now() for update;
 if v_inv.id is null then raise exception 'Code invalid, expired or already used.'; end if;
 if v_inv.owner_id=v_user then raise exception 'Cannot invite yourself.'; end if;
 insert into public.profile_shares(owner_id,viewer_id,access_level)
 values(v_inv.owner_id,v_user,v_inv.access_level)
 on conflict(owner_id,viewer_id) do update
 set access_level=excluded.access_level,updated_at=now();
 update public.profile_share_invites
 set redeemed_at=now(),redeemed_by=v_user where id=v_inv.id;
 return v_inv.owner_id;
end;
$$;

create or replace function public.set_profile_share_level(p_viewer uuid,p_level text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid();
begin
 if v_user is null then raise exception 'Sign in first.'; end if;
 if p_viewer=v_user then raise exception 'Cannot share with yourself.'; end if;
 if p_level='none' then
   delete from public.profile_shares where owner_id=v_user and viewer_id=p_viewer;
 elsif p_level in ('full','summary') then
   update public.profile_shares set access_level=p_level,updated_at=now()
   where owner_id=v_user and viewer_id=p_viewer;
   if not found then raise exception 'Share not found. Invite the user first.'; end if;
 else raise exception 'Invalid access level.'; end if;
end;
$$;

revoke all on function public.create_profile_share_invite(text),public.redeem_profile_share_invite(text),public.set_profile_share_level(uuid,text) from public;
grant execute on function public.create_profile_share_invite(text),public.redeem_profile_share_invite(text),public.set_profile_share_level(uuid,text) to authenticated;

-- Whitelisted summary values only. This SECURITY DEFINER function MUST verify
-- access internally; a normal SELECT on user_books cannot expose summary rows.
create or replace function public.get_viewable_profile_summaries(p_year integer default null)
returns table(
 owner_id uuid, display_name text, year integer, books_finished bigint,
 annual_goal integer, favorites_count bigint, average_rating numeric,
 reading_minutes bigint, audiobook_minutes bigint, combined_minutes bigint,
 total_minutes bigint, sessions_count bigint
) language sql stable security definer set search_path = '' as $$
 with scope as (
  select (select auth.uid()) as owner_id
  union
  select sh.owner_id from public.profile_shares sh
  where sh.viewer_id=(select auth.uid())
 ), target as (
  select s.owner_id,coalesce(p_year,extract(year from current_date)::integer) yr
  from scope s where s.owner_id is not null
 )
 select t.owner_id,pr.display_name,t.yr,
    (select count(*) from public.user_books b where b.user_id=t.owner_id
      and b.status='finished' and extract(year from b.finished_on)=t.yr),
    coalesce((select g.books_target from public.reading_goals g
      where g.user_id=t.owner_id and g.year=t.yr),12),
    (select count(*) from public.user_books b where b.user_id=t.owner_id and b.favorite),
    (select round(avg(b.rating),2) from public.user_books b
      where b.user_id=t.owner_id and b.rating is not null),
    (select coalesce(sum(s.duration_minutes),0) from public.reading_sessions s
      where s.user_id=t.owner_id and extract(year from s.session_date)=t.yr and s.activity_mode='reading'),
    (select coalesce(sum(s.duration_minutes),0) from public.reading_sessions s
      where s.user_id=t.owner_id and extract(year from s.session_date)=t.yr and s.activity_mode='audiobook'),
    (select coalesce(sum(s.duration_minutes),0) from public.reading_sessions s
      where s.user_id=t.owner_id and extract(year from s.session_date)=t.yr and s.activity_mode='read_listen'),
    (select coalesce(sum(s.duration_minutes),0) from public.reading_sessions s
      where s.user_id=t.owner_id and extract(year from s.session_date)=t.yr),
    (select count(*) from public.reading_sessions s
      where s.user_id=t.owner_id and extract(year from s.session_date)=t.yr)
 from target t join public.profiles pr on pr.id=t.owner_id;
$$;
revoke all on function public.get_viewable_profile_summaries(integer) from public;
grant execute on function public.get_viewable_profile_summaries(integer) to authenticated;

alter table public.profile_shares enable row level security;
alter table public.profile_share_invites enable row level security;
drop policy if exists "View shares involving me" on public.profile_shares;
create policy "View shares involving me" on public.profile_shares for select to authenticated
 using(owner_id=(select auth.uid()) or viewer_id=(select auth.uid()));
drop policy if exists "View own invites" on public.profile_share_invites;
create policy "View own invites" on public.profile_share_invites for select to authenticated
 using(owner_id=(select auth.uid()));

-- REPLACE v1's all-or-nothing circle policies. Policies are permissive ORs:
-- leaving the old unrestricted shared-library policy would leak summary-only data.
drop policy if exists "See self and reading partner" on public.profiles;
create policy "See self and explicitly shared profiles" on public.profiles
 for select to authenticated using(public.can_view_profile(id));
drop policy if exists "Read shared libraries" on public.user_books;
create policy "Read own or full-share libraries" on public.user_books
 for select to authenticated using(public.can_view_full(user_id));
drop policy if exists "Read shared chapter maps" on public.chapter_boundaries;
create policy "Read own or full-share chapter maps" on public.chapter_boundaries
 for select to authenticated using(public.can_view_full(user_id));
drop policy if exists "Read shared sessions" on public.reading_sessions;
create policy "Read own or full-share sessions" on public.reading_sessions
 for select to authenticated using(public.can_view_full(user_id));
drop policy if exists "Read shared reading goals" on public.reading_goals;
create policy "Read own or full-share goals" on public.reading_goals
 for select to authenticated using(public.can_view_full(user_id));
drop policy if exists "Read shared bookshelf settings" on public.shelf_settings;
create policy "Read own or full-share bookshelf settings" on public.shelf_settings
 for select to authenticated using(public.can_view_full(user_id));

revoke all on public.profile_shares,public.profile_share_invites from anon,authenticated;
grant select on public.profile_shares,public.profile_share_invites to authenticated;

-- IMPORTANT: Test A->B full, A->C summary, and revoked access with three
-- distinct Auth users before using real data. Do not expose service keys.
