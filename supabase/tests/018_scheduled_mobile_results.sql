-- CSI-09/10/11: scheduled claims are checked again inside the approval transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

create function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end;
$$;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000e1', 'claim-owner@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000e2', 'claim-other@test.local', 'authenticated', 'authenticated');
update public.profiles set role = 'admin' where id in
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e2');
insert into public.events (id, owner_id, name, status) values
  ('10000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e1', 'Scheduled', 'published'),
  ('10000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e2', 'Other', 'draft');
insert into public.divisions (id, event_id, name) values
  ('20000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-0000000000e1', 'Open'),
  ('20000000-0000-0000-0000-0000000000e2', '10000000-0000-0000-0000-0000000000e2', 'Other');
insert into public.teams (id, division_id, name) values
  ('30000000-0000-0000-0000-0000000000e1', '20000000-0000-0000-0000-0000000000e1', 'Hawks'),
  ('30000000-0000-0000-0000-0000000000e2', '20000000-0000-0000-0000-0000000000e1', 'Owls');
insert into public.division_mobile_links (division_id, league_id, league_name) values
  ('20000000-0000-0000-0000-0000000000e1', 'L1', 'League');
insert into public.division_mobile_team_links (division_id, team_id, mobile_team_id) values
  ('20000000-0000-0000-0000-0000000000e1', '30000000-0000-0000-0000-0000000000e1', 'm-hawks'),
  ('20000000-0000-0000-0000-0000000000e1', '30000000-0000-0000-0000-0000000000e2', 'm-owls');
insert into public.games (id, event_id, division_id, team1_id, team2_id, label, position) values
  ('40000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-0000000000e1',
   '20000000-0000-0000-0000-0000000000e1', '30000000-0000-0000-0000-0000000000e2',
   '30000000-0000-0000-0000-0000000000e1', 'Open', 1),
  ('40000000-0000-0000-0000-0000000000e2', '10000000-0000-0000-0000-0000000000e1',
   '20000000-0000-0000-0000-0000000000e1', '30000000-0000-0000-0000-0000000000e1',
   '30000000-0000-0000-0000-0000000000e2', 'Open', 2),
  ('40000000-0000-0000-0000-0000000000e3', '10000000-0000-0000-0000-0000000000e1',
   '20000000-0000-0000-0000-0000000000e1', '30000000-0000-0000-0000-0000000000e1',
   '30000000-0000-0000-0000-0000000000e2', 'Open', 3),
  ('40000000-0000-0000-0000-0000000000e4', '10000000-0000-0000-0000-0000000000e1',
   '20000000-0000-0000-0000-0000000000e1', '30000000-0000-0000-0000-0000000000e1',
   '30000000-0000-0000-0000-0000000000e2', 'Open', 4),
  ('40000000-0000-0000-0000-0000000000e5', '10000000-0000-0000-0000-0000000000e2',
   '20000000-0000-0000-0000-0000000000e2', null, null, 'Other', 1);
insert into public.games (id, event_id, division_id, team1_id, team2_id, label, type,
  is_playoff, bracket_game_id, team1_source, team2_source, position) values
  ('40000000-0000-0000-0000-0000000000e6', '10000000-0000-0000-0000-0000000000e1',
   '20000000-0000-0000-0000-0000000000e1', null, null, 'Open', 'group',
   false, null, null, null, 5),
  ('40000000-0000-0000-0000-0000000000e7', '10000000-0000-0000-0000-0000000000e1',
   '20000000-0000-0000-0000-0000000000e1', null, null, 'Open', 'semi',
   true, 'P1', '{"type":"seed","rank":1}', '{"type":"seed","rank":2}', 6),
  ('40000000-0000-0000-0000-0000000000e8', '10000000-0000-0000-0000-0000000000e1',
   '20000000-0000-0000-0000-0000000000e1', null, null, 'Open', 'final',
   true, 'P2', '{"type":"winner","bracketGameId":"P1"}', '{"type":"seed","rank":2}', 7);
