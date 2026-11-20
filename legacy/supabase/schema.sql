-- My Reading Room: original schema plus v1.1 per-person sharing and reading modes.
-- Run once in Supabase SQL Editor BEFORE using the web app.
-- IMPORTANT: Never place your Supabase service_role / secret key in the browser.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Reader',
  created_at timestamptz not null default now(),
  tracking_start_date date not null default current_date,
  tracking_start_goal_minutes integer default 30 check (tracking_start_goal_minutes between 1 and 1440)
);

create table if not exists public.reading_circles (
  id uuid primary key default gen_random_uuid(),
  invite_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.circle_members (
  circle_id uuid not null references public.reading_circles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key(circle_id, user_id),
  unique(user_id)
);

create table if not exists public.user_books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  author text not null default '',
  work_key text,
  edition_key text,
  isbn text,
  asin text, -- optional Amazon Standard Identification Number; not an ISBN
  description text,
  published_year integer,
  edition_year integer,
  original_published_year integer,
  goodreads_added_on date,
  publisher text,
  binding text,
  page_count integer check(page_count is null or page_count > 0),
  height_mm numeric check(height_mm is null or height_mm > 0),
  thickness_mm numeric check(thickness_mm is null or thickness_mm > 0),
  cover_url text,
  genres text[] not null default '{}',
  series_name text,
  series_number numeric,
  series_total integer check(series_total is null or (series_total between 1 and 500)),
  series_total_source text check (series_total_source is null or series_total_source in ('manual','listofbooks')),
  series_source_url text,
  status text not null default 'tbr' check (status in ('tbr','reading','finished','dnf')),
  favorite boolean not null default false,
  rating numeric(3,2) check(rating is null or (rating between 0.25 and 5 and rating * 4 = trunc(rating * 4))),
  started_on date,
  finished_on date,
  current_page integer not null default 0 check(current_page >= 0),
  shelf_order integer not null default 0,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chapter_boundaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_book_id uuid not null references public.user_books(id) on delete cascade,
  chapter_number integer not null check(chapter_number > 0),
  chapter_label text,
  start_page integer not null check(start_page > 0),
  end_page integer not null check(end_page >= start_page),
  created_at timestamptz not null default now(),
  unique(user_book_id, chapter_number)
);

create table if not exists public.reading_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_book_id uuid not null references public.user_books(id) on delete cascade,
  session_date date not null default current_date,
  duration_minutes integer not null check(duration_minutes > 0),
  log_type text not null check(log_type in ('pages','chapters')),
  pages_read integer not null check(pages_read > 0),
  chapter_from integer,
  chapter_to integer,
  notes text not null default '',
  created_at timestamptz not null default now(),
  constraint valid_chapter_session check (
    (log_type='pages' and chapter_from is null and chapter_to is null)
    or (log_type='chapters' and chapter_from > 0 and chapter_to >= chapter_from)
  )
);

create table if not exists public.reading_goals (
  user_id uuid not null references auth.users(id) on delete cascade,
  year integer not null check(year between 1900 and 2200),
  books_target integer not null default 12 check(books_target between 1 and 10000),
  daily_minutes_target integer not null default 30 check(daily_minutes_target between 1 and 1440),
  primary key(user_id,year)
);

create table if not exists public.shelf_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  finish text not null default 'walnut' check(finish in ('walnut','oak','slate')),
  display_mode text not null default 'covers' check(display_mode in ('covers','spines','mix')),
  decor text not null default 'cozy' check(decor in ('cozy','plant','minimal')),
  updated_at timestamptz not null default now()
);

create index if not exists user_books_user_idx on public.user_books(user_id,status);
create index if not exists reading_sessions_user_date_idx on public.reading_sessions(user_id,session_date);
create index if not exists reading_sessions_book_date_idx on public.reading_sessions(user_book_id,session_date);
create index if not exists chapter_boundaries_book_idx on public.chapter_boundaries(user_book_id,chapter_number);

