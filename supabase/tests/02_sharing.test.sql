-- Profile sharing, invites and reading circles (#6, #7).
begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

-- See 01_cross_user.test.sql; always called after `reset role`.
create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email, jsonb_build_object('display_name', name), now(), now()
from (values
  ('aaaaaaaa-0000-4000-8000-000000000001'::uuid, 'a@share.test', 'Owner A'),
  ('bbbbbbbb-0000-4000-8000-000000000002'::uuid, 'b@share.test', 'Viewer B'),
  ('cccccccc-0000-4000-8000-000000000003'::uuid, 'c@share.test', 'Stranger C')) u(id, email, name);
insert into public.user_books (id, user_id, title, status, finished_on)
values ('aaaaaaaa-1111-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'A''s book', 'finished', current_date);

-- ---------------------------------------------------------------------------
-- Summary-only share via a one-use invite.
reset role;
select pg_temp.sign_in('aaaaaaaa-0000-4000-8000-000000000001');
select set_config('t.summary_code', public.create_profile_share_invite('summary'), true);
select throws_ok($$ select public.redeem_profile_share_invite(current_setting('t.summary_code')) $$, 'P0001', 'Cannot invite yourself.', 'an owner cannot redeem their own invite');

reset role;
select pg_temp.sign_in('bbbbbbbb-0000-4000-8000-000000000002');
select is(public.redeem_profile_share_invite(current_setting('t.summary_code')), 'aaaaaaaa-0000-4000-8000-000000000001'::uuid, 'B redeems A''s summary invite');
select is_empty($$ select 1 from public.user_books where user_id = 'aaaaaaaa-0000-4000-8000-000000000001' $$, 'summary viewer cannot read A''s books');
select is_empty($$ select 1 from public.reading_sessions where user_id = 'aaaaaaaa-0000-4000-8000-000000000001' $$, 'summary viewer cannot read A''s sessions');
select is((select books_finished from public.get_viewable_profile_summaries(extract(year from current_date)::int) where owner_id = 'aaaaaaaa-0000-4000-8000-000000000001'), 1::bigint, 'summary viewer gets A''s yearly aggregates');
select is(
  (select pg_get_function_result('public.get_viewable_profile_summaries(integer)'::regprocedure)),
  'TABLE(owner_id uuid, display_name text, year integer, books_finished bigint, annual_goal integer, favorites_count bigint, average_rating numeric, reading_minutes bigint, audiobook_minutes bigint, combined_minutes bigint, total_minutes bigint, sessions_count bigint)',
  'the summary exposes only whitelisted aggregate columns (no titles, notes or dates)'
);

reset role;
select pg_temp.sign_in('cccccccc-0000-4000-8000-000000000003');
select throws_ok($$ select public.redeem_profile_share_invite(current_setting('t.summary_code')) $$, 'P0001', 'Code invalid, expired or already used.', 'a used invite cannot be redeemed again');

-- Expired invite (aged by the database owner).
reset role;
select pg_temp.sign_in('aaaaaaaa-0000-4000-8000-000000000001');
select set_config('t.expired_code', public.create_profile_share_invite('full'), true);
reset role;
update public.profile_share_invites set expires_at = now() - interval '1 minute' where invite_code = current_setting('t.expired_code');
reset role;
select pg_temp.sign_in('cccccccc-0000-4000-8000-000000000003');
select throws_ok($$ select public.redeem_profile_share_invite(current_setting('t.expired_code')) $$, 'P0001', 'Code invalid, expired or already used.', 'an expired invite is refused');
select is_empty($$ select 1 from public.profile_share_invites where owner_id = 'aaaaaaaa-0000-4000-8000-000000000001' $$, 'others cannot list A''s invite codes');

-- Nobody can grant themselves access directly.
select throws_ok($$ insert into public.profile_shares (owner_id, viewer_id, access_level) values ('aaaaaaaa-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000003', 'full') $$, '42501', null, 'C cannot insert a share from A to themselves');

-- ---------------------------------------------------------------------------
-- Full share: read, never write.
reset role;
select pg_temp.sign_in('aaaaaaaa-0000-4000-8000-000000000001');
select lives_ok($$ select public.set_profile_share_level('bbbbbbbb-0000-4000-8000-000000000002', 'full') $$, 'A upgrades B to full access');
reset role;
select pg_temp.sign_in('bbbbbbbb-0000-4000-8000-000000000002');
select isnt_empty($$ select 1 from public.user_books where user_id = 'aaaaaaaa-0000-4000-8000-000000000001' $$, 'full viewer can read A''s books');
update public.user_books set title = 'edited by B' where id = 'aaaaaaaa-1111-4000-8000-000000000001';
delete from public.user_books where id = 'aaaaaaaa-1111-4000-8000-000000000001';
select throws_ok($$ insert into public.reading_sessions (user_id, user_book_id, duration_minutes, log_type) values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-1111-4000-8000-000000000001', 5, 'pages') $$, '42501', null, 'full viewer cannot log sessions for A');
-- B's set_profile_share_level only ever changes shares B owns.
select lives_ok($$ select public.set_profile_share_level('aaaaaaaa-0000-4000-8000-000000000001', 'none') $$, 'B calling set_profile_share_level for A touches only B''s own shares');
reset role;
select is((select title from public.user_books where id = 'aaaaaaaa-1111-4000-8000-000000000001'), 'A''s book', 'full viewer could not edit or delete A''s book');
select is((select access_level from public.profile_shares where owner_id = 'aaaaaaaa-0000-4000-8000-000000000001' and viewer_id = 'bbbbbbbb-0000-4000-8000-000000000002'), 'full', 'B could not change A''s share to B');

-- Revoking takes effect immediately.
reset role;
select pg_temp.sign_in('aaaaaaaa-0000-4000-8000-000000000001');
select lives_ok($$ select public.set_profile_share_level('bbbbbbbb-0000-4000-8000-000000000002', 'none') $$, 'A revokes B');
reset role;
select pg_temp.sign_in('bbbbbbbb-0000-4000-8000-000000000002');
select is_empty($$ select 1 from public.user_books where user_id = 'aaaaaaaa-0000-4000-8000-000000000001' $$, 'after revoking, B sees none of A''s books');
select is_empty($$ select 1 from public.get_viewable_profile_summaries(extract(year from current_date)::int) where owner_id = 'aaaaaaaa-0000-4000-8000-000000000001' $$, 'after revoking, B gets no summary of A');

-- ---------------------------------------------------------------------------
-- Reading circles hold at most two readers.
reset role;
select pg_temp.sign_in('aaaaaaaa-0000-4000-8000-000000000001');
select set_config('t.circle', public.create_reading_circle()::text, true);
reset role;
select set_config('t.circle_code', (select invite_code from public.reading_circles where id = current_setting('t.circle')::uuid), true);
reset role;
select pg_temp.sign_in('bbbbbbbb-0000-4000-8000-000000000002');
select is(public.join_reading_circle(current_setting('t.circle_code')), current_setting('t.circle')::uuid, 'B joins A''s circle');
reset role;
select pg_temp.sign_in('cccccccc-0000-4000-8000-000000000003');
select throws_ok($$ select public.join_reading_circle(current_setting('t.circle_code')) $$, 'P0001', 'This reading circle is full.', 'a third reader cannot join a circle');

select * from finish();
rollback;
