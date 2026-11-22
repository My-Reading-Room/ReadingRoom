-- My Reading Room v2.0.1 - Goodreads edition-matching attributes.
-- Apply to EXISTING Supabase projects once, before deploying updated app.js/catalog.js.
-- Run only after backing up the user_books table; safe for existing rows and RLS.
-- Existing `published_year` values are NOT rewritten: older Goodreads imports often
-- stored the original year there, so backfilling edition_year would be inaccurate.

alter table public.user_books add column if not exists binding text;
alter table public.user_books add column if not exists edition_year integer;
alter table public.user_books add column if not exists original_published_year integer;

comment on column public.user_books.binding is
  'Goodreads Binding or provider-reported physical format, never inferred from Google Books printType BOOK.';
comment on column public.user_books.edition_year is
  'Publication year for this print/digital edition, when directly recorded or matched.';
comment on column public.user_books.original_published_year is
  'First published year of the work, distinct from edition publication year; never inferred from a reading session.';
