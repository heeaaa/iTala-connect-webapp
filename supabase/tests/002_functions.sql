-- Atomic operations, integrity constraints and audit entries.
begin;
create extension if not exists pgtap with schema extensions;
select plan(43);

create function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end;
$$;

create function pg_temp.as_postgres() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.local', 'authenticated', 'authenticated');
update public.profiles set role = 'admin';

insert into public.events (id, owner_id, name, schedule_days) values
  ('10000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'Spring Hoops', '{2026-10-03}'),
  ('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'B event', '{2026-10-03}');
insert into public.divisions (id, event_id, name) values
  ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a1', 'Open'),
  ('20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-0000000000a1', 'U18'),
  ('20000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b1', 'Open');
insert into public.teams (id, division_id, name, sort_order) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-0000000000a1', 'Hawks', 0),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-0000000000a1', 'Owls', 1),
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-0000000000a1', 'Kea', 2),
  ('30000000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-0000000000b1', 'Tui', 0);

-- ---------------------------------------------------------------------------
-- publish_event
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000a');

select is(
  public.publish_event('10000000-0000-0000-0000-0000000000a1', $$[
    {"id": "40000000-0000-0000-0000-000000000001", "division_id": "20000000-0000-0000-0000-0000000000a1",
     "day": "2026-10-03", "start_time": "09:00", "court": 1,
     "team1_id": "30000000-0000-0000-0000-000000000001", "team2_id": "30000000-0000-0000-0000-000000000002",
     "label": "Open", "type": "group", "position": 0},
    {"id": "40000000-0000-0000-0000-000000000002", "division_id": "20000000-0000-0000-0000-0000000000a1",
     "day": "2026-10-03", "start_time": "10:00", "court": 1,
     "team1_id": "30000000-0000-0000-0000-000000000002", "team2_id": "30000000-0000-0000-0000-000000000003",
     "position": 1},
    {"division_id": "20000000-0000-0000-0000-0000000000a1",
     "team1_id": "30000000-0000-0000-0000-000000000001", "team2_id": "30000000-0000-0000-0000-000000000003",
     "position": 2}
  ]$$::jsonb, false),
  3, 'publish inserts every game');
select is((select status from public.events where id = '10000000-0000-0000-0000-0000000000a1'), 'published',
  'publish sets the event to published');
select isnt((select published_at from public.events where id = '10000000-0000-0000-0000-0000000000a1'), null,
  'publish stamps published_at');
select ok(exists (select 1 from public.games where id = '40000000-0000-0000-0000-000000000001'),
  'publish keeps supplied game ids');
select is((select count(*)::int from public.games
  where event_id = '10000000-0000-0000-0000-0000000000a1' and day is null), 1,
  'a game without a slot is stored as unscheduled');

select throws_ok(
  $$select public.publish_event('10000000-0000-0000-0000-0000000000b1', '[]'::jsonb, false)$$,
  '42501', null, 'an admin cannot publish another admin''s event');

select throws_ok(
  $$select public.publish_event('10000000-0000-0000-0000-0000000000a1', $j$[
    {"division_id": "20000000-0000-0000-0000-0000000000a1", "day": "2026-10-03", "start_time": "09:00", "court": 1,
     "team1_id": "30000000-0000-0000-0000-000000000001", "team2_id": "30000000-0000-0000-0000-000000000002"},
    {"division_id": "20000000-0000-0000-0000-0000000000a1", "day": "2026-10-03", "start_time": "09:00", "court": 1,
     "team1_id": "30000000-0000-0000-0000-000000000002", "team2_id": "30000000-0000-0000-0000-000000000003"}
  ]$j$::jsonb, false)$$,
  '23505', null, 'two games in one slot are rejected');
select is((select count(*)::int from public.games where event_id = '10000000-0000-0000-0000-0000000000a1'), 3,
  'a failed publish changes nothing (atomic)');

select throws_ok(
  $$select public.append_games('10000000-0000-0000-0000-0000000000a1', $j$[
    {"division_id": "20000000-0000-0000-0000-0000000000a1",
     "team1_id": "30000000-0000-0000-0000-000000000001", "team2_id": "30000000-0000-0000-0000-0000000000b1"}
  ]$j$::jsonb)$$,
  '23514', null, 'a game cannot use a team from another event');
select throws_ok(
  $$select public.append_games('10000000-0000-0000-0000-0000000000a1', $j$[
    {"division_id": "20000000-0000-0000-0000-0000000000a1",
     "team1_id": "30000000-0000-0000-0000-000000000001", "team2_id": "30000000-0000-0000-0000-000000000001"}
  ]$j$::jsonb)$$,
  '23514', null, 'a team cannot play itself');
select throws_ok(
  $$select public.append_games('10000000-0000-0000-0000-0000000000a1', $j$[
    {"division_id": "20000000-0000-0000-0000-0000000000b1"}
  ]$j$::jsonb)$$,
  '23514', null, 'a game cannot use a division from another event');
select throws_ok(
  $$select public.append_games('10000000-0000-0000-0000-0000000000a1', $j$[
    {"division_id": "20000000-0000-0000-0000-0000000000a1", "day": "2026-10-03"}
  ]$j$::jsonb)$$,
  '23514', null, 'a half-scheduled game (day but no time or court) is rejected');
select is(
  public.append_games('10000000-0000-0000-0000-0000000000a1', $j$[
    {"id": "40000000-0000-0000-0000-000000000009", "division_id": "20000000-0000-0000-0000-0000000000a2",
     "day": "2026-10-03", "start_time": "11:00", "court": 1, "label": "Final", "type": "final",
     "is_playoff": true, "bracket_game_id": "F1",
     "team1_source": {"kind": "seed", "seed": 1}, "team2_source": {"kind": "seed", "seed": 2}}
  ]$j$::jsonb),
  1, 'append_games adds playoff games with seed sources');

-- ---------------------------------------------------------------------------
-- Drag and drop
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select public.move_game('40000000-0000-0000-0000-000000000002', '2026-10-03', '09:00', 1::smallint)$$,
  '23505', null, 'moving into an occupied slot is rejected');
