-- Keep a durable cleanup job in the same transaction as deleting an event.
-- Storage is removed AFTER that transaction commits, using the cleanup-only
-- service client. A failed database delete can never remove a live event's files.
create table public.event_image_cleanup (
  event_id uuid primary key,
  requested_by uuid not null,
  created_at timestamptz not null default now()
);
alter table public.event_image_cleanup enable row level security;
create policy event_image_cleanup_select on public.event_image_cleanup
for select to authenticated using (public.is_superadmin()
  or (public.is_active_admin() and requested_by = (select auth.uid())));
revoke all on public.event_image_cleanup from anon, authenticated;
grant select on public.event_image_cleanup to authenticated;

create function public.queue_event_image_cleanup() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.event_image_cleanup(event_id, requested_by)
  values(old.id, coalesce(auth.uid(), old.owner_id)) on conflict do nothing;
  return null;
end; $$;
create trigger queue_event_image_cleanup after delete on public.events
for each row execute function public.queue_event_image_cleanup();
revoke all on function public.queue_event_image_cleanup() from public, anon, authenticated;
