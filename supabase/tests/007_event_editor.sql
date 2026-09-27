-- save_event_editor: permissions, version check and published-event rules.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

create function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end;
$$;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000e1', 'editor-a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000e2', 'editor-b@test.local', 'authenticated', 'authenticated');
update public.profiles set role = 'admin'
where id in ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e2');

insert into public.events (id, owner_id, name, schedule_days, courts, court_names) values
  ('10000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e1', 'Editor', '{2026-10-03}', 2,
   '{Court 1,Court 2}');
insert into public.divisions (id, event_id, name) values
  ('20000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-0000000000e1', 'Open');
insert into public.teams (id, division_id, name, sort_order) values
  ('30000000-0000-0000-0000-0000000000e1', '20000000-0000-0000-0000-0000000000e1', 'Hawks', 0),
  ('30000000-0000-0000-0000-0000000000e2', '20000000-0000-0000-0000-0000000000e1', 'Owls', 1);

select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select public.publish_event('10000000-0000-0000-0000-0000000000e1', $$[
  {"id": "40000000-0000-0000-0000-0000000000e1", "division_id": "20000000-0000-0000-0000-0000000000e1",
   "day": "2026-10-03", "start_time": "09:00", "court": 2,
   "team1_id": "30000000-0000-0000-0000-0000000000e1", "team2_id": "30000000-0000-0000-0000-0000000000e2",
   "position": 0}
]$$::jsonb, false);
select public.set_score('40000000-0000-0000-0000-0000000000e1', 50, 44);

create temp table args as select
  $${"name": "Editor", "schedule_days": ["2026-10-03"], "time_start": "09:00", "time_end": "20:00", "courts": 1,
     "court_names": ["Court 1"], "timezone": "Pacific/Auckland", "theme_primary": "#FFCC00",
     "theme_bg": "#0D0D0D", "theme_text": "#E0E0E0", "theme_text_secondary": "#888888",
     "theme_heading": "#FFFFFF"}$$::jsonb as details,
  $$[{"id": "20000000-0000-0000-0000-0000000000e1", "name": "Open", "color": "#6C63FF", "bracket_count": 1,
      "custom_games_per_team": false, "games_per_team": 0, "teams": [
        {"id": "30000000-0000-0000-0000-0000000000e1", "name": "Hawks", "coach": "", "players": []}]}]$$::jsonb
    as divisions;
grant select on args to authenticated;

select throws_ok(
  $$select public.save_event_editor('10000000-0000-0000-0000-0000000000e1', '2020-01-01', (select details from args),
    (select divisions from args))$$,
  '40001', null, 'a stale version is refused');

select lives_ok(
  $$select public.save_event_editor('10000000-0000-0000-0000-0000000000e1',
    (select updated_at from public.events where id = '10000000-0000-0000-0000-0000000000e1'),
    (select details from args), (select divisions from args), '{40000000-0000-0000-0000-0000000000e1}')$$,
  'the owner saves a published event');
select is((select status from public.events where id = '10000000-0000-0000-0000-0000000000e1'), 'published',
  'saving keeps the event published');
select is((select court from public.games where id = '40000000-0000-0000-0000-0000000000e1'), null,
  'a listed game moves to Unscheduled');
select is((select team2_id from public.games where id = '40000000-0000-0000-0000-0000000000e1'), null,
  'a removed team leaves its game TBD');
select is((select s1 from public.game_scores where game_id = '40000000-0000-0000-0000-0000000000e1'), 50,
  'the save does not touch scores');

select lives_ok(
  $$select public.save_event_editor('10000000-0000-0000-0000-0000000000e1',
    (select updated_at from public.events where id = '10000000-0000-0000-0000-0000000000e1'),
    (select details from args), '[]'::jsonb)$$,
  'removing the last division saves');
select is((select count(*)::int from public.games where event_id = '10000000-0000-0000-0000-0000000000e1'), 0,
  'a removed division takes its games with it');

select pg_temp.login('00000000-0000-0000-0000-0000000000e2');
select throws_ok(
  $$select public.save_event_editor('10000000-0000-0000-0000-0000000000e1', now(), '{}'::jsonb, '[]'::jsonb)$$,
  '42501', null, 'another admin cannot save the event');

select * from finish();
rollback;