insert into public.game_scores (game_id, event_id, s1, s2) values
  ('40000000-0000-0000-0000-0000000000e2', '10000000-0000-0000-0000-0000000000e1', 0, null),
  ('40000000-0000-0000-0000-0000000000e3', '10000000-0000-0000-0000-0000000000e1', null, 0),
  ('40000000-0000-0000-0000-0000000000e4', '10000000-0000-0000-0000-0000000000e1', 10, 5);
insert into public.score_sources (game_id, mobile_game_id) values
  ('40000000-0000-0000-0000-0000000000e5', 'foreign-final');

select ok(to_regclass('public.score_sources_mobile_game_id_unique') is not null,
  'a non-null mobile final has a unique database key');
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select results_eq(
  $$select mobile_game_id from public.mobile_result_conflicts('10000000-0000-0000-0000-0000000000e1',
    array['foreign-final', 'unseen'])$$,
  $$values ('foreign-final'::text)$$,
  'the owner sees only the conflicting mobile ID, with no private fixture details');
select lives_ok(
  $$select public.approve_mobile_result('40000000-0000-0000-0000-0000000000e1', 51, 0,
    '{"mobile_game_id":"cg_40000000-0000-0000-0000-0000000000e1","league_id":"L1",
      "home_team_id":"m-hawks","away_team_id":"m-owls","home_pts":0,"away_pts":51}'::jsonb)$$,
  'the editor can approve the exact scheduled fixture with reversed teams and a zero score');
select results_eq(
  $$select s1, s2, mobile_game_id from public.score_sources where game_id = '40000000-0000-0000-0000-0000000000e1'$$,
  $$values (51, 0, 'cg_40000000-0000-0000-0000-0000000000e1')$$,
  'the score and provenance are recorded together');
select lives_ok(
  $$select public.approve_mobile_result('40000000-0000-0000-0000-0000000000e1', 52, 0,
    '{"mobile_game_id":"cg_40000000-0000-0000-0000-0000000000e1","league_id":"L1",
      "home_team_id":"m-hawks","away_team_id":"m-owls"}'::jsonb)$$,
  'the same final can be re-approved on its own fixture');
select throws_ok(
  $$select public.approve_mobile_result('40000000-0000-0000-0000-0000000000e2', 1, 2,
    '{"mobile_game_id":"cg_40000000-0000-0000-0000-0000000000e1","league_id":"L1"}'::jsonb)$$,
  '23514', null, 'a direct call cannot attach a claimed final elsewhere');
select throws_ok(
  $$select public.approve_mobile_result('40000000-0000-0000-0000-0000000000e2', 1, 2,
    '{"mobile_game_id":"cg_bad","league_id":"L1"}'::jsonb)$$,
  '22023', null, 'malformed cg_ IDs are rejected');
select throws_ok(
  $$select public.approve_mobile_result('40000000-0000-0000-0000-0000000000e2', 1, 2,
    '{"mobile_game_id":"cg_40000000-0000-0000-0000-0000000000e2","league_id":"wrong"}'::jsonb)$$,
  '23514', null, 'a stale league link is rejected');
select throws_ok(
  $$select public.approve_mobile_result('40000000-0000-0000-0000-0000000000e2', 1, 2,
    '{"mobile_game_id":"cg_40000000-0000-0000-0000-0000000000e2","league_id":"L1",
      "home_team_id":"other","away_team_id":"m-owls"}'::jsonb)$$,
  '23514', null, 'changed team links are rejected');
select throws_ok(
  $$select public.approve_mobile_result('40000000-0000-0000-0000-0000000000e2', 1, 2,
    '{"mobile_game_id":"cg_40000000-0000-0000-0000-0000000000e2","league_id":"L1",
      "home_team_id":"m-hawks","away_team_id":"m-owls"}'::jsonb)$$,
  '23514', null, 'a one-sided score including zero blocks initial approval');
