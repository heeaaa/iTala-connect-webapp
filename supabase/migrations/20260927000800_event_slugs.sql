-- Event web addresses (PRD P-14, New): /events/{slug} beside /events/{id}.
--
-- Every event has one current slug, unique across events, made by default from
-- its name and year ("batang-pinoy-basketball-2026"). The organiser can choose
-- it when creating the event and change it later; the name never changes it.
-- Every slug an event has had stays in event_slugs, so an old address keeps
-- leading to the event and is never given to another one. Deleting an event
-- frees its addresses.
--
-- Slug rules, kept identical to src/lib/event-slug.ts (tests cover both):
-- compatibility-decompose (NFKD), drop combining accents, lower-case, turn every
-- run of other characters into one hyphen, trim hyphens; the name part is cut to
-- 60 characters; the year is added unless the name already ends with it. A slug
-- is 1 to 80 characters of a-z, 0-9 and single inner hyphens, and never looks
-- like an event id, so /events/{x} is never ambiguous.
--
-- Drafts stay private: the public page reads through RLS, so a draft's slug is a
-- 404 to everyone but its editors, the same as its id.

create function public.event_slug_words(p_text text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select pg_catalog.btrim(
    pg_catalog.regexp_replace(
      pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.normalize(coalesce(p_text, ''), 'NFKD'), '[\u0300-\u036f]', '', 'g')),
      '[^a-z0-9]+', '-', 'g'),
    '-');
$$;

create function public.default_event_slug(p_name text, p_year integer)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  with w as (select pg_catalog.rtrim(pg_catalog.left(public.event_slug_words(p_name), 60), '-') as base)
  select case
    when base = '' then 'event-' || p_year
    when base = p_year::text or base like '%-' || p_year then base
    else base || '-' || p_year
  end
  from w;
$$;

