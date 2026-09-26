-- Rules in the editor save (E-70), the event logo and sponsors (E-15 to E-17).
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

create function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end;
$$;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000a7', 'img-owner@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b7', 'img-other@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000c7', 'img-norole@test.local', 'authenticated', 'authenticated');
update public.profiles set role = 'admin'
where id in ('00000000-0000-0000-0000-0000000000a7', '00000000-0000-0000-0000-0000000000b7');

insert into public.events (id, owner_id, name, rules_html) values
  ('10000000-0000-0000-0000-0000000000a7', '00000000-0000-0000-0000-0000000000a7', 'Images', '<p>Old rules</p>'),
  ('10000000-0000-0000-0000-0000000000b7', '00000000-0000-0000-0000-0000000000b7', 'Other', '');
-- An event last saved long ago, so a new version is visible inside this transaction.
insert into public.events (id, owner_id, name, updated_at) values
  ('10000000-0000-0000-0000-0000000000c7', '00000000-0000-0000-0000-0000000000a7', 'Versions', '2020-01-01T00:00:00Z');

create temp table args as select
  $${"name": "Images", "schedule_days": [], "time_start": "09:00", "time_end": "20:00", "courts": 1,
     "court_names": ["Court 1"], "timezone": "Pacific/Auckland", "theme_primary": "#FFCC00",
     "theme_bg": "#0D0D0D", "theme_text": "#E0E0E0", "theme_text_secondary": "#888888",
     "theme_heading": "#FFFFFF"}$$::jsonb as details;
grant select on args to authenticated;

select pg_temp.login('00000000-0000-0000-0000-0000000000a7');

-- ---------------------------------------------------------------------------
-- Rules save with the editor
-- ---------------------------------------------------------------------------
select lives_ok(
  $$select public.save_event_editor('10000000-0000-0000-0000-0000000000a7',
    (select updated_at from public.events where id = '10000000-0000-0000-0000-0000000000a7'),
    (select details from args) || '{"rules_html": "<h2>Fouls</h2><p>Five</p>"}', '[]'::jsonb)$$,
  'the editor saves the rules');
select is((select rules_html from public.events where id = '10000000-0000-0000-0000-0000000000a7'),
  '<h2>Fouls</h2><p>Five</p>', 'the rules are stored');
select lives_ok(
  $$select public.save_event_editor('10000000-0000-0000-0000-0000000000a7',
    (select updated_at from public.events where id = '10000000-0000-0000-0000-0000000000a7'),
    (select details from args), '[]'::jsonb)$$,
  'a save without rules still works');
select is((select rules_html from public.events where id = '10000000-0000-0000-0000-0000000000a7'),
  '<h2>Fouls</h2><p>Five</p>', 'a save without rules keeps the stored rules');

-- ---------------------------------------------------------------------------
-- The logo
-- ---------------------------------------------------------------------------
select results_eq(
  $$select old_path from public.set_event_logo('10000000-0000-0000-0000-0000000000a7',
    'events/10000000-0000-0000-0000-0000000000a7/logo-1.webp')$$,
  $$values (null::text)$$,
  'a first logo replaces nothing');
select results_eq(
  $$select old_path from public.set_event_logo('10000000-0000-0000-0000-0000000000a7',
      'events/10000000-0000-0000-0000-0000000000a7/logo-2.webp')$$,
  $$values ('events/10000000-0000-0000-0000-0000000000a7/logo-1.webp')$$,
  'replacing the logo hands back the old file');
select throws_ok(
  $$select * from public.set_event_logo('10000000-0000-0000-0000-0000000000a7',
    'events/10000000-0000-0000-0000-0000000000b7/logo-x.webp')$$,
  '23514', null, 'a logo from another event''s folder is refused');
select throws_ok(
  $$select * from public.set_event_logo('10000000-0000-0000-0000-0000000000a7',
    'events/10000000-0000-0000-0000-0000000000a7/../10000000-0000-0000-0000-0000000000b7/logo-x.webp')$$,
  '23514', null, 'a path that climbs out of the event''s folder is refused');
select throws_ok(
  $$select * from public.set_event_logo('10000000-0000-0000-0000-0000000000a7', 'platform/sponsor.webp')$$,
  '23514', null, 'a logo outside the event''s folder is refused');
select throws_ok(
  $$select * from public.set_event_logo('10000000-0000-0000-0000-0000000000a7',
    'events/10000000-0000-0000-0000-0000000000a7/logo.svg')$$,
  '23514', null, 'a logo that is not PNG, JPEG or WebP by name is refused');
