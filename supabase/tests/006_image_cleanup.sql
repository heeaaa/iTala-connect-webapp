begin;
create extension if not exists pgtap with schema extensions;
select plan(7);
insert into auth.users(id,email,aud,role) values
('00000000-0000-0000-0000-00000000000a','cleanup-a@test.local','authenticated','authenticated'),
('00000000-0000-0000-0000-00000000000b','cleanup-b@test.local','authenticated','authenticated');
update public.profiles set role='admin' where id in ('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000b');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}',true);
insert into public.events(id,owner_id,name) values('10000000-0000-0000-0000-0000000000a1',auth.uid(),'Delete me');
delete from public.events where id='10000000-0000-0000-0000-0000000000a1';
select is((select count(*)::int from public.event_image_cleanup where event_id='10000000-0000-0000-0000-0000000000a1'),1,'Delete queues image cleanup');
select is((select requested_by from public.event_image_cleanup where event_id='10000000-0000-0000-0000-0000000000a1'),auth.uid(),'Cleanup attributed to caller');
select throws_ok($$insert into public.event_image_cleanup values('10000000-0000-0000-0000-0000000000b1',auth.uid(),now())$$,'42501',null,'Cannot forge cleanup job');
select throws_ok($$delete from public.event_image_cleanup$$,'42501',null,'Cannot discard cleanup job');
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}',true);
select is((select count(*)::int from public.event_image_cleanup where event_id='10000000-0000-0000-0000-0000000000a1'),0,'Other admin cannot inspect cleanup job');
set local role anon;
select throws_ok($$select * from public.event_image_cleanup$$,'42501',null,'Public cannot inspect cleanup jobs');
set local role service_role;
select lives_ok($$delete from public.event_image_cleanup where event_id='10000000-0000-0000-0000-0000000000a1'$$,'Cleanup worker can remove completed job');
select * from finish();rollback;
