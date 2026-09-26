-- add_round_robin (E-63), add_playoff (E-64) and distinct event days.
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

create function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end;
$$;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000f1', 'rr-owner@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000f2', 'rr-other@test.local', 'authenticated', 'authenticated');
update public.profiles set role = 'admin'
where id in ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f2');

insert into public.events (id, owner_id, name, schedule_days, courts) values
  ('10000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f1', 'Published',
   '{2026-10-03,2026-10-04}', 2),
  ('10000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000f2', 'Other', '{2026-10-03}', 1),
  ('10000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000f1', 'Draft', '{2026-10-03}', 1);
insert into public.divisions (id, event_id, name, custom_games_per_team, games_per_team) values
  ('20000000-0000-0000-0000-0000000000f1', '10000000-0000-0000-0000-0000000000f1', 'Open', true, 2),
  ('20000000-0000-0000-0000-0000000000f2', '10000000-0000-0000-0000-0000000000f2', 'Other', false, null),
  ('20000000-0000-0000-0000-0000000000f3', '10000000-0000-0000-0000-0000000000f3', 'Draft', false, null);
insert into public.teams (id, division_id, name, sort_order) values
  ('30000000-0000-0000-0000-0000000000f1', '20000000-0000-0000-0000-0000000000f1', 'Hawks', 0),
  ('30000000-0000-0000-0000-0000000000f2', '20000000-0000-0000-0000-0000000000f1', 'Owls', 1),
  ('30000000-0000-0000-0000-0000000000f3', '20000000-0000-0000-0000-0000000000f1', 'Kea', 2);

select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
-- Stored order is not time order: the day-two game has position 0.
select public.publish_event('10000000-0000-0000-0000-0000000000f1', $$[
  {"id": "40000000-0000-0000-0000-0000000000f1", "division_id": "20000000-0000-0000-0000-0000000000f1",
   "day": "2026-10-04", "start_time": "09:00", "court": 1,
   "team1_id": "30000000-0000-0000-0000-0000000000f1", "team2_id": "30000000-0000-0000-0000-0000000000f2",
   "position": 0},
  {"id": "40000000-0000-0000-0000-0000000000f2", "division_id": "20000000-0000-0000-0000-0000000000f1",
   "day": "2026-10-03", "start_time": "13:00", "court": 1,
   "team1_id": "30000000-0000-0000-0000-0000000000f2", "team2_id": "30000000-0000-0000-0000-0000000000f3",
   "position": 1},
  {"id": "40000000-0000-0000-0000-0000000000f3", "division_id": "20000000-0000-0000-0000-0000000000f1",
   "team1_id": "30000000-0000-0000-0000-0000000000f1", "team2_id": "30000000-0000-0000-0000-0000000000f3",
   "position": 2}
]$$::jsonb, false);

create temp table batches as select
  $$[{"id": "40000000-0000-0000-0000-0000000000f4", "division_id": "20000000-0000-0000-0000-0000000000f1",
      "day": "2026-10-03", "start_time": "09:00", "court": 1,
      "team1_id": "30000000-0000-0000-0000-0000000000f1", "team2_id": "30000000-0000-0000-0000-0000000000f3",
      "label": "Open", "position": 3},
     {"id": "40000000-0000-0000-0000-0000000000f5", "division_id": "20000000-0000-0000-0000-0000000000f1",
      "team1_id": "30000000-0000-0000-0000-0000000000f1", "team2_id": "30000000-0000-0000-0000-0000000000f2",
      "label": "Open", "position": 4}]$$::jsonb as round_robin,
  $$[{"id": "40000000-0000-0000-0000-0000000000f7", "division_id": "20000000-0000-0000-0000-0000000000f1",
      "day": "2026-10-03", "start_time": "13:00", "court": 1, "label": "Open", "position": 3}]$$::jsonb as clash,
  $$[{"id": "40000000-0000-0000-0000-0000000000f6", "division_id": "20000000-0000-0000-0000-0000000000f1",
      "day": "2026-10-03", "start_time": "08:00", "court": 2, "label": "Open - Finals", "type": "final",
      "is_playoff": true, "bracket_game_id": "po_1", "team1_source": {"type": "seed", "rank": 1},
      "team2_source": {"type": "seed", "rank": 2}, "playoff_round": 1, "position": 5}]$$::jsonb as playoff;
grant select on batches to authenticated;

-- ---------------------------------------------------------------------------
-- add_round_robin
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select public.add_round_robin('10000000-0000-0000-0000-0000000000f1', '20000000-0000-0000-0000-0000000000f2',
    false, 0, '{}', (select round_robin from batches))$$,
  'P0002', null, 'a division from another event is refused');

select throws_ok(
  $$select public.add_round_robin('10000000-0000-0000-0000-0000000000f1', '20000000-0000-0000-0000-0000000000f1',
    false, 0, '{40000000-0000-0000-0000-0000000000f1}', (select clash from batches))$$,
  '23505', null, 'a new game on a taken slot is refused');
select results_eq(
  $$select custom_games_per_team, games_per_team from public.divisions
    where id = '20000000-0000-0000-0000-0000000000f1'$$,
  $$values (true, 2::smallint)$$,
  'a refused round robin leaves the division as it was');