create function public.valid_event_slug(p_slug text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select p_slug is not null
    and pg_catalog.length(p_slug) between 1 and 80
    and p_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    and p_slug !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
$$;

alter table public.events add column slug text;

create table public.event_slugs (
  slug text primary key check (public.valid_event_slug(slug)),
  event_id uuid not null references public.events (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index event_slugs_event_id_idx on public.event_slugs (event_id);

-- The first of p_slug, p_slug-2, p_slug-3 ... that no other event has now or had
-- before. Security definer so it sees every event's addresses, drafts included.
create function public.first_free_event_slug(p_slug text, p_event_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  candidate text := p_slug;
  n integer := 1;
  suffix text;
begin
  loop
    exit when not exists (
        select 1 from public.event_slugs s where s.slug = candidate and s.event_id is distinct from p_event_id)
      and not exists (
        select 1 from public.events e where e.slug = candidate and e.id is distinct from p_event_id);
    n := n + 1;
    suffix := '-' || n;
    candidate := pg_catalog.rtrim(pg_catalog.left(p_slug, 80 - pg_catalog.length(suffix)), '-') || suffix;
  end loop;
  return candidate;
end;
$$;
revoke execute on function public.first_free_event_slug(text, uuid) from public, anon, authenticated;

-- Existing events get their default address, oldest first, so the oldest keeps
-- the plain one. Their version (updated_at) does not move, so an open editor
-- keeps working, and no audit row is written.
alter table public.events disable trigger events_updated_at;
do $$
declare
  r record;
begin
  for r in select id, name, schedule_days, created_at, timezone from public.events order by created_at, id loop
    update public.events set slug = public.first_free_event_slug(
      public.default_event_slug(r.name, coalesce(
        (select extract(year from min(d)) from pg_catalog.unnest(r.schedule_days) as u(d)),
        extract(year from r.created_at at time zone r.timezone))::integer),
      r.id)
    where id = r.id;
  end loop;
end;
$$;
alter table public.events enable trigger events_updated_at;
insert into public.event_slugs (slug, event_id, created_at) select slug, id, now() from public.events;

alter table public.events
  alter column slug set not null,
  add constraint events_slug_key unique (slug),
  add constraint events_slug_format check (public.valid_event_slug(slug));

-- An event inserted without a slug (the Firebase import, test seeds) gets its
-- default. Named to run after events_validate, which checks the time zone first.
create function public.events_default_slug()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.slug is null then
    -- One slug assignment at a time, so two new events cannot pick the same one.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('itala.event_slugs', 0));
    new.slug := public.first_free_event_slug(
      public.default_event_slug(new.name, coalesce(
        (select extract(year from min(d)) from pg_catalog.unnest(new.schedule_days) as u(d)),
        extract(year from coalesce(new.created_at, now()) at time zone new.timezone))::integer),
      new.id);
  end if;
  return new;
end;
$$;
revoke execute on function public.events_default_slug() from public, anon, authenticated;
create trigger events_validate_slug before insert on public.events
for each row execute function public.events_default_slug();

-- Keeps every address an event has had, and refuses one that another event
-- has or had. The unique constraint covers current slugs; this covers old ones.
create function public.events_record_slug()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.event_slugs (slug, event_id) values (new.slug, new.id) on conflict (slug) do nothing;
  if exists (select 1 from public.event_slugs s where s.slug = new.slug and s.event_id <> new.id) then
    raise exception 'That web address is already used by another event'
      using errcode = '23505', hint = 'event_slug_taken';
  end if;
  return null;
end;
$$;
revoke execute on function public.events_record_slug() from public, anon, authenticated;
create trigger events_record_slug after insert or update of slug on public.events
for each row execute function public.events_record_slug();

-- Old addresses are as visible as their event: published ones to everyone,
-- drafts to their editors only. Only the trigger above writes them.
alter table public.event_slugs enable row level security;
create policy event_slugs_read on public.event_slugs for select to anon, authenticated
using (public.can_read_event(event_id));
revoke insert, update, delete, truncate on public.event_slugs from anon, authenticated;

-- For the forms: p_slug if it is free (or already this event's), otherwise the
-- first free p_slug-n. Says only whether an address is taken, never by what.
create function public.free_event_slug(p_slug text, p_event_id uuid default null)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_event uuid := p_event_id;
begin
  if not public.is_active_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  if not public.valid_event_slug(p_slug) then raise exception 'Invalid web address' using errcode = '22023'; end if;
  -- Only an event's editors may count its own addresses as free.
  if v_event is not null and not public.is_event_editor(v_event) then v_event := null; end if;
  return public.first_free_event_slug(p_slug, v_event);
end;
$$;
revoke execute on function public.free_event_slug(text, uuid) from public, anon;
grant execute on function public.free_event_slug(text, uuid) to authenticated;

-- Changing an address (owner or superadmin). The old one keeps redirecting.
-- Returns the event's version, which moves only when the slug changes.
create function public.set_event_slug(p_event_id uuid, p_slug text)
returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_version timestamptz;
begin
  if not public.is_event_editor(p_event_id) then
    raise exception 'You can only change your own events' using errcode = '42501';
  end if;
  if not public.valid_event_slug(p_slug) then raise exception 'Invalid web address' using errcode = '22023'; end if;
  if public.free_event_slug(p_slug, p_event_id) <> p_slug then
    raise exception 'That web address is already used by another event'
      using errcode = '23505', hint = 'event_slug_taken';
  end if;
  update public.events set slug = p_slug where id = p_event_id and slug <> p_slug returning updated_at into v_version;
  if v_version is null then
    select updated_at into v_version from public.events where id = p_event_id;
  end if;
  return v_version;
end;
$$;
revoke execute on function public.set_event_slug(uuid, text) from public, anon;
grant execute on function public.set_event_slug(uuid, text) to authenticated;

-- Creating an event, now with its address. p_slug null keeps the default.
drop function public.import_mobile_league(text, text, text, text, jsonb, jsonb, boolean);
drop function public.create_draft_event(text, text, text);

create function public.create_draft_event(p_name text, p_timezone text, p_rules text, p_slug text default null)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare result uuid;
begin
  if not public.is_active_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  if nullif(btrim(p_name), '') is null then raise exception 'Event name is required' using errcode = '22023'; end if;
  if p_slug is not null and public.free_event_slug(p_slug) <> p_slug then
    raise exception 'That web address is already used by another event'
      using errcode = '23505', hint = 'event_slug_taken';
  end if;
  insert into public.events(owner_id, name, timezone, rules_html, slug)
  values(auth.uid(), btrim(p_name), p_timezone,
    coalesce(nullif((select default_rules_html from public.platform_settings where id), ''), p_rules, ''), p_slug)
  returning id into result;
  return result;
end; $$;

-- Unchanged apart from p_slug, passed on to create_draft_event.
create function public.import_mobile_league(p_event_name text, p_division_name text, p_timezone text,
  p_rules text, p_league jsonb, p_teams jsonb, p_allow_duplicate boolean default false, p_slug text default null)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare event_id uuid; division_id uuid; team_id uuid; t jsonb; p jsonb; ti integer := 0; pi integer;
begin
  if not public.is_active_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  if nullif(p_league->>'id', '') is null or nullif(p_league->>'name', '') is null
    or nullif(btrim(p_division_name), '') is null or jsonb_typeof(p_teams) is distinct from 'array'
    or jsonb_array_length(p_teams) > 200 then
    raise exception 'Invalid league import' using errcode = '22023';
  end if;
  -- Serialise duplicate checks, including simultaneous tabs for the same league.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_league->>'id', 0));
  if not coalesce(p_allow_duplicate, false) and exists (
    select 1 from public.division_mobile_links l where l.league_id = p_league->>'id'
  ) then raise exception 'This league is already linked. Confirm Create anyway.' using errcode = '23505'; end if;
  event_id := public.create_draft_event(p_event_name, p_timezone, p_rules, p_slug);
  insert into public.divisions(event_id, name) values(event_id, btrim(p_division_name)) returning id into division_id;
  insert into public.division_mobile_links(division_id, league_id, league_name, season, linked_by)
  values(division_id, p_league->>'id', p_league->>'name', p_league->>'season', auth.uid());
  for t in select value from jsonb_array_elements(p_teams) loop
    if nullif(t->>'id', '') is null or nullif(btrim(t->>'name'), '') is null
      or jsonb_typeof(t->'players') is distinct from 'array' or jsonb_array_length(t->'players') > 200 then
      raise exception 'Invalid team import' using errcode = '22023';
    end if;
    insert into public.teams(division_id, name, coach, sort_order)
    values(division_id, t->>'name', coalesce(t->>'coach', ''), ti) returning id into team_id;
    insert into public.division_mobile_team_links(division_id, team_id, mobile_team_id) values(division_id, team_id, t->>'id');
    pi := 0;
    for p in select value from jsonb_array_elements(t->'players') loop
      if nullif(p->>'id', '') is null or nullif(btrim(p->>'name'), '') is null then
        raise exception 'Invalid player import' using errcode = '22023';
      end if;
      insert into public.players(team_id, name, number, sort_order, mobile_player_id)
      values(team_id, p->>'name', coalesce(p->>'number', ''), pi, p->>'id');
      pi := pi + 1;
    end loop;
    ti := ti + 1;
  end loop;
  return event_id;
end; $$;
revoke all on function public.create_draft_event(text,text,text,text) from public, anon;
revoke all on function public.import_mobile_league(text,text,text,text,jsonb,jsonb,boolean,text) from public, anon;
grant execute on function public.create_draft_event(text,text,text,text) to authenticated;
grant execute on function public.import_mobile_league(text,text,text,text,jsonb,jsonb,boolean,text) to authenticated;

-- Audit (X-09): an address change is recorded with the old and new slugs.
-- Unchanged apart from the event.address branch.
create or replace function public.audit_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.legacy_import_running() then return null; end if;
  if tg_op = 'INSERT' then
    insert into public.audit_log (actor_id, action, event_id, detail)
    values ((select auth.uid()), 'event.create', new.id, jsonb_build_object('name', new.name));
  elsif tg_op = 'UPDATE' then
    if new.published_at is distinct from old.published_at and new.status = 'published' then
      insert into public.audit_log (actor_id, action, event_id, detail)
      values ((select auth.uid()),
              case when old.published_at is null then 'event.publish' else 'event.republish' end,
              new.id, jsonb_build_object('name', new.name));
    elsif new.status is distinct from old.status then
      insert into public.audit_log (actor_id, action, event_id, detail)
      values ((select auth.uid()), 'event.status', new.id,
              jsonb_build_object('from', old.status, 'to', new.status));
    end if;
    if new.owner_id is distinct from old.owner_id then
      insert into public.audit_log (actor_id, action, event_id, detail)
      values ((select auth.uid()), 'event.reassign', new.id,
              jsonb_build_object('from', old.owner_id, 'to', new.owner_id));
    end if;
    if new.slug is distinct from old.slug and old.slug is not null then
      insert into public.audit_log (actor_id, action, event_id, detail)
      values ((select auth.uid()), 'event.address', new.id,
              jsonb_build_object('from', old.slug, 'to', new.slug));
    end if;
  elsif tg_op = 'DELETE' then
    insert into public.audit_log (actor_id, action, event_id, detail)
    values ((select auth.uid()), 'event.delete', old.id, jsonb_build_object('name', old.name));
  end if;
  return null;
end;
$$;
