-- My Reading Room v2.2 upgrade for EXISTING v2.1 databases.
-- Back up your Supabase project before running this script.
-- Non-destructive and idempotent: no existing book records are changed.
-- Run APP/supabase/UPGRADE_EXISTING_TO_V2.1.sql first if you have not
-- yet applied v2.1. For a brand-new database use schema.sql only.
ALTER TABLE public.user_books ADD COLUMN IF NOT EXISTS asin text;
COMMENT ON COLUMN public.user_books.asin IS
  'Optional Amazon Standard Identification Number (ASIN), stored separately from ISBN. No Amazon lookup API is configured.';
NOTIFY pgrst, 'reload schema';
SELECT column_name, data_type FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'user_books'
 AND column_name IN ('isbn', 'asin', 'cover_url', 'genres')
 ORDER BY column_name;
