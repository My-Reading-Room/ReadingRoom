-- My Reading Room v1.8. Apply after v1.7, in Supabase SQL Editor.
-- Nullable local wall-clock session start, stored only when actually known.
-- Existing sessions remain NULL and are shown in Unknown-time totals.
alter table public.reading_sessions add column if not exists start_local_time time without time zone;
comment on column public.reading_sessions.start_local_time is
  'Optional user-local start time (HH:MM); never automatically inferred for legacy sessions. Use session_date for the calendar date.';

-- True date of addition to the Want to Read shelf, if known.
-- Older rows fall back to created_at for approximate TBR aging in the UI and are labeled accordingly.
alter table public.user_books add column if not exists tbr_added_on date;
comment on column public.user_books.tbr_added_on is
  'Date book was placed on TBR; Goodreads Date Added is used when importing. Nullable for historical unknowns.';
-- No new grants or RLS policies: new fields remain covered by existing
-- full-share/owner SELECT access to reading_sessions and user_books.