-- SECURITY DEFINER helpers avoid recursive RLS on circle_members.
create or replace function public.in_reading_circle(p_circle_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.circle_members cm
    where cm.circle_id=p_circle_id and cm.user_id=(select auth.uid())
  );
$$;

create or replace function public.shares_reading_circle(p_other_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.circle_members a
    join public.circle_members b on a.circle_id=b.circle_id
    where a.user_id=(select auth.uid()) and b.user_id=p_other_user_id
  );
$$;

revoke all on function public.in_reading_circle(uuid) from public;
revoke all on function public.shares_reading_circle(uuid) from public;
grant execute on function public.in_reading_circle(uuid) to authenticated;
grant execute on function public.shares_reading_circle(uuid) to authenticated;

-- Trigger to create a profile on signup.
create or replace function public.on_new_reader()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.profiles(id,display_name)
 values (new.id,coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'),''), split_part(new.email,'@',1),'Reader'))
 on conflict(id) do nothing;
 return new;
end;
$$;
drop trigger if exists on_auth_reader_created on auth.users;
create trigger on_auth_reader_created after insert on auth.users
for each row execute function public.on_new_reader();

-- Circle creation / joining: a circle has at most two members, and a user has one circle.
create or replace function public.create_reading_circle()
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_id uuid;
begin
 if v_user is null then raise exception 'Sign in first.'; end if;
 if exists(select 1 from public.circle_members where user_id=v_user) then
   raise exception 'You already belong to a reading circle.';
 end if;
 insert into public.reading_circles(created_by) values(v_user) returning id into v_id;
 insert into public.circle_members(circle_id,user_id) values(v_id,v_user);
 return v_id;
end;
$$;

create or replace function public.join_reading_circle(p_invite_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_id uuid; v_count integer;
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
 insert into public.circle_members(circle_id,user_id) values(v_id,v_user);
 return v_id;
end;
$$;
revoke all on function public.create_reading_circle() from public;
revoke all on function public.join_reading_circle(text) from public;
grant execute on function public.create_reading_circle() to authenticated;
grant execute on function public.join_reading_circle(text) to authenticated;

-- Enforce that session metadata is consistent with its book, and that chapter
-- pages are calculated from exact, complete, edition-specific mappings.
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
 end if;
 return new;
end;
$$;
drop trigger if exists reading_session_validated on public.reading_sessions;
create trigger reading_session_validated before insert or update on public.reading_sessions
for each row execute function public.validate_reading_session();

create or replace function public.validate_chapter_boundary()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_owner uuid; v_page_count integer;
begin
 select user_id,page_count into v_owner,v_page_count
 from public.user_books where id=new.user_book_id;
 if v_owner is null or new.user_id<>v_owner then
    raise exception 'Chapter must belong to the book owner.';
 end if;
 if v_page_count is not null and new.end_page>v_page_count then
    raise exception 'Chapter ends after the last page of the edition.';
 end if;
 if exists (select 1 from public.chapter_boundaries cb
   where cb.user_book_id=new.user_book_id
   and cb.id<>new.id
   and new.start_page<=cb.end_page and new.end_page>=cb.start_page) then
    raise exception 'Chapter page ranges cannot overlap.';
 end if;
 return new;
end;
$$;
drop trigger if exists chapter_boundary_validated on public.chapter_boundaries;
create trigger chapter_boundary_validated before insert or update on public.chapter_boundaries
for each row execute function public.validate_chapter_boundary();

alter table public.profiles enable row level security;
alter table public.reading_circles enable row level security;
alter table public.circle_members enable row level security;
alter table public.user_books enable row level security;
alter table public.chapter_boundaries enable row level security;
alter table public.reading_sessions enable row level security;
alter table public.reading_goals enable row level security;
alter table public.shelf_settings enable row level security;

create policy "See self and reading partner" on public.profiles for select to authenticated
using(id=(select auth.uid()) or public.shares_reading_circle(id));
create policy "Edit own profile" on public.profiles for update to authenticated
using(id=(select auth.uid())) with check(id=(select auth.uid()));

create policy "Read own circle" on public.reading_circles for select to authenticated
using(public.in_reading_circle(id));
create policy "Read members of own circle" on public.circle_members for select to authenticated
using(public.in_reading_circle(circle_id));

create policy "Read shared libraries" on public.user_books for select to authenticated
using(user_id=(select auth.uid()) or public.shares_reading_circle(user_id));
create policy "Add to own library" on public.user_books for insert to authenticated
with check(user_id=(select auth.uid()));
create policy "Update own library" on public.user_books for update to authenticated
using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy "Delete from own library" on public.user_books for delete to authenticated
using(user_id=(select auth.uid()));

create policy "Read shared chapter maps" on public.chapter_boundaries for select to authenticated
using(user_id=(select auth.uid()) or public.shares_reading_circle(user_id));
create policy "Add own chapter maps" on public.chapter_boundaries for insert to authenticated
with check(user_id=(select auth.uid()));
create policy "Update own chapter maps" on public.chapter_boundaries for update to authenticated
using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy "Delete own chapter maps" on public.chapter_boundaries for delete to authenticated
using(user_id=(select auth.uid()));

create policy "Read shared sessions" on public.reading_sessions for select to authenticated
using(user_id=(select auth.uid()) or public.shares_reading_circle(user_id));
create policy "Add own sessions" on public.reading_sessions for insert to authenticated
with check(user_id=(select auth.uid()));
create policy "Edit own sessions" on public.reading_sessions for update to authenticated
using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy "Delete own sessions" on public.reading_sessions for delete to authenticated
using(user_id=(select auth.uid()));

create policy "Read shared reading goals" on public.reading_goals for select to authenticated
using(user_id=(select auth.uid()) or public.shares_reading_circle(user_id));
create policy "Insert own reading goals" on public.reading_goals for insert to authenticated
with check(user_id=(select auth.uid()));
create policy "Update own reading goals" on public.reading_goals for update to authenticated
using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));

