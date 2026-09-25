-- RLS access matrix (docs/MIGRATION_PLAN.md section 8): allowed and denied
-- cases for anonymous visitors, admins, disabled admins, users with no role,
-- anonymous auth users and superadmins.
begin;
create extension if not exists pgtap with schema extensions;
select plan(56);

-- ---------------------------------------------------------------------------
-- Helpers and fixtures (as postgres)
-- ---------------------------------------------------------------------------
create function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end;
$$;

create function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
end;
$$;

create function pg_temp.as_postgres() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- Ids: 5 super, a admin A, b admin B, d disabled admin, e no role, f anonymous
insert into auth.users (id, email, aud, role, is_anonymous) values
  ('00000000-0000-0000-0000-000000000005', 'super@test.local', 'authenticated', 'authenticated', false),
  ('00000000-0000-0000-0000-00000000000a', 'a@test.local', 'authenticated', 'authenticated', false),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.local', 'authenticated', 'authenticated', false),
  ('00000000-0000-0000-0000-00000000000d', 'd@test.local', 'authenticated', 'authenticated', false),
  ('00000000-0000-0000-0000-00000000000e', 'norole@test.local', 'authenticated', 'authenticated', false),
  ('00000000-0000-0000-0000-00000000000f', null, 'authenticated', 'authenticated', true);

select is((select count(*)::int from public.profiles), 5,
  'sign-up trigger creates profiles for real users only, never anonymous users');
select ok((select bool_and(role is null) from public.profiles),
  'new profiles start with no role');

update public.profiles set role = 'superadmin' where id = '00000000-0000-0000-0000-000000000005';
update public.profiles set role = 'admin' where id in (
  '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b',
  '00000000-0000-0000-0000-00000000000d');
update public.profiles set disabled_at = now() where id = '00000000-0000-0000-0000-00000000000d';

