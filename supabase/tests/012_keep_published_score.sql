-- Results inbox (PRD M-06): approving a mobile result, then keeping the published score when it changes.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

create function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end;
$$;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000aa', 'kps-owner@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000bb', 'kps-other@test.local', 'authenticated', 'authenticated');
update public.profiles set role = 'admin'
where id in ('00000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-0000000000bb');
insert into public.events (id, owner_id, name, status, published_at) values
  ('10000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-0000000000aa', 'Results', 'published', now());
insert into public.divisions (id, event_id, name) values
  ('20000000-0000-0000-0000-0000000000aa', '10000000-0000-0000-0000-0000000000aa', 'Open');
insert into public.games (id, event_id, division_id, label, type, position) values
  ('40000000-0000-0000-0000-0000000000aa', '10000000-0000-0000-0000-0000000000aa',
   '20000000-0000-0000-0000-0000000000aa', 'Open', 'group', 0);

select pg_temp.login('00000000-0000-0000-0000-0000000000aa');
select lives_ok(
  $$select public.approve_mobile_result('40000000-0000-0000-0000-0000000000aa', 58, 51,
    '{"mobile_game_id": "fin-1", "league_id": "L1", "home_pts": 58, "away_pts": 51, "event_count": 48,
      "last_event_at": "2026-09-27T07:05:00Z", "finished_at": "2026-09-27T07:05:00Z"}'::jsonb)$$,
  'the owner approves a mobile result');

-- The mobile app now says 60-51 with two more stats; the organiser keeps the published score.
select lives_ok(
  $$select public.dismiss_mobile_result('40000000-0000-0000-0000-0000000000aa',
    '{"mobile_game_id": "fin-1", "league_id": "L1", "home_pts": 60, "away_pts": 51, "event_count": 50,
      "last_event_at": "2026-09-27T07:30:00Z", "s1": 1, "s2": 1}'::jsonb)$$,
  'the owner keeps the published score');
select results_eq(
  $$select home_pts, away_pts, event_count, last_event_at from public.score_sources
    where game_id = '40000000-0000-0000-0000-0000000000aa'$$,
  $$values (60, 51, 50, '2026-09-27T07:30:00Z'::timestamptz)$$,
  'the mobile app''s version now is recorded, so the same change is not raised again');
select results_eq(
  $$select s1, s2, mobile_game_id, approved_by, dismissed_at is not null from public.score_sources
    where game_id = '40000000-0000-0000-0000-0000000000aa'$$,
  $$values (58, 51, 'fin-1', '00000000-0000-0000-0000-0000000000aa'::uuid, true)$$,
  'the published score, the mobile game and who approved it stay; the dismissal is stamped');
select results_eq(
  $$select s1, s2 from public.game_scores where game_id = '40000000-0000-0000-0000-0000000000aa'$$,
  $$values (58, 51)$$,
  'the published score itself is untouched');

-- Approving again clears the dismissal.
select lives_ok(
  $$select public.approve_mobile_result('40000000-0000-0000-0000-0000000000aa', 60, 51,
    '{"mobile_game_id": "fin-1", "home_pts": 60, "away_pts": 51, "event_count": 50}'::jsonb)$$,
  'the owner re-approves');
select is((select dismissed_at from public.score_sources where game_id = '40000000-0000-0000-0000-0000000000aa'),
  null, 're-approving clears the dismissal');

select pg_temp.login('00000000-0000-0000-0000-0000000000bb');
select throws_ok(
  $$select public.dismiss_mobile_result('40000000-0000-0000-0000-0000000000aa', '{"mobile_game_id": "fin-1"}'::jsonb)$$,
  '42501', null, 'another admin cannot keep or change someone else''s result');

select * from finish();
rollback;
