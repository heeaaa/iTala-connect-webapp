-- Firebase import writer (MIGRATION_PLAN.md 12.1, Phase 7b): atomic, idempotent
-- on the legacy keys, migration import only, one audit row per import.
begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

create function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end;
$$;
create function pg_temp.logout() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000e001', 'import-owner@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000e002', 'import-other@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000e003', 'import-off@test.local', 'authenticated', 'authenticated');
update public.profiles set role = 'superadmin' where id = '00000000-0000-0000-0000-00000000e001';
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000e002';
update public.profiles set role = 'admin', disabled_at = now() where id = '00000000-0000-0000-0000-00000000e003';

-- One old event as scripts/migrate-firebase.ts plans it (src/migration/map-event.ts).
create temp table payload as select $json${
  "event": {
    "legacy_firebase_id": "-P1JcLF-aaaaaaaaaaaa", "legacy_created_by": "superadmin", "name": "Harbour Spring Cup",
    "status": "published", "schedule_days": ["2026-10-03"], "time_start": "09:00", "time_end": "20:00",
    "courts": 2, "court_names": ["Centre", "Court 2"], "timezone": "Pacific/Auckland",
    "theme_primary": "#FFCC00", "theme_bg": "#0D0D0D", "theme_text": "#E0E0E0", "theme_text_secondary": "#888888",
    "theme_heading": "#FFFFFF", "rules_html": "<p>Two halves</p>", "created_at": "2026-09-12T08:00:00.000Z"
  },
  "divisions": [{
    "legacy_key": "div_1", "name": "Open", "color": "#6C63FF", "bracket_count": 1, "custom_games_per_team": false,
    "games_per_team": null, "sort_order": 0,
    "teams": [
      {"legacy_code": "t_1", "name": "Harbour Hawks", "coach": "Sam", "sort_order": 0,
       "players": [{"name": "Ana", "number": "7", "sort_order": 0}, {"name": "Ben", "number": "12", "sort_order": 1}]},
      {"legacy_code": "t_2", "name": "Night Owls", "coach": "", "sort_order": 1, "players": []},
      {"legacy_code": "t_3", "name": "Kea", "coach": "", "sort_order": 2, "players": []}
    ],
    "mobile_link": {"league_id": "league-open", "league_name": "Harbour League", "season": "2026",
      "linked_at": "2026-09-14T00:00:00.000Z", "linked_by_legacy": "superadmin",
      "teams": [{"legacy_code": "t_1", "mobile_team_id": "team-hawks"}]}
  }],
  "games": [
    {"legacy_gid": "g_1", "legacy_index": 0, "legacy_team1": "t_1", "legacy_team2": "t_2", "division_key": "div_1",
     "day": "2026-10-03", "start_time": "09:00", "court": 1, "group_id": null,
     "team1": {"divisionKey": "div_1", "code": "t_1"}, "team2": {"divisionKey": "div_1", "code": "t_2"},
     "label": "Open", "type": "group", "is_playoff": false, "bracket_game_id": null, "team1_source": null,
     "team2_source": null, "playoff_round": null, "position": 0, "score": {"s1": 58, "s2": 51},
     "source": {"mobile_game_id": "fin-result", "league_id": "league-open", "s1": 58, "s2": 51, "home_pts": 58,
       "away_pts": 51, "event_count": 48, "last_event_at": "2026-10-03T09:40:00.000Z",
       "finished_at": "2026-10-03T09:40:00.000Z", "approved_by_legacy": "superadmin",
       "approved_at": "2026-10-03T09:50:00.000Z", "method": "manual", "dismissed_at": null}},
    {"legacy_gid": "g_2", "legacy_index": 1, "legacy_team1": "t_3", "legacy_team2": "t_1", "division_key": "div_1",
     "day": "2026-10-03", "start_time": "09:00", "court": 2, "group_id": null,
     "team1": {"divisionKey": "div_1", "code": "t_3"}, "team2": {"divisionKey": "div_1", "code": "t_1"},
     "label": "Open", "type": "group", "is_playoff": false, "bracket_game_id": null, "team1_source": null,
     "team2_source": null, "playoff_round": null, "position": 1, "score": {"s1": 40, "s2": null}, "source": null},
    {"legacy_gid": "g_3", "legacy_index": 2, "legacy_team1": "TBD", "legacy_team2": "TBD", "division_key": "div_1",
     "day": null, "start_time": null, "court": null, "group_id": null, "team1": null, "team2": null,
     "label": "Open - Finals", "type": "final", "is_playoff": true, "bracket_game_id": "po_div_1_1",
     "team1_source": {"type": "seed", "rank": 1}, "team2_source": {"type": "seed", "rank": 2}, "playoff_round": 1,
     "position": 2, "score": null, "source": null},
    {"legacy_gid": "import-3", "legacy_index": 3, "legacy_team1": "t_2", "legacy_team2": "t_gone", "division_key": null,
     "day": "2026-10-03", "start_time": "11:00", "court": 1, "group_id": null,
     "team1": {"divisionKey": "div_1", "code": "t_2"}, "team2": null,
     "label": "Friendly", "type": "group", "is_playoff": false, "bracket_game_id": null, "team1_source": null,
     "team2_source": null, "playoff_round": null, "position": 3, "score": null, "source": null}
  ]
}$json$::jsonb as p;

