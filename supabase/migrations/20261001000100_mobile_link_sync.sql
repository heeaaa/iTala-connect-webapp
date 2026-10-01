-- Transactional outbox: every route, import and cascade uses the same notification path.
create sequence public.mobile_link_revision_seq;
create table public.mobile_link_sync_queue (
  league_id text primary key,
  revision bigint not null default nextval('public.mobile_link_revision_seq'),
  pending boolean not null default true
);
alter table public.mobile_link_sync_queue enable row level security;
revoke all on public.mobile_link_sync_queue, public.mobile_link_revision_seq from public, anon, authenticated;

create function public.queue_mobile_link_sync(p_league_id text) returns void
language sql security definer set search_path = '' as $$
  insert into public.mobile_link_sync_queue(league_id) values (p_league_id)
  on conflict (league_id) do update set revision = nextval('public.mobile_link_revision_seq'), pending = true;
$$;
revoke all on function public.queue_mobile_link_sync(text) from public, anon, authenticated;

create function public.mobile_link_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op <> 'INSERT' then perform public.queue_mobile_link_sync(old.league_id); end if;
  if tg_op <> 'DELETE' and (tg_op = 'INSERT' or new.league_id is distinct from old.league_id) then
    perform public.queue_mobile_link_sync(new.league_id);
  end if;
  return null;
end $$;
create trigger mobile_link_changed after insert or update or delete on public.division_mobile_links
for each row execute function public.mobile_link_changed();

create function public.mobile_event_link_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_league text;
begin
  for v_league in select distinct l.league_id from public.division_mobile_links l
    join public.divisions d on d.id = l.division_id where d.event_id = new.id
  loop perform public.queue_mobile_link_sync(v_league); end loop;
  return null;
end $$;
create trigger mobile_event_link_changed after update of status, name, timezone, published_at on public.events
for each row execute function public.mobile_event_link_changed();

create function public.mobile_division_link_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_league text;
begin
  select league_id into v_league from public.division_mobile_links where division_id = new.id;
  if v_league is not null then perform public.queue_mobile_link_sync(v_league); end if;
  return null;
end $$;
create trigger mobile_division_link_changed after update of name, event_id on public.divisions
for each row execute function public.mobile_division_link_changed();

create function public.connect_mobile_link_snapshot(p_league_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_revision bigint; v_events jsonb;
begin
  if p_league_id is null or length(p_league_id) not between 1 and 100 then
    raise exception 'Invalid mobile league' using errcode = '22023';
  end if;
  insert into public.mobile_link_sync_queue(league_id) values (p_league_id) on conflict do nothing;
  select revision into v_revision from public.mobile_link_sync_queue where league_id = p_league_id for update;
  select coalesce(jsonb_agg(event_ref order by event_id), '[]'::jsonb) into v_events from (
    select e.id event_id, jsonb_build_object('id', e.id, 'name', e.name, 'timezone', e.timezone,
      'divisions', jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name) order by d.sort_order, d.id)) event_ref
    from public.events e join public.divisions d on d.event_id = e.id
      join public.division_mobile_links l on l.division_id = d.id
    where l.league_id = p_league_id and e.status = 'published'
    group by e.id, e.name, e.timezone
  ) linked;
  return jsonb_build_object('leagueId', p_league_id, 'events', v_events, 'revision', v_revision,
    'checkedAt', floor(extract(epoch from clock_timestamp()) * 1000)::bigint);
end $$;
revoke all on function public.connect_mobile_link_snapshot(text) from public, anon, authenticated;
grant execute on function public.connect_mobile_link_snapshot(text) to service_role;

create function public.pending_mobile_link_snapshots(p_limit int default 10) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_league text; v_snapshots jsonb := '[]';
begin
  for v_league in select league_id from public.mobile_link_sync_queue where pending
    order by revision limit greatest(1, least(p_limit, 10)) for update skip locked
  loop v_snapshots := v_snapshots || jsonb_build_array(public.connect_mobile_link_snapshot(v_league)); end loop;
  return v_snapshots;
end $$;
revoke all on function public.pending_mobile_link_snapshots(int) from public, anon, authenticated;
grant execute on function public.pending_mobile_link_snapshots(int) to service_role;

create function public.ack_mobile_link_snapshot(p_league_id text, p_revision bigint) returns void
language sql security definer set search_path = '' as $$
  update public.mobile_link_sync_queue set pending = false where league_id = p_league_id and revision = p_revision;
$$;
revoke all on function public.ack_mobile_link_snapshot(text,bigint) from public, anon, authenticated;
grant execute on function public.ack_mobile_link_snapshot(text,bigint) to service_role;

-- Seed delivery for links that existed before this migration (including unpublished links).
insert into public.mobile_link_sync_queue(league_id)
select distinct league_id from public.division_mobile_links;
