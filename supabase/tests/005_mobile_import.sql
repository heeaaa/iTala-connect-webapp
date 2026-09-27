begin;
create extension if not exists pgtap with schema extensions;
select plan(8);
insert into auth.users(id,email,aud,role) values
('00000000-0000-0000-0000-00000000000a','import-a@test.local','authenticated','authenticated'),
('00000000-0000-0000-0000-00000000000b','import-b@test.local','authenticated','authenticated');
update public.profiles set role='admin' where id in ('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000b');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}',true);
select lives_ok($$insert into public.events(id,owner_id,name) values('10000000-0000-0000-0000-0000000000a1',auth.uid(),'Own draft') returning id$$,'Admin creates and returns own draft');
select is((select count(*)::int from public.events where name='Own draft'),1,'Owner reads own draft');
select throws_ok($$insert into public.events(owner_id,name) values('00000000-0000-0000-0000-00000000000b','Foreign draft')$$,'42501',null,'Cannot create for another admin');
select lives_ok($$select public.import_mobile_league('Mobile event','Open','Pacific/Auckland','', '{"id":"mobile-a","name":"Mobile A"}', '[]',false)$$,'Empty league import succeeds');
select throws_ok($$select public.import_mobile_league('Duplicate','Open','Pacific/Auckland','', '{"id":"mobile-a","name":"Mobile A"}', '[]',false)$$,'23505',null,'Unconfirmed duplicate is blocked');
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}',true);
select is((select count(*)::int from public.events where name='Own draft'),0,'Other admin cannot read draft');
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select is((select count(*)::int from public.events where name='Own draft'),0,'Public cannot read draft');
select throws_ok($$select public.import_mobile_league('No','No','Pacific/Auckland','', '{"id":"no","name":"No"}', '[]',false)$$,'42501',null,'Public cannot call import');
select * from finish();
rollback;
