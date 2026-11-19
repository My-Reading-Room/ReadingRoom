-- My Reading Room v2.3.2: per-account tracking start date for period
-- Insights, annual completion reporting, and daily reading goal evaluation.
-- Back up your database and apply AFTER upgrades through v2.3.
-- Does NOT delete, rewrite, or change ownership of any books or sessions.
-- Safe to rerun. The explicit backfill preserves existing account-start goal
-- behavior until each reader chooses their preferred date in Settings.

begin;

alter table public.profiles
  add column if not exists tracking_start_date date;

-- Deterministic historical default: account creation day (UTC), not today.
update public.profiles
   set tracking_start_date=(created_at at time zone 'UTC')::date
 where tracking_start_date is null;

alter table public.profiles
  alter column tracking_start_date set default current_date;
alter table public.profiles
  alter column tracking_start_date set not null;

-- Keep summary-only shared metrics consistent with each owner's cutoff.
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
          and (
            -- Exact completion dates must be on or after this account's start.
            ((pass->>'finished_on') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
              and pass->>'finished_on' >= coalesce(pr.tracking_start_date, pr.created_at::date)::text)
            -- For a year-only read, its day is unknown: count it only if the
            -- entire year is within the account's tracking window.
            or (nullif(pass->>'finished_on','') is null
              and coalesce(pr.tracking_start_date, pr.created_at::date) <= make_date(t.yr,1,1))
          )
      ) or (b.read_history='[]'::jsonb and b.status='finished'
          and extract(year from b.finished_on)=t.yr
          and b.finished_on >= coalesce(pr.tracking_start_date, pr.created_at::date)))),
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

commit;
NOTIFY pgrst, 'reload schema';
