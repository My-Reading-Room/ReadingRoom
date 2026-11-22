-- Defense in depth (#6). Signed-out visitors (anon) never need the database
-- directly: every page requires sign-in, and Supabase Auth has its own API.
--
-- 1. Functions: every public function was executable by anon (and PUBLIC).
--    They all check auth.uid() themselves, so nothing leaked, but the grant
--    shouldn't exist. Only signed-in readers (and the server's service role)
--    may call them. Trigger functions need no EXECUTE grant to fire.
-- 2. Defaults: tables, sequences and functions created later by migrations
--    were automatically granted to anon. New objects now start closed to anon
--    (signed-in readers keep Supabase's default access; RLS still applies).

revoke execute on all functions in schema public from anon, public;

grant execute on function
  public.can_view_full(uuid),
  public.can_view_profile(uuid),
  public.chapter_isbn13(text),
  public.create_profile_share_invite(text),
  public.create_reading_circle(),
  public.get_shared_chapter_maps(text),
  public.get_viewable_profile_summaries(integer),
  public.in_reading_circle(uuid),
  public.join_reading_circle(text),
  public.publish_chapter_map(uuid),
  public.redeem_profile_share_invite(text),
  public.replace_book_chapter_map(uuid, jsonb),
  public.set_profile_share_level(uuid, text),
  public.shares_reading_circle(uuid),
  public.withdraw_chapter_map(uuid)
to authenticated, service_role;

alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke execute on functions from anon;
-- PostgreSQL's built-in "functions are executable by PUBLIC" default can only
-- be removed role-wide, not per schema.
alter default privileges for role postgres revoke execute on functions from public;
