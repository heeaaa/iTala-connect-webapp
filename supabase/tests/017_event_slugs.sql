-- Event web addresses (PRD P-14): defaults, one address per event, old addresses kept,
-- drafts private, and only an event's editors change its address.
begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

create function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end;
$$;
create function pg_temp.anon() returns void language plpgsql as $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
end;
$$;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000d1', 'slug-owner@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000d2', 'slug-other@test.local', 'authenticated', 'authenticated');
update public.profiles set role = 'admin'
where id in ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d2');
insert into public.events (id, owner_id, name, status, published_at, schedule_days) values
  ('10000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d1', 'Harbour Night', 'published', now(),
   '{2026-10-10,2026-10-03}'),
  ('10000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000d1', 'Secret Draft', 'draft', null,
   '{2026-11-01}');
insert into public.events (id, owner_id, name, schedule_days) values
  ('10000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000d2', 'Harbour Night', '{2026-12-05}');

-- Defaults, the same rules as src/lib/event-slug.ts (tests/unit/event-slug.test.ts holds the full list).
select is((select slug from public.events where id = '10000000-0000-0000-0000-0000000000d1'), 'harbour-night-2026',
  'an event added without an address gets its name and the year of its first day');
select is((select slug from public.events where id = '10000000-0000-0000-0000-0000000000d3'), 'harbour-night-2026-2',
  'a second event with the same name and year gets -2');
select results_eq(
  $$select public.default_event_slug(n, 2026) from (values
    ('BATANG PINOY BASKETBALL', 1), ('Crème Brûlée Classic', 2), ('Ōtautahi 3x3', 3), ('Summer League 2026', 4),
    ('!!!', 5), ('ﬁnal ﬂing', 6), (repeat('x', 70), 7)) as t(n, i) order by i$$,
  $$values ('batang-pinoy-basketball-2026'), ('creme-brulee-classic-2026'), ('otautahi-3x3-2026'), ('summer-league-2026'),
    ('event-2026'), ('final-fling-2026'), (repeat('x', 60) || '-2026')$$,
  'default addresses match the app''s rules');
select is((select count(*)::int from public.event_slugs where event_id = '10000000-0000-0000-0000-0000000000d1'), 1,
  'the address is kept in the address list');
select throws_ok(
  $$update public.events set slug = 'Not Valid' where id = '10000000-0000-0000-0000-0000000000d1'$$,
  '23514', null, 'an address must be lower-case words joined by hyphens');
select throws_ok(
  $$update public.events set slug = '0d1f2e3c-4b5a-4968-8776-a5b4c3d2e1f0' where id = '10000000-0000-0000-0000-0000000000d1'$$,
  '23514', null, 'an address cannot look like an event id');

-- The owner changes the address: the old one stays theirs, and the change is audited.
select pg_temp.login('00000000-0000-0000-0000-0000000000d1');
select lives_ok($$select public.set_event_slug('10000000-0000-0000-0000-0000000000d1', 'harbour-2026')$$,
  'the owner changes the address');
select results_eq(
  $$select slug from public.event_slugs where event_id = '10000000-0000-0000-0000-0000000000d1' order by slug$$,
  $$values ('harbour-2026'), ('harbour-night-2026')$$,
  'the event keeps its old address beside the new one');
select results_eq(
  $$select actor_id, detail ->> 'from', detail ->> 'to' from public.audit_log
    where action = 'event.address' and event_id = '10000000-0000-0000-0000-0000000000d1'$$,
  $$values ('00000000-0000-0000-0000-0000000000d1'::uuid, 'harbour-night-2026', 'harbour-2026')$$,
  'the change is audited with both addresses');
select is((select count(*)::int from public.event_slugs where event_id = '10000000-0000-0000-0000-0000000000d2'), 1,
  'the owner sees their draft''s address');
select throws_ok(
  $$insert into public.event_slugs (slug, event_id) values ('mine-now', '10000000-0000-0000-0000-0000000000d1')$$,
  '42501', null, 'addresses cannot be added directly');