create policy "Read shared bookshelf settings" on public.shelf_settings for select to authenticated
using(user_id=(select auth.uid()) or public.shares_reading_circle(user_id));
create policy "Create own bookshelf settings" on public.shelf_settings for insert to authenticated
with check(user_id=(select auth.uid()));
create policy "Edit own bookshelf settings" on public.shelf_settings for update to authenticated
using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));

-- Restrict default API table grants before explicitly granting allowed operations.
-- RLS policies then enforce access to individual rows.
revoke all on public.profiles,public.reading_circles,public.circle_members,public.user_books,public.chapter_boundaries,public.reading_sessions,public.reading_goals,public.shelf_settings from anon,authenticated;

-- Grant only needed authenticated-user operations; RLS still determines rows.
grant select,insert,update,delete on public.user_books,public.chapter_boundaries,public.reading_sessions to authenticated;
grant select,insert,update on public.reading_goals,public.shelf_settings to authenticated;
grant select,update on public.profiles to authenticated;
grant select on public.reading_circles,public.circle_members to authenticated;


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

-- Apply the v1.2 audio page-equivalents upgrade on fresh schema installations.
-- v1.2: Allow Time + Pages in Audiobook Only, alongside exact-chapter progress.
-- Here pages_read means print-edition page-equivalent progress for audiobook-only sessions.
-- For reading/read_listen, pages_read means physical pages progressed. Neither
-- option estimates pages from audiobook elapsed time or average chapter lengths.
-- Existing chapter validation trigger continues to require *every* exact mapped chapter.
alter table public.reading_sessions drop constraint if exists valid_reading_session_fields;
alter table public.reading_sessions
  add constraint valid_reading_session_fields check (
    activity_mode in ('reading','audiobook','read_listen')
    and (
      (log_type='pages'
        and pages_read > 0 and chapter_from is null and chapter_to is null
        and audio_start_minute is null and audio_end_minute is null)
      or (log_type='chapters' and chapter_from > 0 and chapter_to >= chapter_from
        and pages_read > 0 and audio_start_minute is null and audio_end_minute is null)
      or (log_type='audio_position' and activity_mode in ('audiobook','read_listen')
        and pages_read is null and chapter_from is null and chapter_to is null
        and audio_start_minute >= 0 and audio_end_minute > audio_start_minute)
    )
  );