select throws_ok(
  $$select public.approve_mobile_result('40000000-0000-0000-0000-0000000000e3', 1, 2,
    '{"mobile_game_id":"cg_40000000-0000-0000-0000-0000000000e3","league_id":"L1",
      "home_team_id":"m-hawks","away_team_id":"m-owls"}'::jsonb)$$,
  '23514', null, 'a score of zero on the other side also blocks approval');
select throws_ok(
  $$select public.approve_mobile_result('40000000-0000-0000-0000-0000000000e4', 1, 2,
    '{"mobile_game_id":"cg_40000000-0000-0000-0000-0000000000e4","league_id":"L1",
      "home_team_id":"m-hawks","away_team_id":"m-owls"}'::jsonb)$$,
  '23514', null, 'an existing final score blocks approval');
select throws_ok(
  $$select public.approve_mobile_result('40000000-0000-0000-0000-0000000000e2', 1, 2,
    '{"mobile_game_id":"cg_40000000-0000-0000-0000-0000000000e2","league_id":"L1",
      "home_team_id":"m-hawks","away_team_id":"m-owls"}'::jsonb)$$,
  '23514', null, 'a repeat attempt still cannot replace a partial score');
select throws_ok(
  $$select public.approve_mobile_result('40000000-0000-0000-0000-0000000000e5', 1, 2,
    '{"mobile_game_id":"cg_40000000-0000-0000-0000-0000000000e5","league_id":"L1"}'::jsonb)$$,
  '42501', null, 'another organiser''s fixture cannot be changed');
select throws_ok(
  $$select public.approve_mobile_result('40000000-0000-0000-0000-0000000000e6', 1, 2,
    '{"mobile_game_id":"cg_40000000-0000-0000-0000-0000000000e6","league_id":"L1",
      "home_team_id":"m-hawks","away_team_id":"m-owls"}'::jsonb)$$,
  '23514', null, 'a direct call cannot assign a scheduled final to a fixture with no teams');
select throws_ok(
  $$select public.approve_mobile_result('40000000-0000-0000-0000-0000000000e7', 1, 2,
    '{"mobile_game_id":"cg_40000000-0000-0000-0000-0000000000e7","league_id":"L1",
      "home_team_id":"m-hawks","away_team_id":"m-owls"}'::jsonb)$$,
  '23514', null, 'a direct call cannot approve an unresolved seeded playoff');
update public.game_scores set s1 = 60, s2 = 50 where game_id = '40000000-0000-0000-0000-0000000000e2';
update public.game_scores set s1 = 60, s2 = 50 where game_id = '40000000-0000-0000-0000-0000000000e3';
select lives_ok(
  $$select public.approve_mobile_result('40000000-0000-0000-0000-0000000000e7', 20, 10,
    '{"mobile_game_id":"cg_40000000-0000-0000-0000-0000000000e7","league_id":"L1",
      "home_team_id":"m-hawks","away_team_id":"m-owls"}'::jsonb)$$,
  'a resolved seeded playoff accepts its actual mapped teams');
select lives_ok(
  $$select public.approve_mobile_result('40000000-0000-0000-0000-0000000000e8', 30, 20,
    '{"mobile_game_id":"cg_40000000-0000-0000-0000-0000000000e8","league_id":"L1",
      "home_team_id":"m-hawks","away_team_id":"m-owls"}'::jsonb)$$,
  'a later playoff accepts the winner of a scored bracket fixture');
select pg_temp.login('00000000-0000-0000-0000-0000000000e2');
select throws_ok(
  $$select * from public.mobile_result_conflicts('10000000-0000-0000-0000-0000000000e1', array['foreign-final'])$$,
  '42501', null, 'another organiser cannot query conflict IDs for this event');
reset role;
select throws_ok(
  $$insert into public.score_sources (game_id, mobile_game_id) values
    ('40000000-0000-0000-0000-0000000000e2', 'cg_40000000-0000-0000-0000-0000000000e1')$$,
  '23505', null, 'the database rejects a duplicate mobile final even from a direct writer');

select * from finish();
rollback;
