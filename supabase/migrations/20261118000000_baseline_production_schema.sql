-- Baseline: the production schema as deployed on 2026-11-18.
--
-- Captured read-only with `supabase db dump --remote --schema public` from
-- project rgiylksdmfmftjtrgltn. Production was set up by hand-applying
-- legacy/supabase/*.sql, so this file (not those) is the source of truth.
-- Every schema change from here on is a new migration on top of this one.
--
-- Known follow-ups, deliberately NOT changed here so the baseline matches prod:
--   * Functions are executable by "anon" via Supabase default grants; all of
--     them check auth.uid(), but revoke anon EXECUTE as defense in depth (#6).
--   * Default privileges grant new tables to anon/authenticated (#6).




SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."can_view_full"("p_owner" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
 select p_owner=(select auth.uid()) or exists(
   select 1 from public.profile_shares sh
   where sh.owner_id=p_owner and sh.viewer_id=(select auth.uid())
     and sh.access_level='full'
 );
$$;


ALTER FUNCTION "public"."can_view_full"("p_owner" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_view_profile"("p_owner" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
 select p_owner=(select auth.uid()) or exists(
   select 1 from public.profile_shares sh
   where (sh.owner_id=p_owner and sh.viewer_id=(select auth.uid()))
      or (sh.owner_id=(select auth.uid()) and sh.viewer_id=p_owner)
 );
$$;


ALTER FUNCTION "public"."can_view_profile"("p_owner" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."chapter_isbn13"("p_input" "text") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO ''
    AS $_$
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
$_$;


ALTER FUNCTION "public"."chapter_isbn13"("p_input" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_profile_share_invite"("p_level" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_user uuid := auth.uid(); v_code text;
begin
 if v_user is null then raise exception 'Sign in first.'; end if;
 if p_level not in ('full','summary') then raise exception 'Invalid access level.'; end if;
 v_code:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,20));
 insert into public.profile_share_invites(owner_id,invite_code,access_level)
 values(v_user,v_code,p_level);
 return v_code;
end;
$$;


ALTER FUNCTION "public"."create_profile_share_invite"("p_level" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_reading_circle"() RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_user uuid := auth.uid(); v_id uuid;
begin
 if v_user is null then raise exception 'Sign in first.'; end if;
 if exists(select 1 from public.circle_members where user_id=v_user) then
   raise exception 'You already belong to a reading circle.';
 end if;
 insert into public.reading_circles(created_by) values(v_user) returning id into v_id;
 insert into public.circle_members(circle_id,user_id) values(v_id,v_user);
 return v_id;
end;
$$;


ALTER FUNCTION "public"."create_reading_circle"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_shared_chapter_maps"("p_isbn13" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."get_shared_chapter_maps"("p_isbn13" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_viewable_profile_summaries"("p_year" integer DEFAULT NULL::integer) RETURNS TABLE("owner_id" "uuid", "display_name" "text", "year" integer, "books_finished" bigint, "annual_goal" integer, "favorites_count" bigint, "average_rating" numeric, "reading_minutes" bigint, "audiobook_minutes" bigint, "combined_minutes" bigint, "total_minutes" bigint, "sessions_count" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
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
          and coalesce(nullif(substring(pass->>'finished_on' from 1 for 4), ''), pass->>'finished_year')=t.yr::text
          -- A completion is a historical fact independent of the date
          -- reliable reading-session logging began.
          and (
            (pass->>'finished_on' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
            or (nullif(pass->>'finished_on','') is null and pass->>'finished_year' ~ '^[0-9]{4}$')
          )
      ) or (b.read_history='[]'::jsonb and b.status='finished'
          and extract(year from b.finished_on)=t.yr))),
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
$_$;


ALTER FUNCTION "public"."get_viewable_profile_summaries"("p_year" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."in_reading_circle"("p_circle_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1 from public.circle_members cm
    where cm.circle_id=p_circle_id and cm.user_id=(select auth.uid())
  );
$$;


ALTER FUNCTION "public"."in_reading_circle"("p_circle_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."join_reading_circle"("p_invite_code" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_user uuid := auth.uid(); v_id uuid; v_count integer; v_partner uuid;
begin
 if v_user is null then raise exception 'Sign in first.'; end if;
 if exists(select 1 from public.circle_members where user_id=v_user) then
   raise exception 'You already belong to a reading circle.';
 end if;
 select id into v_id from public.reading_circles
 where invite_code=upper(trim(p_invite_code)) for update;
 if v_id is null then raise exception 'Invite code not found.'; end if;
 select count(*) into v_count from public.circle_members where circle_id=v_id;
 if v_count >= 2 then raise exception 'This reading circle is full.'; end if;
 select user_id into v_partner from public.circle_members where circle_id=v_id limit 1;
 insert into public.circle_members(circle_id,user_id) values(v_id,v_user);
 if v_partner is not null then
   insert into public.profile_shares(owner_id,viewer_id,access_level)
     values(v_partner,v_user,'full'),(v_user,v_partner,'full')
   on conflict(owner_id,viewer_id) do update set access_level='full',updated_at=now();
 end if;
 return v_id;
end;
$$;


ALTER FUNCTION "public"."join_reading_circle"("p_invite_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."on_new_reader"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
 insert into public.profiles(id,display_name)
 values (new.id,coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'),''), split_part(new.email,'@',1),'Reader'))
 on conflict(id) do nothing;
 return new;
end;
$$;


ALTER FUNCTION "public"."on_new_reader"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."publish_chapter_map"("p_user_book_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."publish_chapter_map"("p_user_book_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."redeem_profile_share_invite"("p_code" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_user uuid := auth.uid(); v_inv public.profile_share_invites%rowtype;
begin
 if v_user is null then raise exception 'Sign in first.'; end if;
 select * into v_inv from public.profile_share_invites
 where invite_code=upper(trim(p_code)) and redeemed_at is null
   and expires_at>now() for update;
 if v_inv.id is null then raise exception 'Code invalid, expired or already used.'; end if;
 if v_inv.owner_id=v_user then raise exception 'Cannot invite yourself.'; end if;
 insert into public.profile_shares(owner_id,viewer_id,access_level)
 values(v_inv.owner_id,v_user,v_inv.access_level)
 on conflict(owner_id,viewer_id) do update
 set access_level=excluded.access_level,updated_at=now();
 update public.profile_share_invites
 set redeemed_at=now(),redeemed_by=v_user where id=v_inv.id;
 return v_inv.owner_id;
end;
$$;


ALTER FUNCTION "public"."redeem_profile_share_invite"("p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."replace_book_chapter_map"("p_user_book_id" "uuid", "p_chapters" "jsonb") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
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
$_$;


ALTER FUNCTION "public"."replace_book_chapter_map"("p_user_book_id" "uuid", "p_chapters" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_profile_share_level"("p_viewer" "uuid", "p_level" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_user uuid := auth.uid();
begin
 if v_user is null then raise exception 'Sign in first.'; end if;
 if p_viewer=v_user then raise exception 'Cannot share with yourself.'; end if;
 if p_level='none' then
   delete from public.profile_shares where owner_id=v_user and viewer_id=p_viewer;
 elsif p_level in ('full','summary') then
   update public.profile_shares set access_level=p_level,updated_at=now()
   where owner_id=v_user and viewer_id=p_viewer;
   if not found then raise exception 'Share not found. Invite the user first.'; end if;
 else raise exception 'Invalid access level.'; end if;
end;
$$;


ALTER FUNCTION "public"."set_profile_share_level"("p_viewer" "uuid", "p_level" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."shares_reading_circle"("p_other_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1 from public.circle_members a
    join public.circle_members b on a.circle_id=b.circle_id
    where a.user_id=(select auth.uid()) and b.user_id=p_other_user_id
  );
$$;


ALTER FUNCTION "public"."shares_reading_circle"("p_other_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_chapter_boundary"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_owner uuid; v_page_count integer;
begin
 select user_id,page_count into v_owner,v_page_count
 from public.user_books where id=new.user_book_id;
 if v_owner is null or new.user_id<>v_owner then
    raise exception 'Chapter must belong to the book owner.';
 end if;
 if v_page_count is not null and new.end_page>v_page_count then
    raise exception 'Chapter ends after the last page of the edition.';
 end if;
 if exists (select 1 from public.chapter_boundaries cb
   where cb.user_book_id=new.user_book_id
   and cb.id<>new.id
   and new.start_page<=cb.end_page and new.end_page>=cb.start_page) then
    raise exception 'Chapter page ranges cannot overlap.';
 end if;
 return new;
end;
$$;


ALTER FUNCTION "public"."validate_chapter_boundary"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_reading_session"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."validate_reading_session"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."withdraw_chapter_map"("p_user_book_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."withdraw_chapter_map"("p_user_book_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."chapter_boundaries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "user_book_id" "uuid" NOT NULL,
    "chapter_number" integer NOT NULL,
    "chapter_label" "text",
    "start_page" integer NOT NULL,
    "end_page" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chapter_boundaries_chapter_number_check" CHECK (("chapter_number" > 0)),
    CONSTRAINT "chapter_boundaries_check" CHECK (("end_page" >= "start_page")),
    CONSTRAINT "chapter_boundaries_start_page_check" CHECK (("start_page" > 0))
);


ALTER TABLE "public"."chapter_boundaries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."circle_members" (
    "circle_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."circle_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profile_share_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "invite_code" "text" NOT NULL,
    "access_level" "text" NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '7 days'::interval) NOT NULL,
    "redeemed_by" "uuid",
    "redeemed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "profile_share_invites_access_level_check" CHECK (("access_level" = ANY (ARRAY['full'::"text", 'summary'::"text"])))
);


ALTER TABLE "public"."profile_share_invites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profile_shares" (
    "owner_id" "uuid" NOT NULL,
    "viewer_id" "uuid" NOT NULL,
    "access_level" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "profile_shares_access_level_check" CHECK (("access_level" = ANY (ARRAY['full'::"text", 'summary'::"text"]))),
    CONSTRAINT "profile_shares_check" CHECK (("owner_id" <> "viewer_id"))
);


ALTER TABLE "public"."profile_shares" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "display_name" "text" DEFAULT 'Reader'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tracking_start_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "tracking_start_goal_minutes" integer,
    CONSTRAINT "profiles_tracking_start_goal_minutes_check" CHECK ((("tracking_start_goal_minutes" >= 1) AND ("tracking_start_goal_minutes" <= 1440)))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reading_circles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invite_code" "text" DEFAULT "upper"("substr"("replace"(("gen_random_uuid"())::"text", '-'::"text", ''::"text"), 1, 16)) NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."reading_circles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reading_goal_history" (
    "user_id" "uuid" NOT NULL,
    "effective_date" "date" NOT NULL,
    "target_minutes" integer NOT NULL,
    "changed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "reading_goal_history_target_minutes_check" CHECK ((("target_minutes" >= 1) AND ("target_minutes" <= 1440)))
);


ALTER TABLE "public"."reading_goal_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reading_goals" (
    "user_id" "uuid" NOT NULL,
    "year" integer NOT NULL,
    "books_target" integer DEFAULT 12 NOT NULL,
    "daily_minutes_target" integer DEFAULT 30 NOT NULL,
    CONSTRAINT "reading_goals_books_target_check" CHECK ((("books_target" >= 1) AND ("books_target" <= 10000))),
    CONSTRAINT "reading_goals_daily_minutes_target_check" CHECK ((("daily_minutes_target" >= 1) AND ("daily_minutes_target" <= 1440))),
    CONSTRAINT "reading_goals_year_check" CHECK ((("year" >= 1900) AND ("year" <= 2200)))
);


ALTER TABLE "public"."reading_goals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reading_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "user_book_id" "uuid" NOT NULL,
    "session_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "duration_minutes" integer NOT NULL,
    "log_type" "text" NOT NULL,
    "pages_read" integer,
    "chapter_from" integer,
    "chapter_to" integer,
    "notes" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "activity_mode" "text" DEFAULT 'reading'::"text" NOT NULL,
    "audio_start_minute" integer,
    "audio_end_minute" integer,
    "start_local_time" time without time zone,
    "read_number" integer DEFAULT 1 NOT NULL,
    "start_page" integer,
    "end_page" integer,
    CONSTRAINT "reading_sessions_duration_minutes_check" CHECK (("duration_minutes" > 0)),
    CONSTRAINT "reading_sessions_page_positions_consistent" CHECK (((("start_page" IS NULL) AND ("end_page" IS NULL)) OR (("start_page" IS NOT NULL) AND ("end_page" IS NOT NULL) AND ("log_type" = 'pages'::"text") AND ("start_page" >= 0) AND ("end_page" > "start_page") AND ("pages_read" = ("end_page" - "start_page"))))),
    CONSTRAINT "reading_sessions_read_number_positive" CHECK ((("read_number" >= 1) AND ("read_number" <= 9999))),
    CONSTRAINT "valid_reading_session_fields" CHECK ((("activity_mode" = ANY (ARRAY['reading'::"text", 'audiobook'::"text", 'read_listen'::"text"])) AND ((("log_type" = 'pages'::"text") AND ("pages_read" > 0) AND ("chapter_from" IS NULL) AND ("chapter_to" IS NULL) AND ("audio_start_minute" IS NULL) AND ("audio_end_minute" IS NULL)) OR (("log_type" = 'chapters'::"text") AND ("chapter_from" > 0) AND ("chapter_to" >= "chapter_from") AND ("pages_read" > 0) AND ("audio_start_minute" IS NULL) AND ("audio_end_minute" IS NULL)) OR (("log_type" = 'audio_position'::"text") AND ("activity_mode" = ANY (ARRAY['audiobook'::"text", 'read_listen'::"text"])) AND ("pages_read" IS NULL) AND ("chapter_from" IS NULL) AND ("chapter_to" IS NULL) AND ("audio_start_minute" >= 0) AND ("audio_end_minute" > "audio_start_minute")))))
);


ALTER TABLE "public"."reading_sessions" OWNER TO "postgres";


COMMENT ON COLUMN "public"."reading_sessions"."pages_read" IS 'Pages progressed in selected print edition. For audiobook activity: page-equivalents, not physically read pages. NULL when only audio positions are known. Chapter pages use exact mapped boundaries only.';



COMMENT ON COLUMN "public"."reading_sessions"."read_number" IS 'Reading pass of the associated book. Defaults to pass 1 for legacy sessions; pass 2+ indicates a user-started reread.';



COMMENT ON COLUMN "public"."reading_sessions"."start_page" IS 'Beginning print-edition page for a new Time + Ending Page log. NULL for legacy and non-page logs.';



COMMENT ON COLUMN "public"."reading_sessions"."end_page" IS 'Page position reached at the end of the session, not pages progressed; NULL for legacy logs.';



CREATE TABLE IF NOT EXISTS "public"."shared_chapter_maps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contributor_id" "uuid" NOT NULL,
    "isbn13" "text" NOT NULL,
    "page_count" integer,
    "chapter_data" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "shared_chapter_maps_chapter_data_check" CHECK (("jsonb_typeof"("chapter_data") = 'array'::"text")),
    CONSTRAINT "shared_chapter_maps_isbn13_check" CHECK (("isbn13" ~ '^[0-9]{13}$'::"text")),
    CONSTRAINT "shared_chapter_maps_page_count_check" CHECK ((("page_count" IS NULL) OR ("page_count" > 0)))
);


ALTER TABLE "public"."shared_chapter_maps" OWNER TO "postgres";


COMMENT ON TABLE "public"."shared_chapter_maps" IS 'Opt-in edition-specific chapter boundaries; contributor identity and source book data are not exposed by the read RPC.';



CREATE TABLE IF NOT EXISTS "public"."shelf_settings" (
    "user_id" "uuid" NOT NULL,
    "finish" "text" DEFAULT 'walnut'::"text" NOT NULL,
    "display_mode" "text" DEFAULT 'covers'::"text" NOT NULL,
    "decor" "text" DEFAULT 'cozy'::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "shelf_settings_decor_check" CHECK (("decor" = ANY (ARRAY['cozy'::"text", 'plant'::"text", 'minimal'::"text"]))),
    CONSTRAINT "shelf_settings_display_mode_check" CHECK (("display_mode" = ANY (ARRAY['covers'::"text", 'spines'::"text", 'mix'::"text"]))),
    CONSTRAINT "shelf_settings_finish_check" CHECK (("finish" = ANY (ARRAY['walnut'::"text", 'oak'::"text", 'slate'::"text"])))
);


ALTER TABLE "public"."shelf_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_books" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "author" "text" DEFAULT ''::"text" NOT NULL,
    "work_key" "text",
    "edition_key" "text",
    "isbn" "text",
    "description" "text",
    "published_year" integer,
    "publisher" "text",
    "page_count" integer,
    "height_mm" numeric,
    "thickness_mm" numeric,
    "cover_url" "text",
    "genres" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "series_name" "text",
    "series_number" numeric,
    "status" "text" DEFAULT 'tbr'::"text" NOT NULL,
    "favorite" boolean DEFAULT false NOT NULL,
    "rating" numeric(3,2),
    "started_on" "date",
    "finished_on" "date",
    "current_page" integer DEFAULT 0 NOT NULL,
    "shelf_order" integer DEFAULT 0 NOT NULL,
    "notes" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tbr_added_on" "date",
    "read_history" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "binding" "text",
    "edition_year" integer,
    "original_published_year" integer,
    "goodreads_added_on" "date",
    "asin" "text",
    "series_total" integer,
    "series_total_source" "text",
    "series_source_url" "text",
    CONSTRAINT "user_books_current_page_check" CHECK (("current_page" >= 0)),
    CONSTRAINT "user_books_height_mm_check" CHECK ((("height_mm" IS NULL) OR ("height_mm" > (0)::numeric))),
    CONSTRAINT "user_books_page_count_check" CHECK ((("page_count" IS NULL) OR ("page_count" > 0))),
    CONSTRAINT "user_books_rating_check" CHECK ((("rating" IS NULL) OR ((("rating" >= 0.25) AND ("rating" <= (5)::numeric)) AND (("rating" * (4)::numeric) = "trunc"(("rating" * (4)::numeric)))))),
    CONSTRAINT "user_books_read_history_array" CHECK (("jsonb_typeof"("read_history") = 'array'::"text")),
    CONSTRAINT "user_books_series_total_range" CHECK ((("series_total" IS NULL) OR (("series_total" >= 1) AND ("series_total" <= 500)))),
    CONSTRAINT "user_books_series_total_source_check" CHECK ((("series_total_source" IS NULL) OR ("series_total_source" = ANY (ARRAY['manual'::"text", 'listofbooks'::"text"])))),
    CONSTRAINT "user_books_status_check" CHECK (("status" = ANY (ARRAY['tbr'::"text", 'reading'::"text", 'finished'::"text", 'dnf'::"text"]))),
    CONSTRAINT "user_books_thickness_mm_check" CHECK ((("thickness_mm" IS NULL) OR ("thickness_mm" > (0)::numeric)))
);


ALTER TABLE "public"."user_books" OWNER TO "postgres";


COMMENT ON COLUMN "public"."user_books"."read_history" IS 'Explicit reading passes, including their immutable past completion dates. Legacy books with an empty array represent one implicit pass; historical rereads are NEVER inferred.';



COMMENT ON COLUMN "public"."user_books"."binding" IS 'Goodreads Binding or provider-reported physical format, never inferred from Google Books printType BOOK.';



COMMENT ON COLUMN "public"."user_books"."edition_year" IS 'Publication year for this print/digital edition, when directly recorded or matched.';



COMMENT ON COLUMN "public"."user_books"."original_published_year" IS 'First published year of the work, distinct from edition publication year; never inferred from a reading session.';



ALTER TABLE ONLY "public"."chapter_boundaries"
    ADD CONSTRAINT "chapter_boundaries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chapter_boundaries"
    ADD CONSTRAINT "chapter_boundaries_user_book_id_chapter_number_key" UNIQUE ("user_book_id", "chapter_number");



ALTER TABLE ONLY "public"."circle_members"
    ADD CONSTRAINT "circle_members_pkey" PRIMARY KEY ("circle_id", "user_id");



ALTER TABLE ONLY "public"."circle_members"
    ADD CONSTRAINT "circle_members_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."profile_share_invites"
    ADD CONSTRAINT "profile_share_invites_invite_code_key" UNIQUE ("invite_code");



ALTER TABLE ONLY "public"."profile_share_invites"
    ADD CONSTRAINT "profile_share_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profile_shares"
    ADD CONSTRAINT "profile_shares_pkey" PRIMARY KEY ("owner_id", "viewer_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reading_circles"
    ADD CONSTRAINT "reading_circles_invite_code_key" UNIQUE ("invite_code");



ALTER TABLE ONLY "public"."reading_circles"
    ADD CONSTRAINT "reading_circles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reading_goal_history"
    ADD CONSTRAINT "reading_goal_history_pkey" PRIMARY KEY ("user_id", "effective_date");



ALTER TABLE ONLY "public"."reading_goals"
    ADD CONSTRAINT "reading_goals_pkey" PRIMARY KEY ("user_id", "year");



ALTER TABLE ONLY "public"."reading_sessions"
    ADD CONSTRAINT "reading_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shared_chapter_maps"
    ADD CONSTRAINT "shared_chapter_maps_contributor_id_isbn13_key" UNIQUE ("contributor_id", "isbn13");



ALTER TABLE ONLY "public"."shared_chapter_maps"
    ADD CONSTRAINT "shared_chapter_maps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shelf_settings"
    ADD CONSTRAINT "shelf_settings_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."user_books"
    ADD CONSTRAINT "user_books_pkey" PRIMARY KEY ("id");



CREATE INDEX "chapter_boundaries_book_idx" ON "public"."chapter_boundaries" USING "btree" ("user_book_id", "chapter_number");



CREATE INDEX "profile_share_invites_owner_idx" ON "public"."profile_share_invites" USING "btree" ("owner_id");



CREATE INDEX "profile_shares_viewer_idx" ON "public"."profile_shares" USING "btree" ("viewer_id", "owner_id");



CREATE INDEX "reading_goal_history_user_effective_idx" ON "public"."reading_goal_history" USING "btree" ("user_id", "effective_date" DESC);



CREATE INDEX "reading_sessions_book_date_idx" ON "public"."reading_sessions" USING "btree" ("user_book_id", "session_date");



CREATE INDEX "reading_sessions_mode_idx" ON "public"."reading_sessions" USING "btree" ("user_id", "activity_mode", "session_date");



CREATE INDEX "reading_sessions_user_date_idx" ON "public"."reading_sessions" USING "btree" ("user_id", "session_date");



CREATE INDEX "shared_chapter_maps_isbn_idx" ON "public"."shared_chapter_maps" USING "btree" ("isbn13", "updated_at" DESC);



CREATE INDEX "user_books_user_idx" ON "public"."user_books" USING "btree" ("user_id", "status");



CREATE OR REPLACE TRIGGER "chapter_boundary_validated" BEFORE INSERT OR UPDATE ON "public"."chapter_boundaries" FOR EACH ROW EXECUTE FUNCTION "public"."validate_chapter_boundary"();



CREATE OR REPLACE TRIGGER "reading_session_validated" BEFORE INSERT OR UPDATE ON "public"."reading_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."validate_reading_session"();



ALTER TABLE ONLY "public"."chapter_boundaries"
    ADD CONSTRAINT "chapter_boundaries_user_book_id_fkey" FOREIGN KEY ("user_book_id") REFERENCES "public"."user_books"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chapter_boundaries"
    ADD CONSTRAINT "chapter_boundaries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."circle_members"
    ADD CONSTRAINT "circle_members_circle_id_fkey" FOREIGN KEY ("circle_id") REFERENCES "public"."reading_circles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."circle_members"
    ADD CONSTRAINT "circle_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profile_share_invites"
    ADD CONSTRAINT "profile_share_invites_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profile_share_invites"
    ADD CONSTRAINT "profile_share_invites_redeemed_by_fkey" FOREIGN KEY ("redeemed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."profile_shares"
    ADD CONSTRAINT "profile_shares_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profile_shares"
    ADD CONSTRAINT "profile_shares_viewer_id_fkey" FOREIGN KEY ("viewer_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reading_circles"
    ADD CONSTRAINT "reading_circles_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reading_goal_history"
    ADD CONSTRAINT "reading_goal_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reading_goals"
    ADD CONSTRAINT "reading_goals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reading_sessions"
    ADD CONSTRAINT "reading_sessions_user_book_id_fkey" FOREIGN KEY ("user_book_id") REFERENCES "public"."user_books"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reading_sessions"
    ADD CONSTRAINT "reading_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shared_chapter_maps"
    ADD CONSTRAINT "shared_chapter_maps_contributor_id_fkey" FOREIGN KEY ("contributor_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shelf_settings"
    ADD CONSTRAINT "shelf_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_books"
    ADD CONSTRAINT "user_books_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Add own chapter maps" ON "public"."chapter_boundaries" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Add own sessions" ON "public"."reading_sessions" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Add to own library" ON "public"."user_books" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Create own bookshelf settings" ON "public"."shelf_settings" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Delete from own library" ON "public"."user_books" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Delete own chapter maps" ON "public"."chapter_boundaries" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Delete own sessions" ON "public"."reading_sessions" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Edit own bookshelf settings" ON "public"."shelf_settings" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Edit own profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Edit own sessions" ON "public"."reading_sessions" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Insert own goal history" ON "public"."reading_goal_history" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("effective_date" = CURRENT_DATE)));



CREATE POLICY "Insert own reading goals" ON "public"."reading_goals" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Read members of own circle" ON "public"."circle_members" FOR SELECT TO "authenticated" USING ("public"."in_reading_circle"("circle_id"));



CREATE POLICY "Read own circle" ON "public"."reading_circles" FOR SELECT TO "authenticated" USING ("public"."in_reading_circle"("id"));



CREATE POLICY "Read own or full-share bookshelf settings" ON "public"."shelf_settings" FOR SELECT TO "authenticated" USING ("public"."can_view_full"("user_id"));



CREATE POLICY "Read own or full-share chapter maps" ON "public"."chapter_boundaries" FOR SELECT TO "authenticated" USING ("public"."can_view_full"("user_id"));



CREATE POLICY "Read own or full-share goal history" ON "public"."reading_goal_history" FOR SELECT TO "authenticated" USING ("public"."can_view_full"("user_id"));



CREATE POLICY "Read own or full-share goals" ON "public"."reading_goals" FOR SELECT TO "authenticated" USING ("public"."can_view_full"("user_id"));



CREATE POLICY "Read own or full-share libraries" ON "public"."user_books" FOR SELECT TO "authenticated" USING ("public"."can_view_full"("user_id"));



CREATE POLICY "Read own or full-share sessions" ON "public"."reading_sessions" FOR SELECT TO "authenticated" USING ("public"."can_view_full"("user_id"));



CREATE POLICY "See self and explicitly shared profiles" ON "public"."profiles" FOR SELECT TO "authenticated" USING ("public"."can_view_profile"("id"));



CREATE POLICY "Update own chapter maps" ON "public"."chapter_boundaries" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Update own goal history for today" ON "public"."reading_goal_history" FOR UPDATE TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("effective_date" = CURRENT_DATE))) WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("effective_date" = CURRENT_DATE)));



CREATE POLICY "Update own library" ON "public"."user_books" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Update own reading goals" ON "public"."reading_goals" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "View own invites" ON "public"."profile_share_invites" FOR SELECT TO "authenticated" USING (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "View shares involving me" ON "public"."profile_shares" FOR SELECT TO "authenticated" USING ((("owner_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("viewer_id" = ( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."chapter_boundaries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."circle_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profile_share_invites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profile_shares" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reading_circles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reading_goal_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reading_goals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reading_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shared_chapter_maps" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shelf_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_books" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_view_full"("p_owner" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_view_full"("p_owner" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_view_full"("p_owner" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_view_full"("p_owner" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_view_profile"("p_owner" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_view_profile"("p_owner" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_view_profile"("p_owner" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_view_profile"("p_owner" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."chapter_isbn13"("p_input" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."chapter_isbn13"("p_input" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."chapter_isbn13"("p_input" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."chapter_isbn13"("p_input" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_profile_share_invite"("p_level" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_profile_share_invite"("p_level" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_profile_share_invite"("p_level" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_profile_share_invite"("p_level" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_reading_circle"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_reading_circle"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_reading_circle"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_reading_circle"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_shared_chapter_maps"("p_isbn13" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_shared_chapter_maps"("p_isbn13" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_shared_chapter_maps"("p_isbn13" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_shared_chapter_maps"("p_isbn13" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_viewable_profile_summaries"("p_year" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_viewable_profile_summaries"("p_year" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_viewable_profile_summaries"("p_year" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_viewable_profile_summaries"("p_year" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."in_reading_circle"("p_circle_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."in_reading_circle"("p_circle_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."in_reading_circle"("p_circle_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."in_reading_circle"("p_circle_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."join_reading_circle"("p_invite_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."join_reading_circle"("p_invite_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."join_reading_circle"("p_invite_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."join_reading_circle"("p_invite_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."on_new_reader"() TO "anon";
GRANT ALL ON FUNCTION "public"."on_new_reader"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."on_new_reader"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."publish_chapter_map"("p_user_book_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."publish_chapter_map"("p_user_book_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."publish_chapter_map"("p_user_book_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."publish_chapter_map"("p_user_book_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."redeem_profile_share_invite"("p_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."redeem_profile_share_invite"("p_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."redeem_profile_share_invite"("p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."redeem_profile_share_invite"("p_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."replace_book_chapter_map"("p_user_book_id" "uuid", "p_chapters" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."replace_book_chapter_map"("p_user_book_id" "uuid", "p_chapters" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."replace_book_chapter_map"("p_user_book_id" "uuid", "p_chapters" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."replace_book_chapter_map"("p_user_book_id" "uuid", "p_chapters" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_profile_share_level"("p_viewer" "uuid", "p_level" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_profile_share_level"("p_viewer" "uuid", "p_level" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."set_profile_share_level"("p_viewer" "uuid", "p_level" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_profile_share_level"("p_viewer" "uuid", "p_level" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."shares_reading_circle"("p_other_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."shares_reading_circle"("p_other_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."shares_reading_circle"("p_other_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."shares_reading_circle"("p_other_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_chapter_boundary"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_chapter_boundary"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_chapter_boundary"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_reading_session"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_reading_session"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_reading_session"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."withdraw_chapter_map"("p_user_book_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."withdraw_chapter_map"("p_user_book_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."withdraw_chapter_map"("p_user_book_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."withdraw_chapter_map"("p_user_book_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."chapter_boundaries" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."chapter_boundaries" TO "authenticated";



GRANT ALL ON TABLE "public"."circle_members" TO "service_role";
GRANT SELECT ON TABLE "public"."circle_members" TO "authenticated";



GRANT ALL ON TABLE "public"."profile_share_invites" TO "service_role";
GRANT SELECT ON TABLE "public"."profile_share_invites" TO "authenticated";



GRANT ALL ON TABLE "public"."profile_shares" TO "service_role";
GRANT SELECT ON TABLE "public"."profile_shares" TO "authenticated";



GRANT ALL ON TABLE "public"."profiles" TO "service_role";
GRANT SELECT,UPDATE ON TABLE "public"."profiles" TO "authenticated";



GRANT ALL ON TABLE "public"."reading_circles" TO "service_role";
GRANT SELECT ON TABLE "public"."reading_circles" TO "authenticated";



GRANT ALL ON TABLE "public"."reading_goal_history" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."reading_goal_history" TO "authenticated";



GRANT ALL ON TABLE "public"."reading_goals" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."reading_goals" TO "authenticated";



GRANT ALL ON TABLE "public"."reading_sessions" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."reading_sessions" TO "authenticated";



GRANT ALL ON TABLE "public"."shared_chapter_maps" TO "service_role";



GRANT ALL ON TABLE "public"."shelf_settings" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."shelf_settings" TO "authenticated";



GRANT ALL ON TABLE "public"."user_books" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."user_books" TO "authenticated";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";








-- Lives in the auth schema, so `db dump --schema public` does not include it.
-- Creates a profiles row for every new sign-up.
CREATE OR REPLACE TRIGGER "on_auth_reader_created" AFTER INSERT ON "auth"."users" FOR EACH ROW EXECUTE FUNCTION "public"."on_new_reader"();

-- Table privileges exactly as they are in production.
-- pg_dump only emits GRANTs, but on a fresh Supabase database CREATE TABLE
-- also picks up the default privileges (ALL to anon and authenticated), so
-- without these revokes a replay would be more permissive than production.
REVOKE ALL ON TABLE
  "public"."chapter_boundaries", "public"."circle_members", "public"."profile_share_invites",
  "public"."profile_shares", "public"."profiles", "public"."reading_circles",
  "public"."reading_goal_history", "public"."reading_goals", "public"."reading_sessions",
  "public"."shared_chapter_maps", "public"."shelf_settings", "public"."user_books"
FROM "anon", "authenticated";

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  "public"."chapter_boundaries", "public"."reading_sessions", "public"."user_books"
TO "authenticated";
GRANT SELECT, INSERT, UPDATE ON TABLE
  "public"."reading_goal_history", "public"."reading_goals", "public"."shelf_settings"
TO "authenticated";
GRANT SELECT, UPDATE ON TABLE "public"."profiles" TO "authenticated";
GRANT SELECT ON TABLE
  "public"."circle_members", "public"."profile_share_invites", "public"."profile_shares",
  "public"."reading_circles"
TO "authenticated";
-- shared_chapter_maps: no direct table access; read through get_shared_chapter_maps().
