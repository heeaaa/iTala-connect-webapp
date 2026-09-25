-- iTala Connect core schema (docs/MIGRATION_PLAN.md section 7).
-- Tables only. Row Level Security lives in 20260925000200_rls.sql,
-- atomic functions in 20260925000300_functions.sql.

create type public.app_role as enum ('superadmin', 'admin');

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Safe uuid cast used by storage policies (folder names are user supplied).
create function public.try_uuid(p text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p::uuid;
exception when others then
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

-- role null means "signed in but no access". Roles are granted only by a
-- superadmin (or the service role during invites), never by sign-up.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  role public.app_role,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Anonymous users never get a profile, so they can never hold a role.
  if coalesce(new.is_anonymous, false) then
    return new;
  end if;
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), coalesce(new.email, ''))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Platform
-- ---------------------------------------------------------------------------

create table public.platform_settings (
  id boolean primary key default true check (id),
  default_rules_html text not null default '',
  updated_at timestamptz not null default now()
);

insert into public.platform_settings (id) values (true);

create trigger platform_settings_updated_at
before update on public.platform_settings
for each row execute function public.set_updated_at();

create table public.platform_sponsors (
  id uuid primary key default gen_random_uuid(),
  tier text not null check (tier in ('primary', 'secondary')),
  image_path text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Events
-- ---------------------------------------------------------------------------

create table public.events (
  id uuid primary key default gen_random_uuid(),
  legacy_firebase_id text unique,
  owner_id uuid not null references public.profiles (id) on delete restrict,
  legacy_created_by text,
  name text not null default '' check (char_length(name) <= 200),
  status text not null default 'draft' check (status in ('draft', 'published')),
  schedule_days date[] not null default '{}',
  time_start time not null default '09:00',
  time_end time not null default '20:00',
  courts smallint not null default 1 check (courts between 1 and 10),
  court_names text[] not null default '{"Court 1"}',
  timezone text not null default 'Pacific/Auckland',
  logo_path text,
  theme_primary text not null default '#FFCC00' check (theme_primary ~ '^#[0-9A-Fa-f]{6}$'),
  theme_bg text not null default '#0D0D0D' check (theme_bg ~ '^#[0-9A-Fa-f]{6}$'),
  theme_text text not null default '#E0E0E0' check (theme_text ~ '^#[0-9A-Fa-f]{6}$'),
  theme_text_secondary text not null default '#888888' check (theme_text_secondary ~ '^#[0-9A-Fa-f]{6}$'),
  theme_heading text not null default '#FFFFFF' check (theme_heading ~ '^#[0-9A-Fa-f]{6}$'),
  rules_html text not null default '',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (time_end > time_start)
);

create index events_owner_id_idx on public.events (owner_id);
create index events_status_idx on public.events (status);

create trigger events_updated_at
before update on public.events
for each row execute function public.set_updated_at();

-- Rejects unknown IANA zone names (O-4: per-event time zone).
create function public.events_validate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Unknown time zone "%"', new.timezone using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger events_validate
before insert or update of timezone on public.events
for each row execute function public.events_validate();

create table public.event_sponsors (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  tier text not null check (tier in ('major', 'minor')),
  image_path text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index event_sponsors_event_id_idx on public.event_sponsors (event_id);
create unique index event_sponsors_one_major on public.event_sponsors (event_id) where tier = 'major';

-- ---------------------------------------------------------------------------
-- Divisions, teams, players
-- ---------------------------------------------------------------------------

create table public.divisions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  legacy_key text,
  name text not null default '' check (char_length(name) <= 120),
  color text not null default '#6C63FF' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  bracket_count smallint not null default 1 check (bracket_count between 1 and 4),
  custom_games_per_team boolean not null default false,
  games_per_team smallint check (games_per_team between 0 and 20),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, legacy_key)
);

create index divisions_event_id_idx on public.divisions (event_id);

create trigger divisions_updated_at
before update on public.divisions
for each row execute function public.set_updated_at();

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions (id) on delete cascade,
  legacy_code text,
  name text not null default '' check (char_length(name) <= 120),
  coach text not null default '' check (char_length(coach) <= 120),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (division_id, legacy_code)
);

create index teams_division_id_idx on public.teams (division_id);

create trigger teams_updated_at
before update on public.teams
for each row execute function public.set_updated_at();

create table public.players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  name text not null default '' check (char_length(name) <= 120),
  number text not null default '' check (char_length(number) <= 10),
  sort_order integer not null default 0,
  mobile_player_id text,
  created_at timestamptz not null default now()
);

create index players_team_id_idx on public.players (team_id);

