-- My Reading Room v2.3.6: record the actual pages before/after new page logs.
-- Back up Supabase first. Run AFTER all earlier upgrades, including v2.3.4.
-- Historical logs retain pages_read; their positions are intentionally NULL
-- because a historical stopping page cannot be reconstructed reliably.
-- No new tables, roles, grants or sharing policies are created.
BEGIN;
ALTER TABLE public.reading_sessions
  ADD COLUMN IF NOT EXISTS start_page integer,
  ADD COLUMN IF NOT EXISTS end_page integer;
ALTER TABLE public.reading_sessions
  DROP CONSTRAINT IF EXISTS reading_sessions_page_positions_consistent;
ALTER TABLE public.reading_sessions
  ADD CONSTRAINT reading_sessions_page_positions_consistent CHECK (
    (start_page IS NULL AND end_page IS NULL)
    OR (start_page IS NOT NULL AND end_page IS NOT NULL AND
        log_type = 'pages' AND start_page >= 0 AND
        end_page > start_page AND pages_read = end_page - start_page)
  );
COMMENT ON COLUMN public.reading_sessions.start_page IS
  'Beginning print-edition page for a new Time + Ending Page log. NULL for legacy and non-page logs.';
COMMENT ON COLUMN public.reading_sessions.end_page IS
  'Page position reached at the end of the session, not pages progressed; NULL for legacy logs.';

-- Keep the existing owner and exact chapter-map checks, and additionally
-- enforce the selected edition's page count for newly saved end positions.
CREATE OR REPLACE FUNCTION public.validate_reading_session()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_owner uuid; v_book_pages integer; v_mapped bigint; v_pages bigint; v_required bigint;
BEGIN
  SELECT user_id, page_count INTO v_owner, v_book_pages
    FROM public.user_books WHERE id = NEW.user_book_id;
  IF v_owner IS NULL OR NEW.user_id <> v_owner THEN
    RAISE EXCEPTION 'The reading session must belong to the book owner.';
  END IF;
  IF NEW.log_type = 'chapters' THEN
    v_required := NEW.chapter_to - NEW.chapter_from + 1;
    SELECT count(cb.id), coalesce(sum(cb.end_page - cb.start_page + 1), 0)
      INTO v_mapped, v_pages
      FROM generate_series(NEW.chapter_from, NEW.chapter_to) chapter(n)
      LEFT JOIN public.chapter_boundaries cb
        ON cb.user_book_id = NEW.user_book_id AND cb.chapter_number = chapter.n;
    IF v_mapped <> v_required THEN
      RAISE EXCEPTION 'Exact page boundaries are required for every chapter.';
    END IF;
    NEW.pages_read := v_pages;
  ELSIF NEW.log_type = 'audio_position' THEN
    NEW.pages_read := NULL;
  ELSIF NEW.log_type = 'pages' AND NEW.end_page IS NOT NULL THEN
    IF v_book_pages IS NOT NULL AND NEW.end_page > v_book_pages THEN
      RAISE EXCEPTION 'Ending page exceeds the selected book edition page count.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
COMMIT;
NOTIFY pgrst, 'reload schema';
