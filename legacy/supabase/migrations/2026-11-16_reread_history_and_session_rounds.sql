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
          and substring(pass->>'finished_on' from 1 for 4)=t.yr::text
      ) or (b.read_history='[]'::jsonb and b.status='finished'
          and extract(year from b.finished_on)=t.yr))),
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
