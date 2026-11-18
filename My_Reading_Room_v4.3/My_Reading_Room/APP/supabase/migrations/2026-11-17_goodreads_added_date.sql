-- v2.1: Store Goodreads' Date Added as a distinct source date for all shelves.
-- Safe, additive migration. Back up public.user_books before running on live data.
-- Reimporting the original Goodreads CSV fills existing blank dates.
alter table public.user_books add column if not exists goodreads_added_on date;
comment on column public.user_books.goodreads_added_on is
  'Goodreads Date Added from CSV, distinct from the date added to TBR or to the Reading Room database.';
