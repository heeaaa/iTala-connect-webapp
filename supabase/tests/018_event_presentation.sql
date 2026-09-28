-- Event banner crop and sponsor plaque settings.
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
  ('00000000-0000-0000-0000-00000000f018', 'presentation-owner@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000f019', 'presentation-other@test.local', 'authenticated', 'authenticated');
update public.profiles set role = 'admin' where id in
  ('00000000-0000-0000-0000-00000000f018', '00000000-0000-0000-0000-00000000f019');
insert into public.events (id, owner_id, name) values
  ('10000000-0000-0000-0000-00000000f018', '00000000-0000-0000-0000-00000000f018', 'Presentation');

select is((select banner_focus from public.events where id = '10000000-0000-0000-0000-00000000f018'),
  'center', 'existing and new events default to a centered banner');
select pg_temp.login('00000000-0000-0000-0000-00000000f018');
select results_eq(
  $$select old_path from public.set_event_banner('10000000-0000-0000-0000-00000000f018',
    'events/10000000-0000-0000-0000-00000000f018/banner-1.webp')$$,
  $$values (null::text)$$, 'an initial banner replaces no file');
select is(public.set_event_banner_focus('10000000-0000-0000-0000-00000000f018', 'right',
  (select updated_at from public.events where id = '10000000-0000-0000-0000-00000000f018')),
  now(), 'the owner can choose a crop and receive the new edit version');
select is((select banner_focus from public.events where id = '10000000-0000-0000-0000-00000000f018'),
  'right', 'the focal point is stored');
select results_eq(
  $$select old_path from public.set_event_banner('10000000-0000-0000-0000-00000000f018')$$,
  $$values ('events/10000000-0000-0000-0000-00000000f018/banner-1.webp')$$,
  'removing the banner returns its file');
select throws_ok(
  $$select * from public.set_event_banner('10000000-0000-0000-0000-00000000f018',
    'events/10000000-0000-0000-0000-00000000f019/banner-x.webp')$$,
  '23514', null, 'a banner from another event folder is refused');
select throws_ok(
  $$update public.events set banner_focus = 'bottom' where id = '10000000-0000-0000-0000-00000000f018'$$,
  '23514', null, 'only supported focal points are stored');

do $$ begin
  perform public.set_major_sponsor('10000000-0000-0000-0000-00000000f018',
    'events/10000000-0000-0000-0000-00000000f018/major-1.webp');
end $$;
update public.event_sponsors set display_mode = 'dark'
  where event_id = '10000000-0000-0000-0000-00000000f018' and tier = 'major';
do $$ begin
  perform public.set_major_sponsor('10000000-0000-0000-0000-00000000f018',
    'events/10000000-0000-0000-0000-00000000f018/major-2.webp');
end $$;
select is((select display_mode from public.event_sponsors
  where event_id = '10000000-0000-0000-0000-00000000f018' and tier = 'major'),
  'dark', 'replacing a major sponsor preserves its plaque mode');

select pg_temp.login('00000000-0000-0000-0000-00000000f019');
select throws_ok(
  $$select * from public.set_event_banner('10000000-0000-0000-0000-00000000f018')$$,
  '42501', null, 'another admin cannot change the banner');
select throws_ok(
  $$select public.set_event_banner_focus('10000000-0000-0000-0000-00000000f018', 'left')$$,
  '42501', null, 'another admin cannot change the crop');
reset role;
select ok(not has_function_privilege('anon', 'public.set_event_banner(uuid, text, timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.set_event_banner_focus(uuid, text, timestamptz)', 'execute'),
  'anonymous visitors cannot edit banner settings');

select * from finish();
rollback;
