-- Row Level Security (docs/MIGRATION_PLAN.md section 8).
-- Every policy here has allowed and denied cases in supabase/tests.

-- ---------------------------------------------------------------------------
-- Access helpers. security definer so policies do not recurse through RLS;
-- search_path is empty so every reference is schema-qualified.
-- A profile with disabled_at set, or with no role, has no admin rights.
-- ---------------------------------------------------------------------------

create function public.is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.role is not null
      and p.disabled_at is null
  );
$$;

create function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'superadmin'
      and p.disabled_at is null
  );
$$;

create function public.is_event_editor(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_superadmin()
    or (
      public.is_active_admin()
      and exists (
        select 1 from public.events e
        where e.id = p_event_id and e.owner_id = (select auth.uid())
      )
    );
$$;

create function public.is_event_published(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.events e where e.id = p_event_id and e.status = 'published');
$$;

create function public.can_read_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_event_published(p_event_id) or public.is_event_editor(p_event_id);
$$;

create function public.division_event_id(p_division_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select d.event_id from public.divisions d where d.id = p_division_id;
$$;

create function public.team_event_id(p_team_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select d.event_id from public.teams t join public.divisions d on d.id = t.division_id where t.id = p_team_id;
$$;

create function public.game_event_id(p_game_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select g.event_id from public.games g where g.id = p_game_id;
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.platform_settings enable row level security;
alter table public.platform_sponsors enable row level security;
alter table public.events enable row level security;
alter table public.event_sponsors enable row level security;
alter table public.divisions enable row level security;
alter table public.teams enable row level security;
alter table public.players enable row level security;
alter table public.games enable row level security;
alter table public.game_scores enable row level security;
alter table public.score_sources enable row level security;
alter table public.division_mobile_links enable row level security;
alter table public.division_mobile_team_links enable row level security;
alter table public.audit_log enable row level security;

-- ---------------------------------------------------------------------------
-- Profiles: read own; superadmin reads and writes all. Nobody inserts or
-- deletes through the API (the auth trigger creates rows).
-- ---------------------------------------------------------------------------

create policy profiles_select on public.profiles
for select to authenticated
using (id = (select auth.uid()) or public.is_superadmin());

create policy profiles_update on public.profiles
for update to authenticated
using (public.is_superadmin())
with check (public.is_superadmin());

revoke insert, delete on public.profiles from anon, authenticated;

-- role, disabled_at and id change only through a superadmin (or the service
-- role, used by the invite script). A superadmin cannot change their own
-- role or disable themselves, so the platform cannot lose its last one by
-- accident.
create function public.profiles_guard()
returns trigger
language plpgsql
-- security invoker on purpose: current_user must be the caller's role.
set search_path = ''
as $$
declare
  privileged boolean := current_user in ('postgres', 'supabase_admin', 'service_role')
    or coalesce(auth.role(), '') = 'service_role';
begin
  if new.id is distinct from old.id then
    raise exception 'Profile id cannot change' using errcode = '42501';
  end if;
  if (new.role is distinct from old.role or new.disabled_at is distinct from old.disabled_at) then
    if not privileged then
      if not public.is_superadmin() then
        raise exception 'Only a superadmin can change roles or disable accounts' using errcode = '42501';
      end if;
      if old.id = (select auth.uid()) then
        raise exception 'You cannot change your own role or disable your own account' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_guard
before update on public.profiles
for each row execute function public.profiles_guard();

-- ---------------------------------------------------------------------------
-- Platform settings and sponsors: everyone reads, superadmin writes.
-- ---------------------------------------------------------------------------

create policy platform_settings_select on public.platform_settings
for select to anon, authenticated using (true);
create policy platform_settings_update on public.platform_settings
for update to authenticated using (public.is_superadmin()) with check (public.is_superadmin());
revoke insert, delete on public.platform_settings from anon, authenticated;

create policy platform_sponsors_select on public.platform_sponsors
for select to anon, authenticated using (true);
create policy platform_sponsors_insert on public.platform_sponsors
for insert to authenticated with check (public.is_superadmin());
create policy platform_sponsors_update on public.platform_sponsors
for update to authenticated using (public.is_superadmin()) with check (public.is_superadmin());
create policy platform_sponsors_delete on public.platform_sponsors
for delete to authenticated using (public.is_superadmin());

-- ---------------------------------------------------------------------------
-- Events
-- ---------------------------------------------------------------------------

create policy events_select on public.events
for select to anon, authenticated
using (status = 'published' or public.is_event_editor(id));

-- Admins create events they own; a superadmin may create for anyone.
create policy events_insert on public.events
for insert to authenticated
with check (
  public.is_superadmin()
  or (public.is_active_admin() and owner_id = (select auth.uid()))
);

create policy events_update on public.events
for update to authenticated
using (public.is_event_editor(id))
with check (public.is_event_editor(id));

create policy events_delete on public.events
for delete to authenticated
using (public.is_event_editor(id));

-- Only a superadmin can reassign ownership (O-1).
create function public.events_owner_guard()
returns trigger
language plpgsql
-- security invoker on purpose: current_user must be the caller's role.
set search_path = ''
as $$
begin
  if new.owner_id is distinct from old.owner_id
     and not (public.is_superadmin()
              or current_user in ('postgres', 'supabase_admin', 'service_role')
              or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'Only a superadmin can change an event owner' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger events_owner_guard
before update of owner_id on public.events
for each row execute function public.events_owner_guard();

-- ---------------------------------------------------------------------------
-- Tables that carry event_id directly
-- ---------------------------------------------------------------------------

create policy event_sponsors_select on public.event_sponsors
for select to anon, authenticated using (public.can_read_event(event_id));
create policy event_sponsors_write on public.event_sponsors
for all to authenticated
using (public.is_event_editor(event_id)) with check (public.is_event_editor(event_id));

create policy divisions_select on public.divisions
for select to anon, authenticated using (public.can_read_event(event_id));
create policy divisions_write on public.divisions
for all to authenticated
using (public.is_event_editor(event_id)) with check (public.is_event_editor(event_id));

create policy games_select on public.games
for select to anon, authenticated using (public.can_read_event(event_id));
create policy games_write on public.games
for all to authenticated
using (public.is_event_editor(event_id)) with check (public.is_event_editor(event_id));

create policy game_scores_select on public.game_scores
for select to anon, authenticated using (public.can_read_event(event_id));
-- event_id is overwritten from the game by a trigger, so the check below
-- uses the game's real event.
create policy game_scores_write on public.game_scores
for all to authenticated
using (public.is_event_editor(event_id))
with check (public.is_event_editor(public.game_event_id(game_id)));

-- ---------------------------------------------------------------------------
-- Tables reached through a parent
-- ---------------------------------------------------------------------------

create policy teams_select on public.teams
for select to anon, authenticated using (public.can_read_event(public.division_event_id(division_id)));
create policy teams_write on public.teams
for all to authenticated
using (public.is_event_editor(public.division_event_id(division_id)))
with check (public.is_event_editor(public.division_event_id(division_id)));

create policy players_select on public.players
for select to anon, authenticated using (public.can_read_event(public.team_event_id(team_id)));
create policy players_write on public.players
for all to authenticated
using (public.is_event_editor(public.team_event_id(team_id)))
with check (public.is_event_editor(public.team_event_id(team_id)));

-- Admin-only: provenance and mobile links are never public.
create policy score_sources_all on public.score_sources
for all to authenticated
using (public.is_event_editor(public.game_event_id(game_id)))
with check (public.is_event_editor(public.game_event_id(game_id)));

create policy division_mobile_links_all on public.division_mobile_links
for all to authenticated
using (public.is_event_editor(public.division_event_id(division_id)))
with check (public.is_event_editor(public.division_event_id(division_id)));

create policy division_mobile_team_links_all on public.division_mobile_team_links
for all to authenticated
using (public.is_event_editor(public.division_event_id(division_id)))
with check (public.is_event_editor(public.division_event_id(division_id)));

-- ---------------------------------------------------------------------------
-- Audit log: read only. No insert, update or delete for any API role.
-- ---------------------------------------------------------------------------

create policy audit_log_select on public.audit_log
for select to authenticated
using (public.is_superadmin() or (event_id is not null and public.is_event_editor(event_id)));

revoke insert, update, delete, truncate on public.audit_log from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage: bucket "images", public read by URL, writes scoped by path.
--   events/{event id}/...  event editors
--   platform/...           superadmin
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('images', 'images', true, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create function public.can_write_image_path(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_superadmin()
    or (
      (storage.foldername(p_name))[1] = 'events'
      and public.try_uuid((storage.foldername(p_name))[2]) is not null
      and public.is_event_editor(public.try_uuid((storage.foldername(p_name))[2]))
    );
$$;

-- Listing is limited to people who can write the path; public files are
-- still served by URL because the bucket is public.
create policy images_select on storage.objects
for select to authenticated
using (bucket_id = 'images' and public.can_write_image_path(name));

create policy images_insert on storage.objects
for insert to authenticated
with check (bucket_id = 'images' and public.can_write_image_path(name));

create policy images_update on storage.objects
for update to authenticated
using (bucket_id = 'images' and public.can_write_image_path(name))
with check (bucket_id = 'images' and public.can_write_image_path(name));

create policy images_delete on storage.objects
for delete to authenticated
using (bucket_id = 'images' and public.can_write_image_path(name));
