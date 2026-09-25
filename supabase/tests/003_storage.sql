-- Storage policies for the "images" bucket (plan section 8).
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

create function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end;
$$;

create function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
end;
$$;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-000000000005', 'super@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000a', 'a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.local', 'authenticated', 'authenticated');
update public.profiles set role = 'admin';
update public.profiles set role = 'superadmin' where id = '00000000-0000-0000-0000-000000000005';

insert into public.events (id, owner_id, name) values
  ('10000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'A'),
  ('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'B');

select is((select public from storage.buckets where id = 'images'), true, 'images bucket is public-read');
select is((select allowed_mime_types from storage.buckets where id = 'images'),
  array['image/png', 'image/jpeg', 'image/webp'], 'bucket allows PNG, JPEG and WebP only (no SVG)');
select is((select file_size_limit from storage.buckets where id = 'images'), 5242880::bigint,
  'bucket limits objects to 5 MB');

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select lives_ok(
  $$insert into storage.objects (bucket_id, name) values ('images', 'events/10000000-0000-0000-0000-0000000000a1/logo.webp')$$,
  'an admin can upload under their own event');
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('images', 'events/10000000-0000-0000-0000-0000000000b1/logo.webp')$$,
  '42501', null, 'an admin cannot upload under another admin''s event');
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('images', 'platform/sponsor.webp')$$,
  '42501', null, 'an admin cannot upload platform images');
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('images', 'events/not-a-uuid/logo.webp')$$,
  '42501', null, 'a malformed event folder is rejected, not an error');
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('images', 'draft/logo.webp')$$,
  '42501', null, 'there is no shared draft folder');

select pg_temp.login('00000000-0000-0000-0000-000000000005');
select lives_ok(
  $$insert into storage.objects (bucket_id, name) values ('images', 'platform/sponsor.webp')$$,
  'a superadmin can upload platform images');

select pg_temp.as_anon();
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('images', 'events/10000000-0000-0000-0000-0000000000a1/x.webp')$$,
  '42501', null, 'anonymous visitors cannot upload');
select is((select count(*)::int from storage.objects where bucket_id = 'images'), 0,
  'anonymous visitors cannot list objects (files are served by public URL)');

select * from finish();
rollback;
