-- My Reading Room v2.3.8: edition-specific, opt-in community chapter mappings.
-- BACK UP FIRST. Run after the v2.3.4 and v2.3.6 upgrades on existing v2.3.3 installs.
-- Only the current owner's verified chapter boundaries can be published.
-- Other readers must explicitly review shared candidates before saving locally.
-- No source images, reading history, or public contributor identities are shared.
BEGIN;

CREATE OR REPLACE FUNCTION public.chapter_isbn13(p_input text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE v_text text; v_check integer:=0; v_i integer; v_digit integer; v_first12 text;
BEGIN
 v_text := regexp_replace(upper(coalesce(p_input,'')), '[^0-9X]', '', 'g');
 IF v_text ~ '^[0-9]{13}$' THEN
   FOR v_i IN 1..13 LOOP
     v_check := v_check + substring(v_text,v_i,1)::integer * CASE WHEN v_i % 2=0 THEN 3 ELSE 1 END;
   END LOOP;
   IF v_check % 10=0 THEN RETURN v_text; END IF;
 ELSIF v_text ~ '^[0-9]{9}[0-9X]$' THEN
   FOR v_i IN 1..10 LOOP
     v_digit := CASE WHEN substring(v_text,v_i,1)='X' THEN 10 ELSE substring(v_text,v_i,1)::integer END;
     v_check := v_check + (11-v_i)*v_digit;
   END LOOP;
   IF v_check % 11<>0 THEN RETURN NULL; END IF;
   v_first12 := '978' || substring(v_text,1,9);
   v_check := 0;
   FOR v_i IN 1..12 LOOP
     v_check := v_check + substring(v_first12,v_i,1)::integer * CASE WHEN v_i % 2=0 THEN 3 ELSE 1 END;
   END LOOP;
   RETURN v_first12 || ((10-(v_check%10))%10)::text;
 END IF;
 RETURN NULL;
END;
$$;

CREATE TABLE IF NOT EXISTS public.shared_chapter_maps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contributor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  isbn13 text NOT NULL CHECK(isbn13 ~ '^[0-9]{13}$'),
  page_count integer CHECK(page_count IS NULL OR page_count > 0),
  chapter_data jsonb NOT NULL CHECK(jsonb_typeof(chapter_data)='array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(contributor_id,isbn13)
);
CREATE INDEX IF NOT EXISTS shared_chapter_maps_isbn_idx ON public.shared_chapter_maps(isbn13,updated_at DESC);
ALTER TABLE public.shared_chapter_maps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shared_chapter_maps FROM PUBLIC, anon, authenticated;
-- No direct table grants or RLS access. Security-definer RPCs return sanitized
-- mappings only, and verify ownership before writing.

CREATE OR REPLACE FUNCTION public.replace_book_chapter_map(p_user_book_id uuid, p_chapters jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user uuid; v_page_count integer; v_owner uuid; v_item jsonb;
        v_number integer; v_start integer; v_end integer; v_previous_end integer:=0; v_idx integer:=0;
BEGIN
 v_user := (SELECT auth.uid());
 SELECT user_id,page_count INTO v_owner,v_page_count FROM public.user_books
   WHERE id=p_user_book_id FOR UPDATE;
 IF v_user IS NULL OR v_owner IS DISTINCT FROM v_user THEN RAISE EXCEPTION 'Only the book owner can save a chapter map.'; END IF;
 IF p_chapters IS NULL OR jsonb_typeof(p_chapters)<>'array' OR
    jsonb_array_length(p_chapters) NOT BETWEEN 1 AND 300 THEN
   RAISE EXCEPTION 'Choose 1–300 verified chapters.';
 END IF;
 -- Validate everything before deleting a single existing mapping row.
 FOR v_item IN SELECT value FROM jsonb_array_elements(p_chapters) LOOP
   v_idx := v_idx+1;
   IF jsonb_typeof(v_item)<>'object' OR
      coalesce(v_item->>'chapter_number','') !~ '^[0-9]{1,4}$' OR
      coalesce(v_item->>'start_page','') !~ '^[0-9]{1,6}$' OR
      coalesce(v_item->>'end_page','') !~ '^[0-9]{1,6}$' THEN
     RAISE EXCEPTION 'Every chapter needs an integer chapter number and exact start/end page.';
   END IF;
   v_number := (v_item->>'chapter_number')::integer;
   v_start := (v_item->>'start_page')::integer;
   v_end := (v_item->>'end_page')::integer;
   IF v_number<>v_idx OR v_start<1 OR v_end<v_start OR v_start<=v_previous_end OR
      (v_page_count IS NOT NULL AND v_end>v_page_count) THEN
     RAISE EXCEPTION 'Chapter numbers must be sequential and page boundaries exact, ordered, non-overlapping, and within the book.';
   END IF;
   v_previous_end:=v_end;
 END LOOP;
 DELETE FROM public.chapter_boundaries WHERE user_book_id=p_user_book_id;
 FOR v_item IN SELECT value FROM jsonb_array_elements(p_chapters) LOOP
   v_number:=(v_item->>'chapter_number')::integer;
   INSERT INTO public.chapter_boundaries(user_id,user_book_id,chapter_number,chapter_label,start_page,end_page)
     VALUES (v_user,p_user_book_id,v_number,
       left(coalesce(nullif(trim(v_item->>'chapter_label'),''),'Chapter '||v_number),180),
       (v_item->>'start_page')::integer,(v_item->>'end_page')::integer);
 END LOOP;
 RETURN v_idx;
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_chapter_map(p_user_book_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user uuid; v_owner uuid; v_isbn text; v_page_count integer;
        v_count integer; v_bad integer; v_chapters jsonb; v_result uuid;
BEGIN
 v_user:=(SELECT auth.uid());
 SELECT b.user_id,public.chapter_isbn13(b.isbn),b.page_count
   INTO v_owner,v_isbn,v_page_count FROM public.user_books b WHERE id=p_user_book_id FOR UPDATE;
 IF v_user IS NULL OR v_owner IS DISTINCT FROM v_user THEN RAISE EXCEPTION 'Only the book owner can publish their chapter map.'; END IF;
 IF v_isbn IS NULL THEN RAISE EXCEPTION 'Save a valid ISBN for this edition before sharing.'; END IF;
 SELECT count(*),jsonb_agg(jsonb_build_object(
   'chapter_number',chapter_number,'chapter_label',chapter_label,
   'start_page',start_page,'end_page',end_page) ORDER BY chapter_number)
 INTO v_count,v_chapters FROM public.chapter_boundaries WHERE user_book_id=p_user_book_id;
 IF v_count NOT BETWEEN 1 AND 300 THEN RAISE EXCEPTION 'Add a verified chapter map before sharing.'; END IF;
 SELECT count(*) INTO v_bad FROM (
   SELECT chapter_number,start_page,end_page,
     row_number() OVER (ORDER BY chapter_number) AS rn,
     lag(end_page) OVER (ORDER BY chapter_number) AS previous_end
   FROM public.chapter_boundaries WHERE user_book_id=p_user_book_id
 ) c WHERE c.chapter_number<>c.rn OR c.start_page<=coalesce(c.previous_end,0)
   OR (v_page_count IS NOT NULL AND c.end_page>v_page_count);
 IF v_bad>0 THEN RAISE EXCEPTION 'The chapter map must be sequential and ordered before sharing.'; END IF;
 INSERT INTO public.shared_chapter_maps(contributor_id,isbn13,page_count,chapter_data)
   VALUES(v_user,v_isbn,v_page_count,v_chapters)
   ON CONFLICT (contributor_id,isbn13) DO UPDATE SET
    page_count=excluded.page_count,chapter_data=excluded.chapter_data,updated_at=now()
 RETURNING id INTO v_result;
 RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_shared_chapter_maps(p_isbn13 text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_isbn text; v_result jsonb;
BEGIN
 IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'Sign in to browse community chapter maps.'; END IF;
 v_isbn:=public.chapter_isbn13(p_isbn13);
 IF v_isbn IS NULL THEN RETURN '[]'::jsonb; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',q.id,'isbn13',q.isbn13,'page_count',q.page_count,
   'chapters',q.chapter_data,'updated_at',q.updated_at)
   ORDER BY q.updated_at DESC),'[]'::jsonb) INTO v_result
 FROM (SELECT id,isbn13,page_count,chapter_data,updated_at
   FROM public.shared_chapter_maps WHERE isbn13=v_isbn
   ORDER BY updated_at DESC LIMIT 8) q;
 RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.withdraw_chapter_map(p_user_book_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user uuid; v_owner uuid; v_isbn text; v_count integer;
BEGIN
 v_user:=(SELECT auth.uid());
 SELECT user_id,public.chapter_isbn13(isbn) INTO v_owner,v_isbn
   FROM public.user_books WHERE id=p_user_book_id;
 IF v_user IS NULL OR v_owner IS DISTINCT FROM v_user THEN RAISE EXCEPTION 'Only the book owner can withdraw their shared map.'; END IF;
 IF v_isbn IS NULL THEN RAISE EXCEPTION 'This edition does not have a valid ISBN.'; END IF;
 DELETE FROM public.shared_chapter_maps WHERE contributor_id=v_user AND isbn13=v_isbn;
 GET DIAGNOSTICS v_count=ROW_COUNT;
 RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.chapter_isbn13(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_book_chapter_map(uuid,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.publish_chapter_map(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_shared_chapter_maps(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.withdraw_chapter_map(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_book_chapter_map(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_chapter_map(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_shared_chapter_maps(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_chapter_map(uuid) TO authenticated;
COMMENT ON TABLE public.shared_chapter_maps IS 'Opt-in edition-specific chapter boundaries; contributor identity and source book data are not exposed by the read RPC.';
COMMIT;
NOTIFY pgrst, 'reload schema';