comment on column public.reading_sessions.pages_read is
  'Pages progressed in selected print edition. For audiobook activity: page-equivalents, not physically read pages. NULL when only audio positions are known. Chapter pages use exact mapped boundaries only.';

-- v1.7: keep an immutable-by-past-date history of goal targets.
-- Changing the setting takes effect today; days before today keep old targets.
create table if not exists public.reading_goal_history (
  user_id uuid not null references auth.users(id) on delete cascade,
  effective_date date not null,
  target_minutes integer not null check(target_minutes between 1 and 1440),
  changed_at timestamptz not null default now(),
  primary key (user_id, effective_date)
);
create index if not exists reading_goal_history_user_effective_idx
  on public.reading_goal_history(user_id,effective_date desc);
alter table public.reading_goal_history enable row level security;
drop policy if exists "Read own or full-share goal history" on public.reading_goal_history;
create policy "Read own or full-share goal history" on public.reading_goal_history
  for select to authenticated using(public.can_view_full(user_id));
drop policy if exists "Insert own goal history" on public.reading_goal_history;
create policy "Insert own goal history" on public.reading_goal_history
  for insert to authenticated with check(user_id=(select auth.uid()) and effective_date = current_date);
drop policy if exists "Update own goal history for today" on public.reading_goal_history;
create policy "Update own goal history for today" on public.reading_goal_history
  for update to authenticated using(user_id=(select auth.uid()) and effective_date=current_date)
  with check(user_id=(select auth.uid()) and effective_date=current_date);
revoke all on public.reading_goal_history from anon,authenticated;
grant select,insert,update on public.reading_goal_history to authenticated;
-- Seed a start-of-year baseline from previously saved annual settings. Do not
-- overwrite existing history on repeated execution.
insert into public.reading_goal_history (user_id,effective_date,target_minutes)
select user_id,make_date(year,1,1),daily_minutes_target from public.reading_goals
where year between 1900 and 2200
on conflict(user_id,effective_date) do nothing;

-- v1.8: time-of-day reporting and TBR aging; see migration for rationale.
alter table public.reading_sessions add column if not exists start_local_time time without time zone;
alter table public.user_books add column if not exists tbr_added_on date;

-- My Reading Room v1.9 — reread tracking and preserved completion history.
-- Run AFTER all v1.8 migrations on existing Supabase projects.
-- Both columns stay inside the existing owner/full-share RLS tables.
-- No new public table is exposed to summary-only viewers.
alter table public.user_books add column if not exists read_history jsonb not null default '[]'::jsonb;
alter table public.user_books drop constraint if exists user_books_read_history_array;
alter table public.user_books add constraint user_books_read_history_array check (jsonb_typeof(read_history)='array');
comment on column public.user_books.read_history is
 'Explicit reading passes, including their immutable past completion dates. Legacy books with an empty array represent one implicit pass; historical rereads are NEVER inferred.';
alter table public.reading_sessions add column if not exists read_number integer not null default 1;
alter table public.reading_sessions drop constraint if exists reading_sessions_read_number_positive;
alter table public.reading_sessions add constraint reading_sessions_read_number_positive check(read_number between 1 and 9999);
comment on column public.reading_sessions.read_number is
 'Reading pass of the associated book. Defaults to pass 1 for legacy sessions; pass 2+ indicates a user-started reread.';

