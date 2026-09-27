-- Firebase import guards (7b/7c review): nobody else can run the writers; a
-- re-import refuses to undo work done in iTala Connect, to recreate an event
-- deleted there, or to apply a cleared export, unless forced; incomplete
-- payloads are refused; a partial image copy keeps what is stored.
--
-- One test transaction has one clock, so a "later change in Connect" is
-- given a later time explicitly (the integration test covers real time).
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

create function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end;
$$;
create function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
end;
$$;
create function pg_temp.logout() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000a001', 'guard-owner@test.local', 'authenticated', 'authenticated');
update public.profiles set role = 'superadmin' where id = '00000000-0000-0000-0000-00000000a001';

-- Four scored games, so the cleared-export guard has something to guard.
create temp table payload as select $json${
  "event": {
    "legacy_firebase_id": "-P1JcLF-guardsaaaaaa", "legacy_created_by": "admin", "name": "Guarded",
    "status": "published", "schedule_days": ["2026-10-03"], "time_start": "09:00", "time_end": "20:00",
    "courts": 1, "court_names": ["Court 1"], "timezone": "Pacific/Auckland",
    "theme_primary": "#FFCC00", "theme_bg": "#0D0D0D", "theme_text": "#E0E0E0", "theme_text_secondary": "#888888",
    "theme_heading": "#FFFFFF", "rules_html": "", "created_at": null
  },
  "divisions": [{
    "legacy_key": "div_1", "name": "Open", "color": "#6C63FF", "bracket_count": 1, "custom_games_per_team": false,
    "games_per_team": null, "sort_order": 0,
    "teams": [
      {"legacy_code": "t_1", "name": "Hawks", "coach": "", "sort_order": 0, "players": []},
      {"legacy_code": "t_2", "name": "Owls", "coach": "", "sort_order": 1, "players": []}
    ],
    "mobile_link": {"league_id": "league-open", "league_name": "Harbour League", "season": null,
      "linked_at": "2026-09-14T00:00:00.000Z", "linked_by_legacy": "admin", "teams": []}
  }],
  "games": []
}$json$::jsonb as p;
update payload set p = jsonb_set(p, '{games}', (
  select jsonb_agg(jsonb_build_object(
    'legacy_gid', 'g_' || n, 'legacy_index', n, 'legacy_team1', 't_1', 'legacy_team2', 't_2', 'division_key', 'div_1',
    'day', '2026-10-03', 'start_time', (8 + n) || ':00', 'court', 1, 'group_id', null,
    'team1', jsonb_build_object('divisionKey', 'div_1', 'code', 't_1'),
    'team2', jsonb_build_object('divisionKey', 'div_1', 'code', 't_2'),
    'label', 'Open', 'type', 'group', 'is_playoff', false, 'bracket_game_id', null, 'team1_source', null,
    'team2_source', null, 'playoff_round', null, 'position', n, 'score', jsonb_build_object('s1', 50 + n, 's2', 40),
    'source', null) order by n)
  from generate_series(1, 4) n));

-- Nobody but the migration import.
select pg_temp.as_anon();
select throws_ok($$select public.import_legacy_event('00000000-0000-0000-0000-00000000a001', '{}'::jsonb)$$,
  '42501', null, 'anon cannot run the import');
select throws_ok($$select public.set_legacy_event_images('10000000-0000-0000-0000-000000000000', null, '[]'::jsonb)$$,
  '42501', null, 'nor set imported images');
select throws_ok($$select public.import_legacy_platform('<p>x</p>')$$, '42501', null, 'nor the default rules');
select throws_ok($$select public.set_legacy_platform_sponsors('[]'::jsonb)$$, '42501', null, 'nor the platform sponsors');
select pg_temp.login('00000000-0000-0000-0000-00000000a001');
select throws_ok($$select public.set_legacy_event_images('10000000-0000-0000-0000-000000000000', null, '[]'::jsonb, false)$$,
  '42501', null, 'a signed-in superadmin cannot set imported images');
select pg_temp.logout();
-- The check inside the function holds even if EXECUTE were granted by mistake.
grant execute on function public.import_legacy_event(uuid, jsonb, boolean) to authenticated;
select pg_temp.login('00000000-0000-0000-0000-00000000a001');
select throws_ok($$select public.import_legacy_event('00000000-0000-0000-0000-00000000a001', (select p from payload))$$,
  '42501', 'Only the migration import can import legacy events', 'the function refuses a signed-in caller itself');
select pg_temp.logout();
revoke execute on function public.import_legacy_event(uuid, jsonb, boolean) from authenticated;
select hasnt_function('public', 'import_legacy_event', array['uuid', 'jsonb'], 'the unguarded version is gone');

-- A missing list is refused, never read as "none".
select throws_ok($$select public.import_legacy_event('00000000-0000-0000-0000-00000000a001', (select p - 'games' from payload))$$,
  '22023', 'The import payload is incomplete', 'a payload without games is refused');
