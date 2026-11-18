-- My Reading Room v2.3: support historical read-throughs where only the
-- completion YEAR is known (no invented day), including summary-only shares.
-- No new columns or permissions. read_history is the existing owner-protected
-- JSONB column and read_number is the existing session pass column.
-- Safe to rerun on a database already migrated to v2.2.
-- IMPORTANT: Back up the database before any production SQL change.

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
          and coalesce(substring(pass->>'finished_on' from 1 for 4), pass->>'finished_year')=t.yr::text
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

-- Refresh Supabase PostgREST function cache.
NOTIFY pgrst, 'reload schema';