select lives_ok(
  $$select public.move_game('40000000-0000-0000-0000-000000000002', '2026-10-03', '12:00', 1::smallint)$$,
  'moving into a free slot works');
select lives_ok(
  $$select public.swap_games('40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002')$$,
  'swapping two scheduled games works');
select results_eq(
  $$select start_time from public.games where id in ('40000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000002') order by id$$,
  $$values ('12:00'::time), ('09:00'::time)$$,
  'swap exchanges the two slots');
select lives_ok(
  $$select public.unschedule_game('40000000-0000-0000-0000-000000000001')$$,
  'unschedule works');
select is((select day from public.games where id = '40000000-0000-0000-0000-000000000001'), null,
  'unscheduled game has no day');
select throws_ok(
  $$select public.move_game('40000000-0000-0000-0000-000000000001', '2026-10-03', null, 1::smallint)$$,
  '22023', null, 'a move needs a full slot');

-- ---------------------------------------------------------------------------
-- Scores
-- ---------------------------------------------------------------------------
select lives_ok(
  $$select public.set_score('40000000-0000-0000-0000-000000000002', 45, 40)$$, 'set_score records a score');
select is((select updated_by from public.game_scores where game_id = '40000000-0000-0000-0000-000000000002'),
  '00000000-0000-0000-0000-00000000000a'::uuid, 'the score records who entered it');
select is((select event_id from public.game_scores where game_id = '40000000-0000-0000-0000-000000000002'),
  '10000000-0000-0000-0000-0000000000a1'::uuid, 'the score carries the game''s event');
select throws_ok(
  $$select public.set_score('40000000-0000-0000-0000-000000000002', -1, 40)$$,
  '23514', null, 'negative scores are rejected');
select lives_ok(
  $$insert into public.game_scores (game_id, event_id, s1, s2, updated_by)
    values ('40000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-0000000000b1', 1, 2,
            '00000000-0000-0000-0000-00000000000b')$$,
  'a direct score insert by the editor is allowed');
select results_eq(
  $$select event_id, updated_by from public.game_scores where game_id = '40000000-0000-0000-0000-000000000009'$$,
  $$values ('10000000-0000-0000-0000-0000000000a1'::uuid, '00000000-0000-0000-0000-00000000000a'::uuid)$$,
  'forged event_id and updated_by are replaced from the game and the session');