-- Only the migration import may run it.
select pg_temp.login('00000000-0000-0000-0000-00000000e001');
select throws_ok($$select public.import_legacy_event('00000000-0000-0000-0000-00000000e001', (select p from payload))$$,
  '42501', null, 'a signed-in superadmin cannot run the import');
select throws_ok($$select public.import_legacy_platform('<p>x</p>')$$, '42501', null, 'nor the platform import');
select pg_temp.logout();

select throws_ok($$select public.import_legacy_event('00000000-0000-0000-0000-00000000e003', (select p from payload))$$,
  '22023', 'The owner must be an active admin', 'a disabled admin cannot own imported events');
select throws_ok($$select public.import_legacy_event('00000000-0000-0000-0000-0000000000ff', (select p from payload))$$,
  '22023', 'The owner must be an active admin', 'nor someone without a profile');

-- First import.
create temp table first_run as
select public.import_legacy_event('00000000-0000-0000-0000-00000000e001', (select p from payload)) as r;
select is((select (r ->> 'created')::boolean from first_run), true, 'the first import creates the event');
select results_eq(
  $$select owner_id, legacy_created_by, name, status, schedule_days, courts, court_names, created_at
    from public.events where legacy_firebase_id = '-P1JcLF-aaaaaaaaaaaa'$$,
  $$values ('00000000-0000-0000-0000-00000000e001'::uuid, 'superadmin', 'Harbour Spring Cup', 'published',
            '{2026-10-03}'::date[], 2::smallint, '{Centre,"Court 2"}'::text[], '2026-09-12T08:00:00Z'::timestamptz)$$,
  'the event keeps its details, owner, old creator and creation time');
select results_eq(
  $$select t.name, t.sort_order, t.legacy_code from public.teams t join public.divisions d on d.id = t.division_id
    join public.events e on e.id = d.event_id where e.legacy_firebase_id = '-P1JcLF-aaaaaaaaaaaa' order by t.sort_order$$,
  $$values ('Harbour Hawks', 0, 't_1'), ('Night Owls', 1, 't_2'), ('Kea', 2, 't_3')$$,
  'teams keep their old codes and order');
select results_eq(
  $$select p.name, p.number from public.players p join public.teams t on t.id = p.team_id
    where t.legacy_code = 't_1' order by p.sort_order$$,
  $$values ('Ana', '7'), ('Ben', '12')$$, 'players are imported in order');