-- Summary-only shared profiles must continue to count a distinct book in its
-- historical completion year even while the user is rereading that book.
-- This is a SECURITY DEFINER function that returns WHITELISTED aggregates only,
-- not read_history JSON or per-book details.
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
      and (exists (
        select 1 from jsonb_array_elements(b.read_history) pass
        where pass->>'status'='finished'
          and coalesce(nullif(substring(pass->>'finished_on' from 1 for 4), ''), pass->>'finished_year')=t.yr::text
          -- A completion is a historical fact independent of the date
          -- reliable reading-session logging began.
          and (
            (pass->>'finished_on' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
            or (nullif(pass->>'finished_on','') is null and pass->>'finished_year' ~ '^[0-9]{4}$')
          )
      ) or (b.read_history='[]'::jsonb and b.status='finished'
          and extract(year from b.finished_on)=t.yr))),
    coalesce((select g.books_target from public.reading_goals g
      where g.user_id=t.owner_id and g.year=t.yr),12),
    (select count(*) from public.user_books b where b.user_id=t.owner_id and b.favorite),
    (select round(avg(b.rating),2) from public.user_books b
      where b.user_id=t.owner_id and b.rating is not null),
    (select coalesce(sum(s.duration_minutes),0) from public.reading_sessions s
      where s.user_id=t.owner_id and extract(year from s.session_date)=t.yr
        and s.session_date >= coalesce(pr.tracking_start_date, pr.created_at::date)
        and s.activity_mode='reading'),
    (select coalesce(sum(s.duration_minutes),0) from public.reading_sessions s
      where s.user_id=t.owner_id and extract(year from s.session_date)=t.yr
        and s.session_date >= coalesce(pr.tracking_start_date, pr.created_at::date)
        and s.activity_mode='audiobook'),
    (select coalesce(sum(s.duration_minutes),0) from public.reading_sessions s
      where s.user_id=t.owner_id and extract(year from s.session_date)=t.yr
        and s.session_date >= coalesce(pr.tracking_start_date, pr.created_at::date)
        and s.activity_mode='read_listen'),
    (select coalesce(sum(s.duration_minutes),0) from public.reading_sessions s
      where s.user_id=t.owner_id and extract(year from s.session_date)=t.yr
        and s.session_date >= coalesce(pr.tracking_start_date, pr.created_at::date)),
    (select count(*) from public.reading_sessions s
      where s.user_id=t.owner_id and extract(year from s.session_date)=t.yr
        and s.session_date >= coalesce(pr.tracking_start_date, pr.created_at::date))
 from target t join public.profiles pr on pr.id=t.owner_id;
$$;
revoke all on function public.get_viewable_profile_summaries(integer) from public;
grant execute on function public.get_viewable_profile_summaries(integer) to authenticated;
-- My Reading Room v2.3.6: record the actual pages before/after new page logs.
-- Back up Supabase first. Run AFTER all earlier upgrades, including v2.3.4.
-- Historical logs retain pages_read; their positions are intentionally NULL
-- because a historical stopping page cannot be reconstructed reliably.
-- No new tables, roles, grants or sharing policies are created.
BEGIN;
ALTER TABLE public.reading_sessions
  ADD COLUMN IF NOT EXISTS start_page integer,
  ADD COLUMN IF NOT EXISTS end_page integer;
ALTER TABLE public.reading_sessions
  DROP CONSTRAINT IF EXISTS reading_sessions_page_positions_consistent;
ALTER TABLE public.reading_sessions
  ADD CONSTRAINT reading_sessions_page_positions_consistent CHECK (
    (start_page IS NULL AND end_page IS NULL)
    OR (start_page IS NOT NULL AND end_page IS NOT NULL AND
        log_type = 'pages' AND start_page >= 0 AND
        end_page > start_page AND pages_read = end_page - start_page)
  );
COMMENT ON COLUMN public.reading_sessions.start_page IS
  'Beginning print-edition page for a new Time + Ending Page log. NULL for legacy and non-page logs.';
