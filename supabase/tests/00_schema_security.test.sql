-- Schema-wide security rules (#6). These guard every table and function,
-- including ones added later: a new table without RLS fails CI.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select is(
  (select array_agg(c.relname order by c.relname) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity),
  null,
  'every public table has row-level security enabled'
);

select is(
  (select array_agg(distinct table_name::text) from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'anon'),
  null,
  'signed-out visitors (anon) have no privileges on any public table'
);

select is(
  (select array_agg(p.proname::text) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')),
  null,
  'anon cannot execute any public function'
);

select is(
  (select array_agg(p.proname::text) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and not coalesce(p.proconfig @> array['search_path=""'], false)),
  null,
  'every SECURITY DEFINER function pins search_path to empty'
);

select is(
  (select array_agg(p.proname::text) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prorettype <> 'trigger'::regtype
      and not has_function_privilege('authenticated', p.oid, 'execute')),
  null,
  'signed-in readers can call every non-trigger function the app uses'
);

select is(
  (select array_agg(tablename || ': ' || policyname) from pg_policies
    where schemaname = 'public' and (coalesce(qual, '') || coalesce(with_check, '')) ~ 'auth\.uid\(\)'
      and (coalesce(qual, '') || coalesce(with_check, '')) !~* '\(\s*select auth\.uid\(\)'),
  null,
  'policies use (select auth.uid()) so it is evaluated once per query'
);

-- Objects created by later migrations must start closed to anon.
create table public._probe_table (id int);
create function public._probe_function() returns int language sql as 'select 1';
select ok(not has_table_privilege('anon', 'public._probe_table', 'select'), 'a new table is not readable by anon');
select ok(not has_function_privilege('anon', 'public._probe_function()', 'execute'), 'a new function is not callable by anon');

select * from finish();
rollback;
