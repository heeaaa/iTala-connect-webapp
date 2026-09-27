-- Firebase import, images (Phase 7c): rows set together, files no longer used
-- returned, platform sponsors filled only when empty, migration import only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

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
  ('00000000-0000-0000-0000-00000000f001', 'images-owner@test.local', 'authenticated', 'authenticated');
update public.profiles set role = 'superadmin' where id = '00000000-0000-0000-0000-00000000f001';
insert into public.events (id, owner_id, name, legacy_firebase_id) values
  ('10000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000f001', 'Imported', '-P1JcLF-imagesaaaaaa');
insert into public.events (id, owner_id, name) values
  ('10000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-00000000f001', 'Made in Connect');

select pg_temp.login('00000000-0000-0000-0000-00000000f001');
select throws_ok(
  $$select public.set_legacy_event_images('10000000-0000-0000-0000-00000000f001', null, '[]'::jsonb)$$,
  '42501', null, 'a signed-in superadmin cannot set imported images');
select throws_ok($$select public.set_legacy_platform_sponsors('[]'::jsonb)$$, '42501', null, 'nor the platform sponsors');
select pg_temp.logout();

select throws_ok(
  $$select public.set_legacy_event_images('10000000-0000-0000-0000-00000000f002', null, '[]'::jsonb)$$,
  '22023', 'Not an imported event', 'an event made in Connect is not touched');

select is(
  public.set_legacy_event_images('10000000-0000-0000-0000-00000000f001',
    'events/10000000-0000-0000-0000-00000000f001/logo-legacy-aaaa.png',
    '[{"tier": "major", "image_path": "events/10000000-0000-0000-0000-00000000f001/major-legacy-bbbb.png", "sort_order": 0},
      {"tier": "minor", "image_path": "events/10000000-0000-0000-0000-00000000f001/minor-legacy-cccc.jpg", "sort_order": 0},
      {"tier": "minor", "image_path": "events/10000000-0000-0000-0000-00000000f001/minor-legacy-dddd.webp", "sort_order": 1}]'::jsonb),
  '{}'::text[], 'the first import sets the images and replaces nothing');
select is((select logo_path from public.events where id = '10000000-0000-0000-0000-00000000f001'),
  'events/10000000-0000-0000-0000-00000000f001/logo-legacy-aaaa.png', 'the logo is set');
select results_eq(
  $$select tier, sort_order from public.event_sponsors where event_id = '10000000-0000-0000-0000-00000000f001' order by tier, sort_order$$,
  $$values ('major', 0), ('minor', 0), ('minor', 1)$$, 'the sponsors are set in order');

-- A later import: the same logo, a new major sponsor, one minor sponsor gone.
select is(
  public.set_legacy_event_images('10000000-0000-0000-0000-00000000f001',
    'events/10000000-0000-0000-0000-00000000f001/logo-legacy-aaaa.png',
    '[{"tier": "major", "image_path": "events/10000000-0000-0000-0000-00000000f001/major-legacy-eeee.png", "sort_order": 0},
      {"tier": "minor", "image_path": "events/10000000-0000-0000-0000-00000000f001/minor-legacy-cccc.jpg", "sort_order": 0}]'::jsonb),
  array['events/10000000-0000-0000-0000-00000000f001/major-legacy-bbbb.png',
        'events/10000000-0000-0000-0000-00000000f001/minor-legacy-dddd.webp'],
  'a later import returns only the files no longer used');
select is((select count(*)::int from public.event_sponsors where event_id = '10000000-0000-0000-0000-00000000f001'), 2,
  'the sponsor rows are replaced, not added to');
select throws_ok(
  $$select public.set_legacy_event_images('10000000-0000-0000-0000-00000000f001', 'elsewhere/logo.png', '[]'::jsonb)$$,
  '23514', null, 'a file outside the event folder is refused, as for an upload');
select is((select logo_path from public.events where id = '10000000-0000-0000-0000-00000000f001'),
  'events/10000000-0000-0000-0000-00000000f001/logo-legacy-aaaa.png', 'and the refused change left the images as they were');

delete from public.platform_sponsors;
select is(public.set_legacy_platform_sponsors(
  '[{"tier": "primary", "image_path": "platform/primary-legacy-ffff.png", "sort_order": 0}]'::jsonb), true,
  'the old platform sponsors fill an empty list');
select is(public.set_legacy_platform_sponsors(
  '[{"tier": "secondary", "image_path": "platform/secondary-legacy-gggg.png", "sort_order": 0}]'::jsonb), false,
  'but never replace sponsors already set');

select * from finish();
rollback;