COMMENT ON COLUMN public.reading_sessions.end_page IS
  'Page position reached at the end of the session, not pages progressed; NULL for legacy logs.';

-- Keep the existing owner and exact chapter-map checks, and additionally
-- enforce the selected edition's page count for newly saved end positions.
CREATE OR REPLACE FUNCTION public.validate_reading_session()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_owner uuid; v_book_pages integer; v_mapped bigint; v_pages bigint; v_required bigint;
BEGIN
  SELECT user_id, page_count INTO v_owner, v_book_pages
    FROM public.user_books WHERE id = NEW.user_book_id;
  IF v_owner IS NULL OR NEW.user_id <> v_owner THEN
    RAISE EXCEPTION 'The reading session must belong to the book owner.';
  END IF;
  IF NEW.log_type = 'chapters' THEN
    v_required := NEW.chapter_to - NEW.chapter_from + 1;
    SELECT count(cb.id), coalesce(sum(cb.end_page - cb.start_page + 1), 0)
      INTO v_mapped, v_pages
      FROM generate_series(NEW.chapter_from, NEW.chapter_to) chapter(n)
      LEFT JOIN public.chapter_boundaries cb
        ON cb.user_book_id = NEW.user_book_id AND cb.chapter_number = chapter.n;
    IF v_mapped <> v_required THEN
      RAISE EXCEPTION 'Exact page boundaries are required for every chapter.';
    END IF;
    NEW.pages_read := v_pages;
  ELSIF NEW.log_type = 'audio_position' THEN
    NEW.pages_read := NULL;
  ELSIF NEW.log_type = 'pages' AND NEW.end_page IS NOT NULL THEN
    IF v_book_pages IS NOT NULL AND NEW.end_page > v_book_pages THEN
      RAISE EXCEPTION 'Ending page exceeds the selected book edition page count.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
COMMIT;
NOTIFY pgrst, 'reload schema';


-- v2.3.8: shared edition chapter maps and reviewed bulk import
-- My Reading Room v2.3.8: edition-specific, opt-in community chapter mappings.
-- BACK UP FIRST. Run after the v2.3.4 and v2.3.6 upgrades on existing v2.3.3 installs.
-- Only the current owner's verified chapter boundaries can be published.
-- Other readers must explicitly review shared candidates before saving locally.
-- No source images, reading history, or public contributor identities are shared.

