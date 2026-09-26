-- Platform sponsors (PRD S-01): who may add and remove them, and where their files may live.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

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

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000a8', 'ps-super@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b8', 'ps-admin@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000c8', 'ps-off@test.local', 'authenticated', 'authenticated');
update public.profiles set role = 'superadmin'
where id in ('00000000-0000-0000-0000-0000000000a8', '00000000-0000-0000-0000-0000000000c8');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000b8';
update public.profiles set disabled_at = now() where id = '00000000-0000-0000-0000-0000000000c8';

-- ---------------------------------------------------------------------------
-- A superadmin adds sponsors; the path rule holds for everyone
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a8');
select lives_ok(
  $$insert into public.platform_sponsors (id, tier, image_path)
    values ('20000000-0000-0000-0000-0000000000a8', 'primary', 'platform/primary-1.webp')$$,
  'a superadmin can add a primary sponsor');
select lives_ok(
  $$insert into public.platform_sponsors (tier, image_path, sort_order) values ('secondary', 'platform/secondary-1.png', 0)$$,
  'a superadmin can add a secondary sponsor');
select throws_ok(
  $$insert into public.platform_sponsors (tier, image_path) values ('primary', 'platform/../events/x/logo.webp')$$,
  '23514', null, 'a path that climbs out of the platform folder is refused');
select throws_ok(
  $$insert into public.platform_sponsors (tier, image_path)
    values ('primary', 'events/10000000-0000-0000-0000-0000000000a1/major.webp')$$,
  '23514', null, 'an event''s folder is refused');
select throws_ok(
  $$insert into public.platform_sponsors (tier, image_path) values ('primary', 'platform/sponsors/primary_1.webp')$$,
  '23514', null, 'a nested folder (the old app''s layout) is refused, so imports must flatten it');
select throws_ok(
  $$insert into public.platform_sponsors (tier, image_path) values ('secondary', 'platform/logo.svg')$$,
  '23514', null, 'an SVG is refused');

-- ---------------------------------------------------------------------------
-- Everyone reads; only an active superadmin writes
-- ---------------------------------------------------------------------------
select pg_temp.as_anon();
select is((select count(*)::int from public.platform_sponsors), 2, 'anyone can read the platform sponsors');

select pg_temp.login('00000000-0000-0000-0000-0000000000b8');
select throws_ok(
  $$insert into public.platform_sponsors (tier, image_path) values ('primary', 'platform/primary-2.webp')$$,
  '42501', null, 'an admin cannot add a platform sponsor');
delete from public.platform_sponsors;
update public.platform_sponsors set image_path = 'platform/primary-9.webp';
select is((select count(*)::int from public.platform_sponsors where image_path like 'platform/%-1.%'), 2,
  'an admin cannot remove or change platform sponsors');

select pg_temp.login('00000000-0000-0000-0000-0000000000c8');
select throws_ok(
  $$insert into public.platform_sponsors (tier, image_path) values ('primary', 'platform/primary-3.webp')$$,
  '42501', null, 'a disabled superadmin cannot add a platform sponsor');
delete from public.platform_sponsors;
select is((select count(*)::int from public.platform_sponsors), 2, 'a disabled superadmin cannot remove one');

select pg_temp.login('00000000-0000-0000-0000-0000000000a8');
select is(
  (select image_path from public.platform_sponsors where id = '20000000-0000-0000-0000-0000000000a8'),
  'platform/primary-1.webp', 'the superadmin sees the sponsor to remove');
delete from public.platform_sponsors where id = '20000000-0000-0000-0000-0000000000a8';
select is((select count(*)::int from public.platform_sponsors), 1, 'a superadmin can remove a platform sponsor');

select * from finish();
rollback;
