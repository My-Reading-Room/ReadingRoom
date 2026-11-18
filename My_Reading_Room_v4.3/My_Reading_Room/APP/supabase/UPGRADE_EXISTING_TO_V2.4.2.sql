-- My Reading Room v2.4.2 - editable known total installments per series
-- Apply after 2.3.4, 2.3.6, 2.3.8, 2.3.9. Backup first.
-- Optional field: no existing books or progress are modified.
begin;
alter table public.user_books add column if not exists series_total integer;
do $$ begin
  if not exists (select 1 from pg_constraint where conname='user_books_series_total_range') then
    alter table public.user_books add constraint user_books_series_total_range
      check (series_total is null or series_total between 1 and 500);
  end if;
end $$;
commit;