CREATE OR REPLACE FUNCTION public.chapter_isbn13(p_input text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE v_text text; v_check integer:=0; v_i integer; v_digit integer; v_first12 text;
BEGIN
 v_text := regexp_replace(upper(coalesce(p_input,'')), '[^0-9X]', '', 'g');
 IF v_text ~ '^[0-9]{13}$' THEN
   FOR v_i IN 1..13 LOOP
     v_check := v_check + substring(v_text,v_i,1)::integer * CASE WHEN v_i % 2=0 THEN 3 ELSE 1 END;
   END LOOP;
   IF v_check % 10=0 THEN RETURN v_text; END IF;
 ELSIF v_text ~ '^[0-9]{9}[0-9X]$' THEN
   FOR v_i IN 1..10 LOOP
     v_digit := CASE WHEN substring(v_text,v_i,1)='X' THEN 10 ELSE substring(v_text,v_i,1)::integer END;
     v_check := v_check + (11-v_i)*v_digit;
   END LOOP;
   IF v_check % 11<>0 THEN RETURN NULL; END IF;
   v_first12 := '978' || substring(v_text,1,9);
   v_check := 0;
   FOR v_i IN 1..12 LOOP
     v_check := v_check + substring(v_first12,v_i,1)::integer * CASE WHEN v_i % 2=0 THEN 3 ELSE 1 END;
   END LOOP;
   RETURN v_first12 || ((10-(v_check%10))%10)::text;
 END IF;
 RETURN NULL;
END;
$$;

CREATE TABLE IF NOT EXISTS public.shared_chapter_maps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contributor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  isbn13 text NOT NULL CHECK(isbn13 ~ '^[0-9]{13}$'),
  page_count integer CHECK(page_count IS NULL OR page_count > 0),
  chapter_data jsonb NOT NULL CHECK(jsonb_typeof(chapter_data)='array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(contributor_id,isbn13)
);
CREATE INDEX IF NOT EXISTS shared_chapter_maps_isbn_idx ON public.shared_chapter_maps(isbn13,updated_at DESC);
ALTER TABLE public.shared_chapter_maps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shared_chapter_maps FROM PUBLIC, anon, authenticated;
-- No direct table grants or RLS access. Security-definer RPCs return sanitized
-- mappings only, and verify ownership before writing.

CREATE OR REPLACE FUNCTION public.replace_book_chapter_map(p_user_book_id uuid, p_chapters jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user uuid; v_page_count integer; v_owner uuid; v_item jsonb;
        v_number integer; v_start integer; v_end integer; v_previous_end integer:=0; v_idx integer:=0;
BEGIN
 v_user := (SELECT auth.uid());
 SELECT user_id,page_count INTO v_owner,v_page_count FROM public.user_books
   WHERE id=p_user_book_id FOR UPDATE;
 IF v_user IS NULL OR v_owner IS DISTINCT FROM v_user THEN RAISE EXCEPTION 'Only the book owner can save a chapter map.'; END IF;
 IF p_chapters IS NULL OR jsonb_typeof(p_chapters)<>'array' OR
    jsonb_array_length(p_chapters) NOT BETWEEN 1 AND 300 THEN
   RAISE EXCEPTION 'Choose 1–300 verified chapters.';
 END IF;
 -- Validate everything before deleting a single existing mapping row.
 FOR v_item IN SELECT value FROM jsonb_array_elements(p_chapters) LOOP
   v_idx := v_idx+1;
   IF jsonb_typeof(v_item)<>'object' OR
      coalesce(v_item->>'chapter_number','') !~ '^[0-9]{1,4}$' OR
      coalesce(v_item->>'start_page','') !~ '^[0-9]{1,6}$' OR
      coalesce(v_item->>'end_page','') !~ '^[0-9]{1,6}$' THEN
     RAISE EXCEPTION 'Every chapter needs an integer chapter number and exact start/end page.';
   END IF;
   v_number := (v_item->>'chapter_number')::integer;
   v_start := (v_item->>'start_page')::integer;
   v_end := (v_item->>'end_page')::integer;
   IF v_number<>v_idx OR v_start<1 OR v_end<v_start OR v_start<=v_previous_end OR
      (v_page_count IS NOT NULL AND v_end>v_page_count) THEN
     RAISE EXCEPTION 'Chapter numbers must be sequential and page boundaries exact, ordered, non-overlapping, and within the book.';
   END IF;
   v_previous_end:=v_end;
 END LOOP;
 DELETE FROM public.chapter_boundaries WHERE user_book_id=p_user_book_id;
 FOR v_item IN SELECT value FROM jsonb_array_elements(p_chapters) LOOP
   v_number:=(v_item->>'chapter_number')::integer;
   INSERT INTO public.chapter_boundaries(user_id,user_book_id,chapter_number,chapter_label,start_page,end_page)
     VALUES (v_user,p_user_book_id,v_number,
       left(coalesce(nullif(trim(v_item->>'chapter_label'),''),'Chapter '||v_number),180),
       (v_item->>'start_page')::integer,(v_item->>'end_page')::integer);
 END LOOP;
 RETURN v_idx;
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_chapter_map(p_user_book_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user uuid; v_owner uuid; v_isbn text; v_page_count integer;
        v_count integer; v_bad integer; v_chapters jsonb; v_result uuid;
BEGIN
 v_user:=(SELECT auth.uid());
 SELECT b.user_id,public.chapter_isbn13(b.isbn),b.page_count
   INTO v_owner,v_isbn,v_page_count FROM public.user_books b WHERE id=p_user_book_id FOR UPDATE;
 IF v_user IS NULL OR v_owner IS DISTINCT FROM v_user THEN RAISE EXCEPTION 'Only the book owner can publish their chapter map.'; END IF;
 IF v_isbn IS NULL THEN RAISE EXCEPTION 'Save a valid ISBN for this edition before sharing.'; END IF;
 SELECT count(*),jsonb_agg(jsonb_build_object(
   'chapter_number',chapter_number,'chapter_label',chapter_label,
   'start_page',start_page,'end_page',end_page) ORDER BY chapter_number)
 INTO v_count,v_chapters FROM public.chapter_boundaries WHERE user_book_id=p_user_book_id;
 IF v_count NOT BETWEEN 1 AND 300 THEN RAISE EXCEPTION 'Add a verified chapter map before sharing.'; END IF;
 SELECT count(*) INTO v_bad FROM (
   SELECT chapter_number,start_page,end_page,
     row_number() OVER (ORDER BY chapter_number) AS rn,
     lag(end_page) OVER (ORDER BY chapter_number) AS previous_end
   FROM public.chapter_boundaries WHERE user_book_id=p_user_book_id
 ) c WHERE c.chapter_number<>c.rn OR c.start_page<=coalesce(c.previous_end,0)
   OR (v_page_count IS NOT NULL AND c.end_page>v_page_count);
 IF v_bad>0 THEN RAISE EXCEPTION 'The chapter map must be sequential and ordered before sharing.'; END IF;
 INSERT INTO public.shared_chapter_maps(contributor_id,isbn13,page_count,chapter_data)
   VALUES(v_user,v_isbn,v_page_count,v_chapters)
   ON CONFLICT (contributor_id,isbn13) DO UPDATE SET
    page_count=excluded.page_count,chapter_data=excluded.chapter_data,updated_at=now()
 RETURNING id INTO v_result;
 RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_shared_chapter_maps(p_isbn13 text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_isbn text; v_result jsonb;
BEGIN
 IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'Sign in to browse community chapter maps.'; END IF;
 v_isbn:=public.chapter_isbn13(p_isbn13);
 IF v_isbn IS NULL THEN RETURN '[]'::jsonb; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',q.id,'isbn13',q.isbn13,'page_count',q.page_count,
   'chapters',q.chapter_data,'updated_at',q.updated_at)
   ORDER BY q.updated_at DESC),'[]'::jsonb) INTO v_result
 FROM (SELECT id,isbn13,page_count,chapter_data,updated_at
   FROM public.shared_chapter_maps WHERE isbn13=v_isbn
   ORDER BY updated_at DESC LIMIT 8) q;
 RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.withdraw_chapter_map(p_user_book_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user uuid; v_owner uuid; v_isbn text; v_count integer;
BEGIN
 v_user:=(SELECT auth.uid());
 SELECT user_id,public.chapter_isbn13(isbn) INTO v_owner,v_isbn
   FROM public.user_books WHERE id=p_user_book_id;
 IF v_user IS NULL OR v_owner IS DISTINCT FROM v_user THEN RAISE EXCEPTION 'Only the book owner can withdraw their shared map.'; END IF;
 IF v_isbn IS NULL THEN RAISE EXCEPTION 'This edition does not have a valid ISBN.'; END IF;
 DELETE FROM public.shared_chapter_maps WHERE contributor_id=v_user AND isbn13=v_isbn;
 GET DIAGNOSTICS v_count=ROW_COUNT;
 RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.chapter_isbn13(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_book_chapter_map(uuid,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.publish_chapter_map(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_shared_chapter_maps(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.withdraw_chapter_map(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_book_chapter_map(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_chapter_map(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_shared_chapter_maps(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_chapter_map(uuid) TO authenticated;
COMMENT ON TABLE public.shared_chapter_maps IS 'Opt-in edition-specific chapter boundaries; contributor identity and source book data are not exposed by the read RPC.';