select lives_ok(
  $$select public.approve_mobile_result('40000000-0000-0000-0000-000000000009', 60, 55,
    '{"mobile_game_id": "m-9", "league_id": "L-1", "home_pts": 60, "away_pts": 55, "method": "mobile"}'::jsonb)$$,
  'approve_mobile_result records score and provenance');
select results_eq(
  $$select s.s1, s.s2, p.mobile_game_id, p.approved_by from public.game_scores s
    join public.score_sources p using (game_id) where s.game_id = '40000000-0000-0000-0000-000000000009'$$,
  $$values (60, 55, 'm-9'::text, '00000000-0000-0000-0000-00000000000a'::uuid)$$,
  'approved score and provenance are written together');
select lives_ok(
  $$select public.set_score('40000000-0000-0000-0000-000000000009', 61, 55)$$, 'manual edit after approval');
select is((select count(*)::int from public.score_sources where game_id = '40000000-0000-0000-0000-000000000009'), 0,
  'a manual edit drops mobile provenance');
select lives_ok(
  $$select public.set_score('40000000-0000-0000-0000-000000000009', null, null)$$, 'clearing a score');
select is((select count(*)::int from public.game_scores where game_id = '40000000-0000-0000-0000-000000000009'), 0,
  'clearing removes the score row');

-- ---------------------------------------------------------------------------
-- Re-publish (E-62)
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select public.publish_event('10000000-0000-0000-0000-0000000000a1', '[]'::jsonb, false)$$,
  'P0001', null, 're-publish with recorded scores needs confirmation');
select is((select count(*)::int from public.games where event_id = '10000000-0000-0000-0000-0000000000a1'), 4,
  'declining re-publish changes nothing');
select is(public.publish_event('10000000-0000-0000-0000-0000000000a1', '[]'::jsonb, true), 0,
  're-publish with confirmation rebuilds from scratch');
select is((select count(*)::int from public.game_scores where event_id = '10000000-0000-0000-0000-0000000000a1'), 0,
  're-publish with confirmation clears scores');

select pg_temp.as_postgres();
select set_eq(
  $$select action from public.audit_log where event_id = '10000000-0000-0000-0000-0000000000a1'$$,
  $$values ('event.create'), ('event.publish'), ('event.republish'), ('score.set'), ('score.clear'),
           ('result.approve'), ('games.delete')$$,
  'publish, re-publish, scores, approval and deletes are audited');
select is((select actor_id from public.audit_log where action = 'event.republish'),
  '00000000-0000-0000-0000-00000000000a'::uuid, 'audit entries record the actor');

-- ---------------------------------------------------------------------------
-- Integrity: mobile team map, sponsors, time zone
-- ---------------------------------------------------------------------------
insert into public.division_mobile_links (division_id, league_id) values ('20000000-0000-0000-0000-0000000000a1', 'L-1');
insert into public.division_mobile_team_links (division_id, team_id, mobile_team_id) values
  ('20000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-000000000001', 'mt-1');
select throws_ok(
  $$insert into public.division_mobile_team_links (division_id, team_id, mobile_team_id) values
    ('20000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-000000000002', 'mt-1')$$,
  '23505', null, 'one mobile team maps to at most one Connect team');
select throws_ok(
  $$insert into public.division_mobile_team_links (division_id, team_id, mobile_team_id) values
    ('20000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-0000000000b1', 'mt-2')$$,
  '23514', null, 'a linked team must belong to the division');

insert into public.event_sponsors (event_id, tier, image_path) values
  ('10000000-0000-0000-0000-0000000000a1', 'major', 'events/10000000-0000-0000-0000-0000000000a1/major.png');
select throws_ok(
  $$insert into public.event_sponsors (event_id, tier, image_path) values
    ('10000000-0000-0000-0000-0000000000a1', 'major', 'events/10000000-0000-0000-0000-0000000000a1/major2.png')$$,
  '23505', null, 'an event has at most one major sponsor');
select throws_ok(
  $$update public.events set timezone = 'Mars/Olympus' where id = '10000000-0000-0000-0000-0000000000a1'$$,
  '22023', null, 'unknown time zones are rejected');
select throws_ok(
  $$update public.events set theme_primary = 'red' where id = '10000000-0000-0000-0000-0000000000a1'$$,
  '23514', null, 'event colours must be #RRGGBB');

select * from finish();
rollback;