select throws_ok($$select public.import_legacy_event('00000000-0000-0000-0000-00000000a001',
    (select jsonb_set(p, '{divisions,0,teams,0}', (p #> '{divisions,0,teams,0}') - 'players') from payload))$$,
  '22023', 'The import payload is incomplete', 'a team without its player list is refused');

select lives_ok($$select public.import_legacy_event('00000000-0000-0000-0000-00000000a001', (select p from payload))$$,
  'the first import');
create temp table ids as select id as event_id from public.events where legacy_firebase_id = '-P1JcLF-guardsaaaaaa';
select lives_ok($$select public.import_legacy_event('00000000-0000-0000-0000-00000000a001', (select p from payload))$$,
  'importing again with nothing changed in Connect');

-- A change recorded in Connect after the import.
insert into public.audit_log (actor_id, action, event_id, at)
select '00000000-0000-0000-0000-00000000a001', 'score.set', event_id, now() + interval '1 minute' from ids;
select throws_ok($$select public.import_legacy_event('00000000-0000-0000-0000-00000000a001', (select p from payload))$$,
  '55000', 'This event was changed in iTala Connect since its last import (it has a change recorded as score.set)',
  'a re-import will not undo a score entered in Connect');
select lives_ok($$select public.import_legacy_event('00000000-0000-0000-0000-00000000a001', (select p from payload), true)$$,
  'unless it is forced for this event');
select is((select (detail ->> 'forced')::boolean from public.audit_log where action = 'event.legacy_import'
            and event_id = (select event_id from ids) order by id desc limit 1), true, 'and the audit row says it was forced');
delete from public.audit_log where action = 'score.set' and event_id = (select event_id from ids);

-- The event edited in Connect (its row stamped later than the import).
alter table public.events disable trigger events_updated_at;
update public.events set updated_at = now() + interval '1 minute' where id = (select event_id from ids);
alter table public.events enable trigger events_updated_at;
select throws_ok($$select public.import_legacy_event('00000000-0000-0000-0000-00000000a001', (select p from payload))$$,
  '55000', 'This event was changed in iTala Connect since its last import (its details were edited)',
  'a re-import will not undo an edit made in Connect');
alter table public.events disable trigger events_updated_at;
update public.events set updated_at = now() where id = (select event_id from ids);
alter table public.events enable trigger events_updated_at;

-- A division added in Connect.
insert into public.divisions (event_id, name, created_at, updated_at)
select event_id, 'Added in Connect', now() + interval '1 minute', now() + interval '1 minute' from ids;
select throws_ok($$select public.import_legacy_event('00000000-0000-0000-0000-00000000a001', (select p from payload))$$,
  '55000', 'This event was changed in iTala Connect since its last import (a division was added or edited)',
  'a re-import will not delete a division added in Connect');
delete from public.divisions where name = 'Added in Connect';

-- A cleared or partial export.
select throws_ok($$select public.import_legacy_event('00000000-0000-0000-0000-00000000a001',
    (select jsonb_set(p, '{games}', jsonb_build_array(p #> '{games,0}')) from payload))$$,
  '55000', 'The export has far fewer games or scores for this event than iTala Connect holds (4 games, 4 scores)',
  'an export with far fewer games is refused');
select lives_ok($$select public.import_legacy_event('00000000-0000-0000-0000-00000000a001',
    (select jsonb_set(p, '{games}', jsonb_build_array(p #> '{games,0}')) from payload), true)$$,
  'unless it is forced');
select is((select count(*)::int from public.games where event_id = (select event_id from ids)), 1, 'and then it applies');

-- The link: a re-import keeps the stored time when the export has none, and clears a Connect linker.
update public.division_mobile_links set linked_by = '00000000-0000-0000-0000-00000000a001'
where division_id = (select id from public.divisions where event_id = (select event_id from ids));
update payload set p = jsonb_set(p, '{divisions,0,mobile_link,linked_at}', 'null');
select lives_ok($$select public.import_legacy_event('00000000-0000-0000-0000-00000000a001', (select p from payload), true)$$,
  'a re-import with no link time');
select results_eq(
  $$select linked_at, linked_by from public.division_mobile_links
    where division_id = (select id from public.divisions where event_id = (select event_id from ids))$$,
  $$values ('2026-09-14T00:00:00Z'::timestamptz, null::uuid)$$,
  'the link keeps its time and names no Connect linker');

-- Images: a partial copy fills empty slots only, and returns nothing to remove.
select is(public.set_legacy_event_images((select event_id from ids), 'events/' || (select event_id from ids) || '/logo-legacy-aaaa.png',
  jsonb_build_array(jsonb_build_object('tier', 'minor', 'image_path', 'events/' || (select event_id from ids) || '/minor-legacy-bbbb.png', 'sort_order', 0))),
  '{}'::text[], 'a full copy sets the images');
select is(public.set_legacy_event_images((select event_id from ids), 'events/' || (select event_id from ids) || '/logo-legacy-cccc.png',
  '[]'::jsonb, false), '{}'::text[], 'a partial copy returns nothing to remove');
select results_eq(
  $$select e.logo_path, (select array_agg(s.image_path) from public.event_sponsors s where s.event_id = e.id)
    from public.events e where e.id = (select event_id from ids)$$,
  $$select 'events/' || event_id || '/logo-legacy-aaaa.png', array['events/' || event_id || '/minor-legacy-bbbb.png'] from ids$$,
  'and keeps the logo and sponsors copied before');
select lives_ok($$select public.import_legacy_event('00000000-0000-0000-0000-00000000a001', (select p from payload))$$,
  'the image step is part of the import, not a change in Connect');

-- Deleted in Connect.
delete from public.events where id = (select event_id from ids);
select throws_ok($$select public.import_legacy_event('00000000-0000-0000-0000-00000000a001', (select p from payload))$$,
  '55000', 'This event was imported before and has since been deleted in iTala Connect',
  'a re-import will not bring back an event deleted in Connect');
select is((select (public.import_legacy_event('00000000-0000-0000-0000-00000000a001', (select p from payload), true) ->> 'created')::boolean),
  true, 'unless it is forced, which creates it again');

select * from finish();
rollback;
