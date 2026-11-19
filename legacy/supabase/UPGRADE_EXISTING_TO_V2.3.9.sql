-- My Reading Room v2.3.9: restore Goodreads historical finished-book totals.
-- Back up first. Run AFTER the v2.3.8 migration on existing v2.3.3 installs.
-- Completion dates are historical library facts. Session time aggregations
-- continue to respect each owner's tracking_start_date. No new tables or RLS.
BEGIN;
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
REVOKE ALL ON FUNCTION public.get_viewable_profile_summaries(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_viewable_profile_summaries(integer) TO authenticated;
COMMIT;
NOTIFY pgrst, 'reload schema';
