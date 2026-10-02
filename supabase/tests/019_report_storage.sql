-- Report rows belong to their creator and remain tied to current event permission.
begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

create function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end;
$$;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-000000000191', 'reports-owner@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000000192', 'reports-other@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000000193', 'reports-super@test.local', 'authenticated', 'authenticated');
update public.profiles set role = 'admin' where id in
  ('00000000-0000-0000-0000-000000000191', '00000000-0000-0000-0000-000000000192');
update public.profiles set role = 'superadmin' where id = '00000000-0000-0000-0000-000000000193';
insert into public.events (id, owner_id, name) values
  ('10000000-0000-0000-0000-000000000191', '00000000-0000-0000-0000-000000000191', 'Owner league'),
  ('10000000-0000-0000-0000-000000000192', '00000000-0000-0000-0000-000000000192', 'Other league'),
  ('10000000-0000-0000-0000-000000000193', '00000000-0000-0000-0000-000000000191', 'Second owner league');

select has_table('public', 'report_presets', 'presets use a dedicated table');
select has_table('public', 'report_snapshots', 'snapshots use a dedicated table');
select ok((select relrowsecurity from pg_class where oid = 'public.report_presets'::regclass), 'preset RLS is enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.report_snapshots'::regclass), 'snapshot RLS is enabled');
select ok(not has_table_privilege('anon', 'public.report_presets', 'SELECT'), 'anonymous users cannot read presets');
select ok(not has_table_privilege('anon', 'public.report_snapshots', 'SELECT'), 'anonymous users cannot read snapshots');

select pg_temp.login('00000000-0000-0000-0000-000000000191');
select lives_ok($$insert into public.report_presets (id, event_id, name, definition) values
  ('20000000-0000-0000-0000-000000000191', '10000000-0000-0000-0000-000000000191', 'My report',
   '{"eventId":"10000000-0000-0000-0000-000000000191","template":"results"}')$$,
  'the editor can save their own preset');
select lives_ok($$insert into public.report_snapshots (id, event_id, template, document) values
  ('30000000-0000-0000-0000-000000000191', '10000000-0000-0000-0000-000000000191', 'results',
   '{"version":1,"eventId":"10000000-0000-0000-0000-000000000191","template":"results"}')$$,
  'the editor can save a snapshot for their event');
select throws_ok($$update public.report_presets set event_id = '10000000-0000-0000-0000-000000000193'
  where id = '20000000-0000-0000-0000-000000000191'$$,
  '42501', null, 'a preset cannot be moved to another manageable event');
select throws_ok($$update public.report_presets set id = '20000000-0000-0000-0000-000000000192'
  where id = '20000000-0000-0000-0000-000000000191'$$,
  '42501', null, 'a preset cannot change identity');
select throws_ok($$insert into public.report_presets (event_id, name, definition) values
  ('10000000-0000-0000-0000-000000000191', 'Missing identity', '{"template":"results"}')$$,
  '23514', null, 'a preset definition must include its event identity');
select throws_ok($$insert into public.report_presets (event_id, name, definition) values
  ('10000000-0000-0000-0000-000000000191', 'Missing template',
   '{"eventId":"10000000-0000-0000-0000-000000000191"}')$$,
  '23514', null, 'a preset definition must include its template');
select throws_ok($$insert into public.report_presets (event_id, name, definition) values
  ('10000000-0000-0000-0000-000000000191', 'My report' || repeat(' ', 80),
   '{"eventId":"10000000-0000-0000-0000-000000000191","template":"results"}')$$,
  '23514', null, 'a preset name cannot store unbounded whitespace');
select throws_ok($$update public.report_snapshots set template = 'team'
  where id = '30000000-0000-0000-0000-000000000191'$$,
  '42501', null, 'an authenticated user cannot change an immutable snapshot');
select throws_ok($$insert into public.report_snapshots (event_id, template, document) values
  ('10000000-0000-0000-0000-000000000191', 'results',
   '{"version":1,"eventId":"10000000-0000-0000-0000-000000000192","template":"results"}')$$,
  '23514', null, 'document event identity must match the owning event');
select throws_ok($$insert into public.report_snapshots (event_id, template, document) values
  ('10000000-0000-0000-0000-000000000191', 'results',
   '{"eventId":"10000000-0000-0000-0000-000000000191","template":"results"}')$$,
  '23514', null, 'a snapshot document must include its version');

select pg_temp.login('00000000-0000-0000-0000-000000000192');
select is((select count(*)::int from public.report_snapshots where id = '30000000-0000-0000-0000-000000000191'),
  0, 'another admin cannot read a private snapshot');
select throws_ok($$insert into public.report_presets (event_id, name, definition) values
  ('10000000-0000-0000-0000-000000000191', 'Foreign',
   '{"eventId":"10000000-0000-0000-0000-000000000191","template":"results"}')$$,
  '42501', null, 'another admin cannot save a preset for the event');

select pg_temp.login('00000000-0000-0000-0000-000000000193');
select is((select count(*)::int from public.report_snapshots where id = '30000000-0000-0000-0000-000000000191'),
  0, 'a superadmin still cannot read someone else''s private snapshot');

reset role;
update public.events set owner_id = '00000000-0000-0000-0000-000000000192'
where id = '10000000-0000-0000-0000-000000000191';
select pg_temp.login('00000000-0000-0000-0000-000000000191');
select is((select count(*)::int from public.report_snapshots where id = '30000000-0000-0000-0000-000000000191'),
  0, 'revoked event permission hides an existing snapshot');

reset role;
update public.events set owner_id = '00000000-0000-0000-0000-000000000191'
where id = '10000000-0000-0000-0000-000000000191';
update public.report_snapshots set created_at = now() - interval '8 days', expires_at = now() - interval '1 day'
where id = '30000000-0000-0000-0000-000000000191';
select pg_temp.login('00000000-0000-0000-0000-000000000191');
select is((select count(*)::int from public.report_snapshots where id = '30000000-0000-0000-0000-000000000191'),
  0, 'an expired snapshot is inaccessible');

select * from finish();
rollback;