-- Events: A1 published (A), A2 draft (A), B1 draft (B), D1 draft (disabled D)
insert into public.events (id, owner_id, name, status) values
  ('10000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'A published', 'published'),
  ('10000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000000a', 'A draft', 'draft'),
  ('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'B draft', 'draft'),
  ('10000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-00000000000d', 'D draft', 'draft');

insert into public.divisions (id, event_id, name) values
  ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a1', 'Open'),
  ('20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-0000000000a2', 'Open'),
  ('20000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b1', 'Open');

insert into public.teams (id, division_id, name) values
  ('30000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a1', 'Hawks'),
  ('30000000-0000-0000-0000-0000000000a3', '20000000-0000-0000-0000-0000000000a1', 'Owls'),
  ('30000000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-0000000000a2', 'Kea'),
  ('30000000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-0000000000b1', 'Tui');

insert into public.players (team_id, name, number) values
  ('30000000-0000-0000-0000-0000000000a1', 'Pub Player', '7'),
  ('30000000-0000-0000-0000-0000000000a2', 'Draft Player', '8'),
  ('30000000-0000-0000-0000-0000000000b1', 'B Player', '9');

insert into public.games (id, event_id, division_id, day, start_time, court, team1_id, team2_id) values
  ('40000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a1',
   '20000000-0000-0000-0000-0000000000a1', '2026-10-03', '09:00', 1,
   '30000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-0000000000a3'),
  ('40000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b1',
   '20000000-0000-0000-0000-0000000000b1', '2026-10-03', '09:00', 1, null, null);

insert into public.game_scores (game_id, event_id, s1, s2) values
  ('40000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a1', 40, 38),
  ('40000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b1', 10, 12);

insert into public.score_sources (game_id, mobile_game_id) values
  ('40000000-0000-0000-0000-0000000000a1', 'm-a1'),
  ('40000000-0000-0000-0000-0000000000b1', 'm-b1');

insert into public.division_mobile_links (division_id, league_id) values
  ('20000000-0000-0000-0000-0000000000a1', 'league-a1');

-- ---------------------------------------------------------------------------
-- Anonymous visitor
-- ---------------------------------------------------------------------------
select pg_temp.as_anon();

select results_eq('select id from public.events',
  $$values ('10000000-0000-0000-0000-0000000000a1'::uuid)$$,
  'anon sees only the published event');
select is((select count(*)::int from public.divisions), 1, 'anon sees divisions of published events only');
select is((select count(*)::int from public.teams), 2, 'anon sees teams of published events only');
select is((select count(*)::int from public.players), 1, 'anon sees players of published events only');
select is((select count(*)::int from public.games), 1, 'anon sees games of published events only');
select is((select count(*)::int from public.game_scores), 1, 'anon sees scores of published events only');
select is((select count(*)::int from public.score_sources), 0, 'anon cannot read score provenance');
select is((select count(*)::int from public.division_mobile_links), 0, 'anon cannot read mobile links');
select is((select count(*)::int from public.profiles), 0, 'anon cannot read profiles');
select is((select count(*)::int from public.audit_log), 0, 'anon cannot read the audit log');
select is((select count(*)::int from public.platform_settings), 1, 'anon can read platform settings');
select throws_ok(
  $$insert into public.events (owner_id, name) values ('00000000-0000-0000-0000-00000000000a', 'x')$$,
  '42501', null, 'anon cannot create events');
update public.events set name = 'hacked' where id = '10000000-0000-0000-0000-0000000000a1';
delete from public.game_scores;
select throws_ok(
  $$select public.set_score('40000000-0000-0000-0000-0000000000a1', 1, 1)$$,
  '42501', null, 'anon cannot call set_score');

select pg_temp.as_postgres();
select is((select name from public.events where id = '10000000-0000-0000-0000-0000000000a1'), 'A published',
  'anon update of a published event changed nothing');
select is((select count(*)::int from public.game_scores), 2, 'anon delete of scores changed nothing');

-- ---------------------------------------------------------------------------
-- Admin A
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000a');

select set_eq('select id from public.events',
  $$values ('10000000-0000-0000-0000-0000000000a1'::uuid), ('10000000-0000-0000-0000-0000000000a2'::uuid)$$,
  'admin sees own events and published events, not other drafts');
select is((select count(*)::int from public.teams), 3, 'admin sees teams of own and published events');
select is((select count(*)::int from public.score_sources), 1, 'admin sees provenance of own events only');
select is((select count(*)::int from public.division_mobile_links), 1, 'admin sees mobile links of own events');
select results_eq('select id from public.profiles',
  $$values ('00000000-0000-0000-0000-00000000000a'::uuid)$$, 'admin reads only their own profile');

select lives_ok(
  $$update public.events set name = 'A draft renamed' where id = '10000000-0000-0000-0000-0000000000a2'$$,
  'admin can update own event');
update public.events set name = 'hacked' where id = '10000000-0000-0000-0000-0000000000b1';
select lives_ok(
  $$insert into public.events (owner_id, name) values ('00000000-0000-0000-0000-00000000000a', 'A new')$$,
  'admin can create an event they own');
select throws_ok(
  $$insert into public.events (owner_id, name) values ('00000000-0000-0000-0000-00000000000b', 'for B')$$,
  '42501', null, 'admin cannot create an event owned by someone else');
select throws_ok(
  $$update public.events set owner_id = '00000000-0000-0000-0000-00000000000b'
    where id = '10000000-0000-0000-0000-0000000000a2'$$,
  '42501', null, 'admin cannot reassign event ownership');
select lives_ok(
  $$insert into public.divisions (event_id, name) values ('10000000-0000-0000-0000-0000000000a2', 'U18')$$,
  'admin can add a division to own event');
select throws_ok(
  $$insert into public.divisions (event_id, name) values ('10000000-0000-0000-0000-0000000000b1', 'U18')$$,
  '42501', null, 'admin cannot add a division to another admin''s event');
select throws_ok(
  $$insert into public.teams (division_id, name) values ('20000000-0000-0000-0000-0000000000b1', 'Sneaky')$$,
  '42501', null, 'admin cannot add a team to another admin''s division');
update public.profiles set role = 'superadmin' where id = '00000000-0000-0000-0000-00000000000a';
update public.platform_settings set default_rules_html = 'hacked';
select throws_ok(
  $$insert into public.audit_log (action) values ('forged')$$,
  '42501', null, 'admin cannot write audit entries');
select throws_ok(
  $$delete from public.audit_log$$,
  '42501', null, 'admin cannot erase audit entries');
select ok(
  (select bool_and(event_id in ('10000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a2')
     or event_id in (select id from public.events where owner_id = '00000000-0000-0000-0000-00000000000a'))
   from public.audit_log),
  'admin reads audit entries for own events only');
select ok((select count(*) from public.audit_log) > 0, 'admin can read audit entries for own events');

select pg_temp.as_postgres();
select is((select name from public.events where id = '10000000-0000-0000-0000-0000000000b1'), 'B draft',
  'admin update of another admin''s event changed nothing');
select is((select role::text from public.profiles where id = '00000000-0000-0000-0000-00000000000a'), 'admin',
  'admin cannot promote themselves');
select is((select default_rules_html from public.platform_settings), '',
  'admin cannot change platform settings');

-- ---------------------------------------------------------------------------
-- Admin B cannot touch A's events, even published ones
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
delete from public.events where id = '10000000-0000-0000-0000-0000000000a1';
update public.games set court = 2 where id = '40000000-0000-0000-0000-0000000000a1';
select throws_ok(
  $$select public.set_score('40000000-0000-0000-0000-0000000000a1', 1, 1)$$,
  '42501', null, 'admin cannot set a score on another admin''s event');
select is((select count(*)::int from public.score_sources), 1, 'admin B sees only their own provenance');
select pg_temp.as_postgres();
select ok(exists (select 1 from public.events where id = '10000000-0000-0000-0000-0000000000a1'),
  'admin cannot delete another admin''s published event');
select is((select court::int from public.games where id = '40000000-0000-0000-0000-0000000000a1'), 1,
  'admin cannot move another admin''s game');

-- ---------------------------------------------------------------------------
-- Disabled admin, user without a role, anonymous auth user
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select is((select count(*)::int from public.events where id = '10000000-0000-0000-0000-0000000000d1'), 0,
  'disabled admin cannot see their own draft');
update public.events set name = 'still here' where id = '10000000-0000-0000-0000-0000000000d1';
select throws_ok(
  $$insert into public.events (owner_id, name) values ('00000000-0000-0000-0000-00000000000d', 'x')$$,
  '42501', null, 'disabled admin cannot create events');

select pg_temp.login('00000000-0000-0000-0000-00000000000e');
select throws_ok(
  $$insert into public.events (owner_id, name) values ('00000000-0000-0000-0000-00000000000e', 'x')$$,
  '42501', null, 'signed-in user without a role cannot create events');
select is((select count(*)::int from public.events), 1, 'user without a role sees published events only');

select pg_temp.login('00000000-0000-0000-0000-00000000000f');
select throws_ok(
  $$insert into public.events (owner_id, name) values ('00000000-0000-0000-0000-00000000000f', 'x')$$,
  '42501', null, 'anonymous auth user has no profile and cannot create events');
select is((select count(*)::int from public.score_sources), 0, 'anonymous auth user cannot read provenance');

select pg_temp.as_postgres();
select is((select name from public.events where id = '10000000-0000-0000-0000-0000000000d1'), 'D draft',
  'disabled admin update changed nothing');

-- ---------------------------------------------------------------------------
-- Superadmin
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-000000000005');
select is((select count(*)::int from public.events), 5, 'superadmin sees every event');
select is((select count(*)::int from public.profiles), 5, 'superadmin reads every profile');
select lives_ok(
  $$update public.events set name = 'B edited by super' where id = '10000000-0000-0000-0000-0000000000b1'$$,
  'superadmin can edit any event');
select lives_ok(
  $$update public.events set owner_id = '00000000-0000-0000-0000-00000000000b'
    where id = '10000000-0000-0000-0000-0000000000a2'$$,
  'superadmin can reassign ownership');
select lives_ok(
  $$update public.profiles set disabled_at = now() where id = '00000000-0000-0000-0000-00000000000b'$$,
  'superadmin can disable an admin');
select throws_ok(
  $$update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-000000000005'$$,
  '42501', null, 'superadmin cannot demote themselves');
select lives_ok(
  $$update public.platform_settings set default_rules_html = '<p>Rules</p>'$$,
  'superadmin can edit platform settings');

select pg_temp.as_postgres();
select is((select owner_id from public.events where id = '10000000-0000-0000-0000-0000000000a2'),
  '00000000-0000-0000-0000-00000000000b'::uuid, 'ownership reassignment stuck');

-- The newly disabled admin B loses access immediately
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.events), 1, 'disabled admin keeps public access only');

select * from finish();
rollback;