select results_eq(
  $$select g.legacy_gid, g.day, g.start_time, g.court, t1.legacy_code, t2.legacy_code, g.division_id is null
    from public.games g left join public.teams t1 on t1.id = g.team1_id left join public.teams t2 on t2.id = g.team2_id
    join public.events e on e.id = g.event_id where e.legacy_firebase_id = '-P1JcLF-aaaaaaaaaaaa' order by g.position$$,
  $$values ('g_1', '2026-10-03'::date, '09:00'::time, 1::smallint, 't_1', 't_2', false),
           ('g_2', '2026-10-03'::date, '09:00'::time, 2::smallint, 't_3', 't_1', false),
           ('g_3', null, null, null, null, null, false),
           ('import-3', '2026-10-03'::date, '11:00'::time, 1::smallint, 't_2', null, true)$$,
  'games keep their slots, teams (TBD and deleted teams empty) and a missing division');
select is((select team1_source from public.games where legacy_gid = 'g_3'), '{"type": "seed", "rank": 1}'::jsonb,
  'a playoff game keeps its seeding source');
select results_eq(
  $$select g.legacy_gid, s.s1, s.s2, s.updated_by from public.game_scores s join public.games g on g.id = s.game_id
    where g.event_id = (select id from public.events where legacy_firebase_id = '-P1JcLF-aaaaaaaaaaaa') order by g.position$$,
  $$values ('g_1', 58, 51, null::uuid), ('g_2', 40, null, null::uuid)$$,
  'scores are imported, a one-sided score as it was, with no person as the scorer');
select results_eq(
  $$select mobile_game_id, approved_by, approved_by_legacy, method from public.score_sources s
    join public.games g on g.id = s.game_id where g.legacy_gid = 'g_1'$$,
  $$values ('fin-result', null::uuid, 'superadmin', 'manual')$$, 'the mobile approval keeps the old approver as text');
select results_eq(
  $$select l.league_id, l.linked_by, l.linked_by_legacy, t.legacy_code, m.mobile_team_id
    from public.division_mobile_links l join public.division_mobile_team_links m on m.division_id = l.division_id
    join public.teams t on t.id = m.team_id where t.legacy_code = 't_1'$$,
  $$values ('league-open', null::uuid, 'superadmin', 't_1', 'team-hawks')$$, 'the mobile link and its team map are imported');
select results_eq(
  $$select action from public.audit_log where event_id = (select id from public.events where legacy_firebase_id = '-P1JcLF-aaaaaaaaaaaa')$$,
  $$values ('event.legacy_import')$$,
  'the import is one audit row, not one per event, score and approval');
select is((select detail ->> 'games' from public.audit_log where action = 'event.legacy_import'
            and event_id = (select id from public.events where legacy_firebase_id = '-P1JcLF-aaaaaaaaaaaa')), '4',
  'the audit row counts what was imported');

-- Remember ids to prove a second import keeps them.
create temp table ids as
select (select id from public.events where legacy_firebase_id = '-P1JcLF-aaaaaaaaaaaa') as event_id,
       (select id from public.games where legacy_gid = 'g_1') as g1,
       (select id from public.games where legacy_gid = 'g_2') as g2,
       (select id from public.teams where legacy_code = 't_1') as t1;

-- A superadmin reassigns the event in Connect, then a later export arrives:
-- g_1 and g_2 trade slots, g_2 loses its score, the friendly is gone, Kea is gone,
-- Hawks lose a player, the name changes and the mobile link is gone.
update public.events set owner_id = '00000000-0000-0000-0000-00000000e002' where id = (select event_id from ids);
update payload set p = jsonb_set(p, '{event,name}', '"Harbour Spring Cup 2026"');
update payload set p = jsonb_set(p, '{divisions,0,teams}', (p -> 'divisions' -> 0 -> 'teams') - 2);
update payload set p = jsonb_set(p, '{divisions,0,teams,0,players}', '[{"name": "Ana", "number": "7", "sort_order": 0}]');
update payload set p = jsonb_set(p, '{divisions,0,mobile_link}', 'null');
update payload set p = jsonb_set(p, '{games}', jsonb_build_array(
  jsonb_set(p -> 'games' -> 0, '{court}', '2'),
  jsonb_set(jsonb_set(jsonb_set(p -> 'games' -> 1, '{court}', '1'), '{score}', 'null'),
            '{team1}', '{"divisionKey": "div_1", "code": "t_2"}'),
  p -> 'games' -> 2));