-- Another admin: cannot change it, cannot take the old or current address, and cannot see the draft's.
select pg_temp.login('00000000-0000-0000-0000-0000000000d2');
select throws_ok($$select public.set_event_slug('10000000-0000-0000-0000-0000000000d1', 'taken-over')$$,
  '42501', null, 'another admin cannot change someone else''s address');
select throws_ok($$select public.create_draft_event('Copy', 'Pacific/Auckland', '', 'harbour-night-2026')$$,
  '23505', null, 'a new event cannot take another event''s old address');
select throws_ok(
  $$update public.events set slug = 'harbour-night-2026' where id = '10000000-0000-0000-0000-0000000000d3'$$,
  '23505', null, 'a direct change to another event''s old address is refused');
select throws_ok(
  $$update public.events set slug = 'harbour-2026' where id = '10000000-0000-0000-0000-0000000000d3'$$,
  '23505', null, 'a direct change to another event''s current address is refused');
select is(public.free_event_slug('harbour-night-2026'), 'harbour-night-2026-3',
  'the suggestion skips current and old addresses');
select is(public.free_event_slug('secret-draft-2026'), 'secret-draft-2026-2',
  'a draft''s address counts as taken, though the draft stays hidden');
select is(public.free_event_slug('harbour-2026', '10000000-0000-0000-0000-0000000000d1'), 'harbour-2026-2',
  'only an event''s editors can count its addresses as free');
select is((select count(*)::int from public.event_slugs where event_id = '10000000-0000-0000-0000-0000000000d2'), 0,
  'another admin does not see the draft''s address');
-- Each create runs in its own statement and is checked in the next: a volatile call inside a
-- WHERE runs once per row, and a query in the same statement would not see the new event.
select lives_ok($$select public.create_draft_event('Kea Cup', 'Pacific/Auckland', '', 'kea-cup')$$,
  'a new event can take the address the organiser chose');
select is((select name from public.events where slug = 'kea-cup'), 'Kea Cup',
  'the new event has that address');
select lives_ok(
  $$select public.import_mobile_league(
    p_event_name => 'Mobile Harbour', p_division_name => 'Open', p_timezone => 'Pacific/Auckland', p_rules => '',
    p_league => '{"id": "slug-league", "name": "Slug League"}', p_teams => '[]', p_slug => 'mobile-harbour')$$,
  'a league import can take the address the organiser chose');
select is((select name from public.events where slug = 'mobile-harbour'), 'Mobile Harbour',
  'the imported event has that address');
select lives_ok($$select public.create_draft_event('Kea Cup', 'Pacific/Auckland', '')$$,
  'a new event can be created without an address');
select is(
  (select count(*)::int from public.events
   where name = 'Kea Cup'
     and slug = public.default_event_slug('Kea Cup', extract(year from now() at time zone 'Pacific/Auckland')::int)),
  1, 'without a chosen address a new event gets the default');

-- The public: a published event's addresses, never a draft's; no address functions.
select pg_temp.anon();
select results_eq(
  $$select slug from public.event_slugs where event_id = '10000000-0000-0000-0000-0000000000d1' order by slug$$,
  $$values ('harbour-2026'), ('harbour-night-2026')$$,
  'the public can follow a published event''s old address');
select is((select count(*)::int from public.event_slugs where event_id = '10000000-0000-0000-0000-0000000000d2'), 0,
  'the public cannot see a draft''s address');
select throws_ok($$select public.free_event_slug('anything')$$, '42501', null, 'the public cannot check addresses');

reset role;
select ok(not has_function_privilege('anon', 'public.set_event_slug(uuid, text)', 'execute'),
  'the public cannot change addresses');
select ok(not has_function_privilege('authenticated', 'public.first_free_event_slug(text, uuid)', 'execute'),
  'only the database itself uses the unchecked address search');
-- Deleting an event frees its addresses.
delete from public.events where id = '10000000-0000-0000-0000-0000000000d1';
select is((select count(*)::int from public.event_slugs where slug in ('harbour-2026', 'harbour-night-2026')), 0,
  'a deleted event''s addresses are free again');

select * from finish();