select isnt((select day from public.games where id = '40000000-0000-0000-0000-0000000000f1'), null,
  'a refused round robin unschedules nothing');

select is(
  public.add_round_robin('10000000-0000-0000-0000-0000000000f1', '20000000-0000-0000-0000-0000000000f1',
    false, 0, '{}', (select round_robin from batches)),
  2, 'the owner adds round robin games');
select results_eq(
  $$select custom_games_per_team, games_per_team from public.divisions
    where id = '20000000-0000-0000-0000-0000000000f1'$$,
  $$values (false, null::smallint)$$,
  'a full round robin clears the saved games per team');
select results_eq(
  $$select id::text from public.games where event_id = '10000000-0000-0000-0000-0000000000f1' order by position$$,
  $$values ('40000000-0000-0000-0000-0000000000f4'), ('40000000-0000-0000-0000-0000000000f2'),
           ('40000000-0000-0000-0000-0000000000f1'), ('40000000-0000-0000-0000-0000000000f3'),
           ('40000000-0000-0000-0000-0000000000f5')$$,
  'the schedule is sorted by day, time and court, then unscheduled games in their existing order');
select results_eq(
  $$select position from public.games where event_id = '10000000-0000-0000-0000-0000000000f1' order by position$$,
  $$values (0), (1), (2), (3), (4)$$,
  'positions run from 0 without gaps');

-- ---------------------------------------------------------------------------
-- add_playoff, and the games the event no longer fits
-- ---------------------------------------------------------------------------
select is(
  public.add_playoff('10000000-0000-0000-0000-0000000000f1', '{40000000-0000-0000-0000-0000000000f1}',
    (select playoff from batches)),
  1, 'the owner adds playoff games');
select is((select day from public.games where id = '40000000-0000-0000-0000-0000000000f1'), null,
  'games that no longer fit are unscheduled in the same transaction');
select is((select position from public.games where id = '40000000-0000-0000-0000-0000000000f6'), 5,
  'playoff games are appended, not sorted in, as the old editor pushed them');

select lives_ok(
  $$select public.add_round_robin('10000000-0000-0000-0000-0000000000f1', '20000000-0000-0000-0000-0000000000f1',
    true, 1, '{}', '[]'::jsonb)$$,
  'a custom choice with no new games still saves');
select is((select position from public.games where id = '40000000-0000-0000-0000-0000000000f6'), 5,
  'nothing added, nothing re-sorted');
select results_eq(
  $$select custom_games_per_team, games_per_team from public.divisions
    where id = '20000000-0000-0000-0000-0000000000f1'$$,
  $$values (true, 1::smallint)$$,
  'the custom games per team is kept on the division');

select throws_ok(
  $$select public.add_playoff('10000000-0000-0000-0000-0000000000f3', '{}', '[]'::jsonb)$$,
  '22023', null, 'a draft event is refused');
select is((select count(*)::integer from public.game_scores
  where event_id = '10000000-0000-0000-0000-0000000000f1'), 0, 'no scores are written');

-- ---------------------------------------------------------------------------
-- Other callers
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000f2');
select throws_ok(
  $$select public.add_round_robin('10000000-0000-0000-0000-0000000000f1', '20000000-0000-0000-0000-0000000000f1',
    false, 0, '{}', '[]'::jsonb)$$,
  '42501', null, 'another admin cannot add a round robin to the event');
select throws_ok(
  $$select public.add_playoff('10000000-0000-0000-0000-0000000000f1', '{40000000-0000-0000-0000-0000000000f2}',
    '[]'::jsonb)$$,
  '42501', null, 'another admin cannot add a playoff or unschedule games');

reset role;
select ok(not has_function_privilege('anon',
  'public.add_round_robin(uuid, uuid, boolean, integer, uuid[], jsonb)', 'execute'), 'anon cannot add a round robin');
select ok(not has_function_privilege('anon', 'public.add_playoff(uuid, uuid[], jsonb)', 'execute'),
  'anon cannot add a playoff');
select ok(not has_function_privilege('anon', 'public.begin_schedule_addition(uuid, uuid[])', 'execute'),
  'anon cannot unschedule games through the shared start');

-- ---------------------------------------------------------------------------
-- Distinct event days
-- ---------------------------------------------------------------------------
select throws_ok(
  $$update public.events set schedule_days = '{2026-10-03,2026-10-03}'
    where id = '10000000-0000-0000-0000-0000000000f1'$$,
  '23514', null, 'a repeated event day is refused');
select lives_ok(
  $$update public.events set schedule_days = '{2026-10-03,2026-10-05}'
    where id = '10000000-0000-0000-0000-0000000000f1'$$,
  'distinct event days are accepted');
select ok(public.dates_are_distinct('{}'::date[]), 'no days counts as distinct');
select ok(not public.dates_are_distinct('{2026-10-03,NULL}'::date[]), 'a missing element is not a day');
select ok(not public.dates_are_distinct('{2026-10-03,2026-10-03}'::date[]), 'a repeated day is not distinct');

select * from finish();
rollback;
