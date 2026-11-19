-- My Reading Room v2.1 upgrade for EXISTING v2.0 or later databases.
-- Make a database backup first. For a brand-new project run schema.sql only.
-- Other, older migrations (v1.1 - v2.0) are not replaced by this file.
-- Additive, idempotent: does not delete books or overwrite any book metadata.
ALTER TABLE public.user_books ADD COLUMN IF NOT EXISTS binding text;
ALTER TABLE public.user_books ADD COLUMN IF NOT EXISTS edition_year integer;
ALTER TABLE public.user_books ADD COLUMN IF NOT EXISTS original_published_year integer;
ALTER TABLE public.user_books ADD COLUMN IF NOT EXISTS goodreads_added_on date;
COMMENT ON COLUMN public.user_books.goodreads_added_on IS
  'Goodreads Date Added from CSV, distinct from the TBR added date';
-- Confirm columns exist:
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'user_books'
  AND column_name IN ('binding','edition_year','original_published_year','goodreads_added_on')
ORDER BY column_name;
