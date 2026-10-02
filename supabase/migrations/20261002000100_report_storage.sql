-- Reports own these rows. Existing event, score, and mobile source tables stay untouched.
-- The application inserts snapshots only after building a report from authorised reads.

create table public.report_presets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80 and char_length(name) <= 80),
  definition_version smallint not null default 1 check (definition_version = 1),
  definition jsonb not null check (
    jsonb_typeof(definition) = 'object'
    and octet_length(definition::text) <= 16384
    and coalesce(definition ->> 'eventId' = event_id::text, false)
    and coalesce(definition ->> 'template' in ('box-score', 'league', 'team', 'results', 'leaders', 'player-log'), false)
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index report_presets_owner_event_idx on public.report_presets (owner_id, event_id, updated_at desc);

create function public.report_preset_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
  else
    if new.id is distinct from old.id or new.owner_id is distinct from old.owner_id
       or new.event_id is distinct from old.event_id then
      raise exception 'A report preset cannot change identity or event' using errcode = '42501';
    end if;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger report_preset_guard before insert or update on public.report_presets
for each row execute function public.report_preset_guard();

create table public.report_snapshots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  template text not null check (template in ('box-score', 'league', 'team', 'results', 'leaders', 'player-log')),
  document_version smallint not null default 1 check (document_version = 1),
  document jsonb not null check (
    jsonb_typeof(document) = 'object'
    and octet_length(document::text) <= 4194304
    and coalesce(document ->> 'eventId' = event_id::text, false)
    and coalesce(document ->> 'template' = template, false)
    and coalesce(document ->> 'version' = '1', false)
  ),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  check (expires_at > created_at and expires_at <= created_at + interval '7 days')
);
create index report_snapshots_owner_event_idx on public.report_snapshots (owner_id, event_id, created_at desc);
create index report_snapshots_expiry_idx on public.report_snapshots (expires_at);

create function public.report_snapshot_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.created_at := now();
  new.expires_at := new.created_at + interval '7 days';
  return new;
end;
$$;
create trigger report_snapshot_guard before insert on public.report_snapshots
for each row execute function public.report_snapshot_guard();

alter table public.report_presets enable row level security;
alter table public.report_snapshots enable row level security;

revoke all on public.report_presets, public.report_snapshots from public, anon, authenticated;
grant select, insert, update, delete on public.report_presets to authenticated;
grant select, insert, delete on public.report_snapshots to authenticated;

create policy report_presets_select on public.report_presets for select to authenticated
using (owner_id = (select auth.uid()) and public.is_event_editor(event_id));
create policy report_presets_insert on public.report_presets for insert to authenticated
with check (owner_id = (select auth.uid()) and public.is_event_editor(event_id));
create policy report_presets_update on public.report_presets for update to authenticated
using (owner_id = (select auth.uid()) and public.is_event_editor(event_id))
with check (owner_id = (select auth.uid()) and public.is_event_editor(event_id));
create policy report_presets_delete on public.report_presets for delete to authenticated
using (owner_id = (select auth.uid()) and public.is_event_editor(event_id));

create policy report_snapshots_select on public.report_snapshots for select to authenticated
using (owner_id = (select auth.uid()) and public.is_event_editor(event_id) and expires_at > now());
create policy report_snapshots_insert on public.report_snapshots for insert to authenticated
with check (owner_id = (select auth.uid()) and public.is_event_editor(event_id));
create policy report_snapshots_delete on public.report_snapshots for delete to authenticated
using (owner_id = (select auth.uid()) and public.is_event_editor(event_id));
