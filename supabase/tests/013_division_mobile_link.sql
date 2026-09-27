-- Link wizard (PRD M-03): linking a division made by hand to a mobile league, one to one.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

create function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end;
$$;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000ac', 'link-owner@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000bc', 'link-other@test.local', 'authenticated', 'authenticated');
update public.profiles set role = 'admin'
where id in ('00000000-0000-0000-0000-0000000000ac', '00000000-0000-0000-0000-0000000000bc');
insert into public.events (id, owner_id, name) values
  ('10000000-0000-0000-0000-0000000000ac', '00000000-0000-0000-0000-0000000000ac', 'Hand made');
insert into public.divisions (id, event_id, name) values
  ('20000000-0000-0000-0000-0000000000ac', '10000000-0000-0000-0000-0000000000ac', 'Open'),
  ('20000000-0000-0000-0000-0000000000ad', '10000000-0000-0000-0000-0000000000ac', 'Social');
insert into public.teams (id, division_id, name) values
  ('30000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000ac', 'Hawks'),
  ('30000000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-0000000000ac', 'Owls'),
  ('30000000-0000-0000-0000-0000000000a3', '20000000-0000-0000-0000-0000000000ad', 'Kea');

select pg_temp.login('00000000-0000-0000-0000-0000000000ac');
select lives_ok(
  $$select public.set_division_mobile_link('20000000-0000-0000-0000-0000000000ac', 'league-open', 'Harbour League', '2026',
    '[{"team_id": "30000000-0000-0000-0000-0000000000a1", "mobile_team_id": "team-hawks"},
      {"team_id": "30000000-0000-0000-0000-0000000000a2", "mobile_team_id": "team-owls"}]'::jsonb)$$,
  'the owner links a division and maps its teams');
select results_eq(
  $$select league_id, league_name, season, linked_by from public.division_mobile_links
    where division_id = '20000000-0000-0000-0000-0000000000ac'$$,
  $$values ('league-open', 'Harbour League', '2026', '00000000-0000-0000-0000-0000000000ac'::uuid)$$,
  'the link names the league and who linked it');
select is((select count(*)::int from public.division_mobile_team_links where division_id = '20000000-0000-0000-0000-0000000000ac'), 2,
  'both teams are mapped');

-- Linking again replaces the map: Owls now "not in the mobile app".
select lives_ok(
  $$select public.set_division_mobile_link('20000000-0000-0000-0000-0000000000ac', 'league-open', 'Harbour League', '2026',
    '[{"team_id": "30000000-0000-0000-0000-0000000000a1", "mobile_team_id": "team-hawks"}]'::jsonb)$$,
  'the owner links again');
select results_eq(
  $$select team_id, mobile_team_id from public.division_mobile_team_links
    where division_id = '20000000-0000-0000-0000-0000000000ac'$$,
  $$values ('30000000-0000-0000-0000-0000000000a1'::uuid, 'team-hawks')$$,
  'the team map is replaced, not added to');

select throws_ok(
  $$select public.set_division_mobile_link('20000000-0000-0000-0000-0000000000ac', 'league-open', 'Harbour League', '2026',
    '[{"team_id": "30000000-0000-0000-0000-0000000000a1", "mobile_team_id": "team-hawks"},
      {"team_id": "30000000-0000-0000-0000-0000000000a2", "mobile_team_id": "team-hawks"}]'::jsonb)$$,
  '23505', null, 'two division teams cannot point at the same mobile team');
select throws_ok(
  $$select public.set_division_mobile_link('20000000-0000-0000-0000-0000000000ac', 'league-open', 'Harbour League', '2026',
    '[{"team_id": "30000000-0000-0000-0000-0000000000a3", "mobile_team_id": "team-kea"}]'::jsonb)$$,
  '23514', null, 'a team from another division cannot be mapped');
select throws_ok(
  $$select public.set_division_mobile_link('20000000-0000-0000-0000-0000000000ac', ' ', 'X', null, '[]'::jsonb)$$,
  '22023', null, 'a league is required');

select is(
  (select count(*)::int from public.audit_log
   where action = 'division.mobile_link' and event_id = '10000000-0000-0000-0000-0000000000ac'),
  2, 'each wizard link (new and changed) is audited as a link, not an import');

select pg_temp.login('00000000-0000-0000-0000-0000000000bc');
select throws_ok(
  $$select public.set_division_mobile_link('20000000-0000-0000-0000-0000000000ac', 'league-x', 'X', null, '[]'::jsonb)$$,
  '42501', null, 'another admin cannot link someone else''s division');

reset role;
select ok(not has_function_privilege('anon', 'public.set_division_mobile_link(uuid, text, text, text, jsonb)', 'execute'),
  'anon cannot link divisions');

select * from finish();
rollback;
