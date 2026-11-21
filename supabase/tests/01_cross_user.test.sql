-- One reader can never read or change another reader's private rows (#6).
-- Two throwaway readers are created inside this transaction and rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

-- Act as a signed-in reader, the way PostgREST does for a request. Call it
-- after `reset role` (as a new request would): new functions aren't
-- executable by everyone (20261121000000_revoke_anon_access.sql).
create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'a@rls.test', '{"display_name":"Reader A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'b@rls.test', '{"display_name":"Reader B"}', now(), now());

-- Reader A's data (written as the database owner).
insert into public.user_books (id, user_id, title, page_count, notes)
values ('aaaaaaaa-1111-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'A private book', 300, 'private note');
insert into public.reading_sessions (user_id, user_book_id, duration_minutes, log_type, session_date)
values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-1111-4000-8000-000000000001', 30, 'pages', current_date);
insert into public.chapter_boundaries (user_id, user_book_id, chapter_number, start_page, end_page)
values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-1111-4000-8000-000000000001', 1, 1, 20);
insert into public.reading_goals (user_id, year) values ('aaaaaaaa-0000-4000-8000-000000000001', 2026);
insert into public.reading_goal_history (user_id, effective_date, target_minutes)
values ('aaaaaaaa-0000-4000-8000-000000000001', current_date, 30);
insert into public.shelf_settings (user_id) values ('aaaaaaaa-0000-4000-8000-000000000001');

-- ---------------------------------------------------------------------------
-- Reader B, with no share from A.
reset role;
select pg_temp.sign_in('bbbbbbbb-0000-4000-8000-000000000002');

select is_empty($$ select 1 from public.user_books where user_id = 'aaaaaaaa-0000-4000-8000-000000000001' $$, 'B cannot see A''s books');
select is_empty($$ select 1 from public.reading_sessions where user_id = 'aaaaaaaa-0000-4000-8000-000000000001' $$, 'B cannot see A''s sessions');
select is_empty($$ select 1 from public.chapter_boundaries where user_id = 'aaaaaaaa-0000-4000-8000-000000000001' $$, 'B cannot see A''s chapter maps');
select is_empty($$ select 1 from public.reading_goals where user_id = 'aaaaaaaa-0000-4000-8000-000000000001' $$, 'B cannot see A''s goals');
select is_empty($$ select 1 from public.reading_goal_history where user_id = 'aaaaaaaa-0000-4000-8000-000000000001' $$, 'B cannot see A''s goal history');
select is_empty($$ select 1 from public.shelf_settings where user_id = 'aaaaaaaa-0000-4000-8000-000000000001' $$, 'B cannot see A''s bookshelf settings');

-- Writing rows that claim to be A's.
select throws_ok($$ insert into public.user_books (user_id, title) values ('aaaaaaaa-0000-4000-8000-000000000001', 'planted') $$, '42501', null, 'B cannot plant a book in A''s library');
select throws_ok($$ insert into public.reading_sessions (user_id, user_book_id, duration_minutes, log_type) values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-1111-4000-8000-000000000001', 10, 'pages') $$, '42501', null, 'B cannot log a session as A');
select throws_ok($$ insert into public.chapter_boundaries (user_id, user_book_id, chapter_number, start_page, end_page) values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-1111-4000-8000-000000000001', 2, 21, 40) $$, '42501', null, 'B cannot add chapters to A''s book');
select throws_ok($$ insert into public.reading_goals (user_id, year) values ('aaaaaaaa-0000-4000-8000-000000000001', 2027) $$, '42501', null, 'B cannot set A''s goals');
select throws_ok($$ insert into public.shelf_settings (user_id) values ('aaaaaaaa-0000-4000-8000-000000000001') $$, '42501', null, 'B cannot create A''s bookshelf settings');

-- Rows owned by B that point at A's book are refused by the session/chapter triggers.
select throws_ok($$ insert into public.reading_sessions (user_id, user_book_id, duration_minutes, log_type) values ('bbbbbbbb-0000-4000-8000-000000000002', 'aaaaaaaa-1111-4000-8000-000000000001', 10, 'pages') $$, null, null, 'B cannot attach their own session to A''s book');

-- Updates and deletes silently match nothing.
update public.user_books set title = 'hijacked', notes = 'hijacked' where id = 'aaaaaaaa-1111-4000-8000-000000000001';
update public.profiles set display_name = 'hijacked' where id = 'aaaaaaaa-0000-4000-8000-000000000001';
update public.reading_sessions set duration_minutes = 999 where user_id = 'aaaaaaaa-0000-4000-8000-000000000001';
delete from public.reading_sessions where user_id = 'aaaaaaaa-0000-4000-8000-000000000001';
delete from public.chapter_boundaries where user_id = 'aaaaaaaa-0000-4000-8000-000000000001';
delete from public.user_books where id = 'aaaaaaaa-1111-4000-8000-000000000001';
-- Moving their own row to A is refused by the update policy's check.
insert into public.user_books (id, user_id, title) values ('bbbbbbbb-1111-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000002', 'B''s book');
select throws_ok($$ update public.user_books set user_id = 'aaaaaaaa-0000-4000-8000-000000000001' where id = 'bbbbbbbb-1111-4000-8000-000000000002' $$, '42501', null, 'B cannot hand a book over to A');

-- Check what survived, as the owner.
reset role;
select is((select title from public.user_books where id = 'aaaaaaaa-1111-4000-8000-000000000001'), 'A private book', 'A''s book title unchanged');
select is((select notes from public.user_books where id = 'aaaaaaaa-1111-4000-8000-000000000001'), 'private note', 'A''s notes unchanged');
select is((select display_name from public.profiles where id = 'aaaaaaaa-0000-4000-8000-000000000001'), 'Reader A', 'A''s display name unchanged');
select is((select duration_minutes from public.reading_sessions where user_id = 'aaaaaaaa-0000-4000-8000-000000000001'), 30, 'A''s session unchanged and not deleted');
select is((select count(*) from public.chapter_boundaries where user_id = 'aaaaaaaa-0000-4000-8000-000000000001'), 1::bigint, 'A''s chapter map not deleted');
select is((select count(*) from public.user_books where user_id = 'aaaaaaaa-0000-4000-8000-000000000001'), 1::bigint, 'nothing was planted in or deleted from A''s library');

-- Profiles: a stranger sees only their own profile row.
reset role;
select pg_temp.sign_in('bbbbbbbb-0000-4000-8000-000000000002');
select is_empty($$ select 1 from public.profiles where id = 'aaaaaaaa-0000-4000-8000-000000000001' $$, 'B cannot see A''s profile without a share');
select isnt_empty($$ select 1 from public.profiles where id = 'bbbbbbbb-0000-4000-8000-000000000002' $$, 'B can see their own profile');

-- Signed-out visitors see nothing at all.
reset role;
select set_config('request.jwt.claims', '', true);
select set_config('role', 'anon', true);
select throws_ok($$ select 1 from public.user_books $$, '42501', null, 'anon cannot read books at all');
select throws_ok($$ select public.get_viewable_profile_summaries(2026) $$, '42501', null, 'anon cannot call sharing functions');

select * from finish();
rollback;
