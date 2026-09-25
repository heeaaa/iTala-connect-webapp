-- Regression tests for the phase 1 independent review findings
-- (migration 20260925000400_hardening.sql).
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

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

insert into auth.users (id, email, aud, role, is_anonymous) values
  ('00000000-0000-0000-0000-000000000005', 'super@test.local', 'authenticated', 'authenticated', false),
  ('00000000-0000-0000-0000-000000000006', 'super2@test.local', 'authenticated', 'authenticated', false),
  ('00000000-0000-0000-0000-00000000000a', 'a@test.local', 'authenticated', 'authenticated', false),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.local', 'authenticated', 'authenticated', false),
  ('00000000-0000-0000-0000-00000000000f', null, 'authenticated', 'authenticated', true);
update public.profiles set role = 'admin';
update public.profiles set role = 'superadmin'
  where id in ('00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000006');
update public.profiles set disabled_at = now() where id = '00000000-0000-0000-0000-000000000006';

insert into public.events (id, owner_id, name, status) values
  ('10000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'A published', 'published'),
  ('10000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000000a', 'A draft', 'draft'),
  ('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'B draft', 'draft');
insert into public.divisions (id, event_id, name) values
  ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a1', 'Open'),
  ('20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-0000000000a2', 'Open');
insert into public.teams (id, division_id, name) values
  ('30000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a1', 'Hawks'),
  ('30000000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-0000000000a2', 'Kea');
insert into public.players (id, team_id, name) values
  ('50000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-0000000000a1', 'Mere');
insert into public.games (id, event_id, division_id, day, start_time, court) values
  ('40000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a1',
   '20000000-0000-0000-0000-0000000000a1', '2026-10-03', '09:00', 1);
insert into public.game_scores (game_id, event_id, s1, s2) values
  ('40000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a1', 40, 38);

-- Finding 1: provenance cannot be forged
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select throws_ok(
  $$insert into public.score_sources (game_id, mobile_game_id, approved_by, approved_at)
    values ('40000000-0000-0000-0000-0000000000a1', 'fake', '00000000-0000-0000-0000-00000000000b', now() - interval '3 days')$$,
  '42501', null, 'editors cannot write provenance directly');
select lives_ok(
  $$select public.approve_mobile_result('40000000-0000-0000-0000-0000000000a1', 50, 48,
    '{"mobile_game_id": "m-1", "approved_by": "00000000-0000-0000-0000-00000000000b"}'::jsonb)$$,
  'approve_mobile_result still works for the editor');
select is((select approved_by from public.score_sources where game_id = '40000000-0000-0000-0000-0000000000a1'),
  '00000000-0000-0000-0000-00000000000a'::uuid, 'approval is stamped with the caller, not a supplied id');
select throws_ok(
  $$update public.score_sources set approved_by = '00000000-0000-0000-0000-00000000000b'$$,
  '42501', null, 'editors cannot rewrite provenance');
select lives_ok(
  $$select public.dismiss_mobile_result('40000000-0000-0000-0000-0000000000a1', '{"mobile_game_id": "m-1"}'::jsonb)$$,
  'dismiss_mobile_result works for the editor');
select isnt((select dismissed_at from public.score_sources where game_id = '40000000-0000-0000-0000-0000000000a1'),
  null, 'dismissal is recorded');

select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select throws_ok(
  $$select public.approve_mobile_result('40000000-0000-0000-0000-0000000000a1', 1, 1, '{}'::jsonb)$$,
  '42501', null, 'the security definer approval still refuses non-editors');

-- Finding 2: parent keys cannot move
select pg_temp.login('00000000-0000-0000-0000-000000000005');
select throws_ok(
  $$update public.games set event_id = '10000000-0000-0000-0000-0000000000b1'
    where id = '40000000-0000-0000-0000-0000000000a1'$$,
  '22023', null, 'a game cannot move to another event, even for a superadmin');
select throws_ok(
  $$update public.divisions set event_id = '10000000-0000-0000-0000-0000000000a2'
    where id = '20000000-0000-0000-0000-0000000000a1'$$,
  '22023', null, 'a division cannot move to another event');
select throws_ok(
  $$update public.teams set division_id = '20000000-0000-0000-0000-0000000000a2'
    where id = '30000000-0000-0000-0000-0000000000a1'$$,
  '22023', null, 'a team cannot move to another division');
select throws_ok(
  $$update public.players set team_id = '30000000-0000-0000-0000-0000000000a2'
    where id = '50000000-0000-0000-0000-0000000000a1'$$,
  '22023', null, 'a player cannot move to a team in another event');

-- Finding 4: legacy columns are import-only
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select throws_ok(
  $$update public.events set legacy_firebase_id = '-OldFirebaseKey123'
    where id = '10000000-0000-0000-0000-0000000000a2'$$,
  '42501', null, 'admins cannot claim a legacy Firebase id');
select throws_ok(
  $$insert into public.events (owner_id, name, legacy_created_by)
    values ('00000000-0000-0000-0000-00000000000a', 'x', 'superadmin')$$,
  '42501', null, 'admins cannot insert legacy values');

-- Finding 5: publish only through publish_event
select throws_ok(
  $$update public.events set status = 'published' where id = '10000000-0000-0000-0000-0000000000a2'$$,
  '42501', null, 'status cannot be set directly');
select throws_ok(
  $$insert into public.events (owner_id, name, status) values ('00000000-0000-0000-0000-00000000000a', 'x', 'published')$$,
  '42501', null, 'events cannot be created already published');
select lives_ok(
  $$select public.publish_event('10000000-0000-0000-0000-0000000000a2', '[]'::jsonb, false)$$,
  'publish_event can still publish');
select is(current_setting('itala.publishing_event', true), '',
  'the publish marker is cleared after publish_event');

-- Review "missing tests": disabled superadmin, anonymous auth user
select pg_temp.login('00000000-0000-0000-0000-000000000006');
select is((select count(*)::int from public.events), 2, 'a disabled superadmin sees published events only');

select pg_temp.login('00000000-0000-0000-0000-00000000000f');
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('images', 'events/10000000-0000-0000-0000-0000000000a1/x.webp')$$,
  '42501', null, 'an anonymous auth user cannot upload');
select throws_ok(
  $$select public.set_score('40000000-0000-0000-0000-0000000000a1', 1, 1)$$,
  '42501', null, 'an anonymous auth user cannot set scores');

select pg_temp.as_postgres();
select * from finish();
rollback;
