-- Internal queue and discovery RPCs are service-only, including for event owners.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

select ok((select relrowsecurity from pg_class where oid = 'public.mobile_link_sync_queue'::regclass),
  'the delivery queue has RLS enabled');

set local role anon;
select throws_ok($$select * from public.mobile_link_sync_queue$$, '42501', null,
  'guests cannot read the queue');
select throws_ok($$select public.connect_mobile_link_snapshot('permission-test')$$, '42501', null,
  'guests cannot discover private link snapshots');

reset role;
set local role authenticated;
select throws_ok($$select * from public.mobile_link_sync_queue$$, '42501', null,
  'signed-in clients cannot read the queue');
select throws_ok($$select public.queue_mobile_link_sync('permission-test')$$, '42501', null,
  'signed-in clients cannot forge queue notifications');
select throws_ok($$select public.connect_mobile_link_snapshot('permission-test')$$, '42501', null,
  'signed-in clients cannot call internal snapshot discovery');
select throws_ok($$select public.pending_mobile_link_snapshots(10)$$, '42501', null,
  'signed-in clients cannot drain the queue');
select throws_ok($$select public.ack_mobile_link_snapshot('permission-test', 1)$$, '42501', null,
  'signed-in clients cannot acknowledge notifications');

reset role;
set local role service_role;
select lives_ok($$select public.connect_mobile_link_snapshot('permission-test')$$,
  'the service can obtain a snapshot');
select lives_ok($$select public.pending_mobile_link_snapshots(10)$$,
  'the service can obtain pending deliveries');

reset role;
select * from finish();
rollback;