create temp table second_run as
select public.import_legacy_event('00000000-0000-0000-0000-00000000e001', (select p from payload)) as r;
select is((select (r ->> 'created')::boolean from second_run), false, 'the second import updates the same event');
select is((select count(*)::int from public.events where legacy_firebase_id = '-P1JcLF-aaaaaaaaaaaa'), 1, 'with no copy');
select results_eq(
  $$select id, owner_id, name from public.events where legacy_firebase_id = '-P1JcLF-aaaaaaaaaaaa'$$,
  $$select event_id, '00000000-0000-0000-0000-00000000e002'::uuid, 'Harbour Spring Cup 2026' from ids$$,
  'the event keeps its id and the new owner; its details follow the export');
select results_eq(
  $$select id, court from public.games where legacy_gid in ('g_1', 'g_2') order by position$$,
  $$select g1, 2::smallint from ids union all select g2, 1::smallint from ids$$,
  'games keep their ids and can trade slots');
select is((select count(*)::int from public.games where legacy_gid = 'import-3'), 0, 'a game no longer in the export is removed');
select is((select count(*)::int from public.game_scores s join public.games g on g.id = s.game_id where g.legacy_gid = 'g_2'), 0,
  'a score no longer in the export is removed');
select is((select count(*)::int from public.teams where legacy_code = 't_3'), 0, 'a team no longer in the export is removed');
select is((select id from public.teams where legacy_code = 't_1'), (select t1 from ids), 'a kept team keeps its id');
select is((select count(*)::int from public.players p join public.teams t on t.id = p.team_id where t.legacy_code = 't_1'), 1,
  'the player list is replaced');
select is((select count(*)::int from public.division_mobile_links l join public.divisions d on d.id = l.division_id
            where d.event_id = (select event_id from ids)), 0, 'a mobile link no longer in the export is removed');
select results_eq(
  $$select action from public.audit_log where event_id = (select event_id from ids) order by action$$,
  $$values ('event.legacy_import'), ('event.legacy_import'), ('event.reassign')$$,
  'the second import adds one audit row and nothing else (the reassignment was audited as usual)');

-- A payload that breaks a rule changes nothing (one transaction).
update payload set p = jsonb_set(jsonb_set(p, '{games,0,court}', '1'), '{event,name}', '"Broken import"');
select throws_ok($$select public.import_legacy_event('00000000-0000-0000-0000-00000000e001', (select p from payload))$$,
  '23505', null, 'two games in one slot are refused');
select results_eq(
  $$select name from public.events where legacy_firebase_id = '-P1JcLF-aaaaaaaaaaaa'$$,
  $$values ('Harbour Spring Cup 2026')$$, 'and the failed import changed nothing');

-- Ordinary changes after the import are audited as before.
select pg_temp.login('00000000-0000-0000-0000-00000000e002');
select lives_ok($$select public.set_score((select g1 from ids), 60, 51)$$, 'the owner records a score');
select pg_temp.logout();
select is((select count(*)::int from public.audit_log where action = 'score.set' and event_id = (select event_id from ids)), 1,
  'and that score change is audited');

-- Platform: the default rules are filled in only when Connect has none.
update public.platform_settings set default_rules_html = '';
select is(public.import_legacy_platform('<p>Be kind</p>'), true, 'the old default rules fill an empty template');
select is(public.import_legacy_platform('<p>Other</p>'), false, 'but never replace one already set');
select is((select default_rules_html from public.platform_settings), '<p>Be kind</p>', 'the first stays');

select * from finish();
rollback;