-- ---------------------------------------------------------------------------
-- Games and scores
-- ---------------------------------------------------------------------------

create table public.games (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  division_id uuid references public.divisions (id) on delete set null,
  legacy_gid text,
  legacy_index integer,
  legacy_team1 text,
  legacy_team2 text,
  day date,
  start_time time,
  court smallint check (court >= 1),
  group_id text check (group_id in ('A', 'B', 'C', 'D')),
  team1_id uuid references public.teams (id) on delete set null,
  team2_id uuid references public.teams (id) on delete set null,
  label text not null default '',
  type text not null default 'group' check (type in ('group', 'semi', 'final')),
  is_playoff boolean not null default false,
  bracket_game_id text,
  team1_source jsonb,
  team2_source jsonb,
  playoff_round integer,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (team1_id is null or team2_id is null or team1_id <> team2_id),
  -- A game is either fully scheduled (day, time, court) or fully unscheduled.
  check ((day is null and start_time is null and court is null)
      or (day is not null and start_time is not null and court is not null)),
  unique (event_id, legacy_gid)
);

create unique index games_slot_unique
  on public.games (event_id, day, start_time, court)
  where day is not null;
create index games_event_id_idx on public.games (event_id);
create index games_division_id_idx on public.games (division_id);

create trigger games_updated_at
before update on public.games
for each row execute function public.set_updated_at();

-- Division and teams on a game must belong to the game's event.
create function public.games_validate_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.division_id is not null and not exists (
    select 1 from public.divisions d where d.id = new.division_id and d.event_id = new.event_id
  ) then
    raise exception 'Division does not belong to this event' using errcode = '23514';
  end if;
  if exists (
    select 1
    from unnest(array[new.team1_id, new.team2_id]) as t(team_id)
    where t.team_id is not null
      and not exists (
        select 1 from public.teams tm
        join public.divisions d on d.id = tm.division_id
        where tm.id = t.team_id and d.event_id = new.event_id
      )
  ) then
    raise exception 'Team does not belong to this event' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger games_validate_refs
before insert or update of event_id, division_id, team1_id, team2_id on public.games
for each row execute function public.games_validate_refs();

-- Scores live apart from games so editor saves never touch them (E-06).
-- event_id is denormalised for Realtime filters and RLS.
create table public.game_scores (
  game_id uuid primary key references public.games (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  s1 integer check (s1 >= 0),
  s2 integer check (s2 >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

create index game_scores_event_id_idx on public.game_scores (event_id);

-- event_id always comes from the game and updated_by from the session,
-- whatever the client sends.
create function public.game_scores_stamp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select g.event_id into new.event_id from public.games g where g.id = new.game_id;
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end;
$$;

create trigger game_scores_stamp
before insert or update on public.game_scores
for each row execute function public.game_scores_stamp();

create table public.score_sources (
  game_id uuid primary key references public.games (id) on delete cascade,
  mobile_game_id text,
  league_id text,
  s1 integer,
  s2 integer,
  home_pts integer,
  away_pts integer,
  event_count integer,
  last_event_at timestamptz,
  finished_at timestamptz,
  approved_by uuid references public.profiles (id) on delete set null,
  approved_by_legacy text,
  approved_at timestamptz,
  method text,
  dismissed_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Mobile links (one-to-one team map enforced by unique constraints)
-- ---------------------------------------------------------------------------

create table public.division_mobile_links (
  division_id uuid primary key references public.divisions (id) on delete cascade,
  league_id text not null,
  league_name text not null default '',
  season text,
  linked_at timestamptz not null default now(),
  linked_by uuid references public.profiles (id) on delete set null,
  linked_by_legacy text
);

create table public.division_mobile_team_links (
  division_id uuid not null references public.division_mobile_links (division_id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  mobile_team_id text not null,
  primary key (division_id, team_id),
  unique (division_id, mobile_team_id)
);

create function public.mobile_team_link_validate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.teams t where t.id = new.team_id and t.division_id = new.division_id) then
    raise exception 'Team does not belong to this division' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger mobile_team_link_validate
before insert or update on public.division_mobile_team_links
for each row execute function public.mobile_team_link_validate();

-- ---------------------------------------------------------------------------
-- Audit log (written only by security definer triggers, see functions file)
-- ---------------------------------------------------------------------------

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  event_id uuid,
  detail jsonb not null default '{}',
  at timestamptz not null default now()
);

create index audit_log_event_id_idx on public.audit_log (event_id, at desc);

-- ---------------------------------------------------------------------------
-- Realtime: spectators receive score and schedule changes (RLS applies).
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.game_scores, public.games;
  end if;
end;
$$;
