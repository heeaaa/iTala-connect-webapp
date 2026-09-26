-- Admins screen (PRD A-09): only an active superadmin may list accounts with their emails,
-- and account changes and set-up links are audited (X-09).
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

create function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end;
$$;

insert into auth.users (id, email, aud, role, is_anonymous, last_sign_in_at) values
  ('00000000-0000-0000-0000-0000000000a9', 'acc-super@test.local', 'authenticated', 'authenticated', false, now()),
  ('00000000-0000-0000-0000-0000000000b9', 'acc-admin@test.local', 'authenticated', 'authenticated', false, null),
  ('00000000-0000-0000-0000-0000000000c9', 'acc-off@test.local', 'authenticated', 'authenticated', false, null),
  ('00000000-0000-0000-0000-0000000000d9', 'acc-none@test.local', 'authenticated', 'authenticated', false, null),
  ('00000000-0000-0000-0000-0000000000e9', null, 'authenticated', 'authenticated', true, null);
update public.profiles set role = 'superadmin', display_name = 'Acc Super'
where id in ('00000000-0000-0000-0000-0000000000a9', '00000000-0000-0000-0000-0000000000c9');
update public.profiles set role = 'admin', display_name = 'Acc Admin' where id = '00000000-0000-0000-0000-0000000000b9';
update public.profiles set disabled_at = now() where id = '00000000-0000-0000-0000-0000000000c9';

-- ---------------------------------------------------------------------------
-- The account list
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a9');
select results_eq(
  $$select email, role::text, signed_in from public.list_admin_accounts()
    where id = '00000000-0000-0000-0000-0000000000b9'$$,
  $$values ('acc-admin@test.local', 'admin', false)$$,
  'a superadmin sees an admin''s email and role, and that they have not signed in yet');
select results_eq(
  $$select signed_in from public.list_admin_accounts() where id = '00000000-0000-0000-0000-0000000000a9'$$,
  $$values (true)$$,
  'someone who has signed in shows as such');
select ok(
  (select disabled_at is not null from public.list_admin_accounts() where id = '00000000-0000-0000-0000-0000000000c9'),
  'a disabled account is listed as disabled');
select results_eq(
  $$select role from public.list_admin_accounts() where id = '00000000-0000-0000-0000-0000000000d9'$$,
  $$values (null::public.app_role)$$,
  'an account with no role is listed too, so it can be given one');
select is(
  (select count(*)::int from public.list_admin_accounts() where id = '00000000-0000-0000-0000-0000000000e9'), 0,
  'anonymous auth users never appear');

select pg_temp.login('00000000-0000-0000-0000-0000000000b9');
select throws_ok($$select * from public.list_admin_accounts()$$, '42501', null, 'an admin cannot list accounts');
select throws_ok(
  $$select public.record_account_link('00000000-0000-0000-0000-0000000000d9', 'invite')$$,
  '42501', null, 'an admin cannot record a set-up link');
select pg_temp.login('00000000-0000-0000-0000-0000000000c9');
select throws_ok($$select * from public.list_admin_accounts()$$, '42501', null, 'a disabled superadmin cannot list accounts');
select pg_temp.login('00000000-0000-0000-0000-0000000000d9');
select throws_ok($$select * from public.list_admin_accounts()$$, '42501', null, 'an account with no role cannot list accounts');

-- ---------------------------------------------------------------------------
-- Audit (X-09): who changed which account, and who made which link
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a9');
update public.profiles set role = 'superadmin' where id = '00000000-0000-0000-0000-0000000000b9';
select results_eq(
  $$select detail->>'account', detail->>'from', detail->>'to' from public.audit_log
    where actor_id = '00000000-0000-0000-0000-0000000000a9' and action = 'account.role'$$,
  $$values ('00000000-0000-0000-0000-0000000000b9', 'admin', 'superadmin')$$,
  'a role change is recorded with who made it');
update public.profiles set disabled_at = now() where id = '00000000-0000-0000-0000-0000000000b9';
update public.profiles set disabled_at = null where id = '00000000-0000-0000-0000-0000000000b9';
select results_eq(
  $$select action from public.audit_log where actor_id = '00000000-0000-0000-0000-0000000000a9'
    and action in ('account.disable', 'account.enable') order by id$$,
  $$values ('account.disable'), ('account.enable')$$,
  'disabling and enabling are recorded');
update public.profiles set display_name = 'Renamed' where id = '00000000-0000-0000-0000-0000000000b9';
select is((select count(*)::int from public.audit_log where actor_id = '00000000-0000-0000-0000-0000000000a9'), 3,
  'a name change is not an audit event');
select lives_ok(
  $$select public.record_account_link('00000000-0000-0000-0000-0000000000d9', 'recovery')$$,
  'a superadmin records a set-up link');
select results_eq(
  $$select actor_id, detail->>'account', detail->>'kind' from public.audit_log where action = 'account.link'$$,
  $$values ('00000000-0000-0000-0000-0000000000a9'::uuid, '00000000-0000-0000-0000-0000000000d9', 'recovery')$$,
  'the link is recorded with who made it, for whom and which kind');
select throws_ok(
  $$select public.record_account_link('00000000-0000-0000-0000-0000000000d9', 'magiclink')$$,
  '22023', null, 'only invite and password links are recorded');

-- ---------------------------------------------------------------------------
-- How the functions are declared
-- ---------------------------------------------------------------------------
reset role;
select ok(
  (select bool_and(prosecdef and proconfig @> array['search_path=""']) from pg_proc
   where oid in ('public.list_admin_accounts()'::regprocedure, 'public.record_account_link(uuid, text)'::regprocedure,
                 'public.audit_profiles()'::regprocedure)),
  'the account functions run as definer with an empty search path');
select ok(
  has_function_privilege('authenticated', 'public.list_admin_accounts()', 'execute')
  and has_function_privilege('authenticated', 'public.record_account_link(uuid, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.audit_profiles()', 'execute'),
  'signed-in users may call the list and the link record (both check the role), never the trigger');
select ok(
  not has_function_privilege('anon', 'public.list_admin_accounts()', 'execute')
  and not has_function_privilege('anon', 'public.record_account_link(uuid, text)', 'execute'),
  'anon cannot list accounts or record links');

select * from finish();
rollback;
