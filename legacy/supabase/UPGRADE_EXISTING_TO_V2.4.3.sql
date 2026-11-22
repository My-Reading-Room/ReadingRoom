-- v2.4.3: series total provenance and visible catalog attribution
-- Apply after UPGRADE_EXISTING_TO_V2.4.2.sql; backup before running.
begin;
alter table public.user_books add column if not exists series_total_source text;
alter table public.user_books add column if not exists series_source_url text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname='user_books_series_total_source_check') then
    alter table public.user_books add constraint user_books_series_total_source_check
      check (series_total_source is null or series_total_source in ('manual','listofbooks'));
  end if;
end $$;
update public.user_books set series_total_source='manual'
 where series_total is not null and series_total_source is null;
commit;