select results_eq(
  $$select old_path from public.set_event_logo('10000000-0000-0000-0000-0000000000a7')$$,
  $$values ('events/10000000-0000-0000-0000-0000000000a7/logo-2.webp')$$,
  'removing the logo hands back its file');
select is((select logo_path from public.events where id = '10000000-0000-0000-0000-0000000000a7'), null,
  'the logo is gone');

-- ---------------------------------------------------------------------------
-- The edit version (the editor's "changed in another window" token)
-- ---------------------------------------------------------------------------
select results_eq(
  $$select version is not null and version = (select updated_at from public.events
                                              where id = '10000000-0000-0000-0000-0000000000c7')
    from public.set_event_logo('10000000-0000-0000-0000-0000000000c7',
      'events/10000000-0000-0000-0000-0000000000c7/logo-1.webp', '2020-01-01T00:00:00Z')$$,
  $$values (true)$$,
  'a caller on the current version gets the new version back');
select isnt((select updated_at from public.events where id = '10000000-0000-0000-0000-0000000000c7'),
  '2020-01-01T00:00:00Z'::timestamptz, 'changing the logo moves the version on');
select results_eq(
  $$select version from public.set_event_logo('10000000-0000-0000-0000-0000000000c7',
      'events/10000000-0000-0000-0000-0000000000c7/logo-2.webp', '2019-06-01T00:00:00Z')$$,
  $$values (null::timestamptz)$$,
  'a caller behind another save gets no new version, so its next save is still refused');
select is((select logo_path from public.events where id = '10000000-0000-0000-0000-0000000000c7'),
  'events/10000000-0000-0000-0000-0000000000c7/logo-2.webp', 'the logo itself still changes');

-- ---------------------------------------------------------------------------
-- Sponsors
-- ---------------------------------------------------------------------------
select is(public.set_major_sponsor('10000000-0000-0000-0000-0000000000a7',
  'events/10000000-0000-0000-0000-0000000000a7/major-1.webp'), null, 'a first major sponsor replaces nothing');
select is(public.set_major_sponsor('10000000-0000-0000-0000-0000000000a7',
  'events/10000000-0000-0000-0000-0000000000a7/major-2.webp'),
  'events/10000000-0000-0000-0000-0000000000a7/major-1.webp', 'replacing it hands back the old file');
select results_eq(
  $$select image_path from public.event_sponsors
    where event_id = '10000000-0000-0000-0000-0000000000a7' and tier = 'major'$$,
  $$values ('events/10000000-0000-0000-0000-0000000000a7/major-2.webp')$$,
  'an event keeps one major sponsor');
select is(public.set_major_sponsor('10000000-0000-0000-0000-0000000000a7'),
  'events/10000000-0000-0000-0000-0000000000a7/major-2.webp', 'removing it hands back its file');
select throws_ok(
  $$insert into public.event_sponsors (event_id, tier, image_path)
    values ('10000000-0000-0000-0000-0000000000a7', 'minor', 'events/10000000-0000-0000-0000-0000000000b7/x.webp')$$,
  '23514', null, 'a minor sponsor from another event''s folder is refused');

-- ---------------------------------------------------------------------------
-- Other callers
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000b7');
select throws_ok(
  $$select * from public.set_event_logo('10000000-0000-0000-0000-0000000000a7')$$,
  '42501', null, 'another admin cannot change the logo');
select throws_ok(
  $$select public.set_major_sponsor('10000000-0000-0000-0000-0000000000a7')$$,
  '42501', null, 'another admin cannot change the major sponsor');
select pg_temp.login('00000000-0000-0000-0000-0000000000c7');
select throws_ok(
  $$select * from public.set_event_logo('10000000-0000-0000-0000-0000000000a7')$$,
  '42501', null, 'an account without an admin role cannot change a logo');

-- A disabled owner has no admin rights, even on their own event.
reset role;
update public.profiles set disabled_at = now() where id = '00000000-0000-0000-0000-0000000000a7';
select pg_temp.login('00000000-0000-0000-0000-0000000000a7');
select throws_ok(
  $select * from public.set_event_logo('10000000-0000-0000-0000-0000000000a7')$,
  '42501', null, 'a disabled owner cannot change their logo');
select throws_ok(
  $select public.set_major_sponsor('10000000-0000-0000-0000-0000000000a7')$,
  '42501', null, 'a disabled owner cannot change their major sponsor');

reset role;
select ok(not has_function_privilege('anon', 'public.set_event_logo(uuid, text, timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.set_major_sponsor(uuid, text)', 'execute'),
  'anon cannot change a logo or sponsor');

select * from finish();
rollback;
