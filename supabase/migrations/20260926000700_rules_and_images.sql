-- Phase 5d: rules in the editor save (E-70, E-71), and the event logo and
-- sponsor images (E-15 to E-18).

-- ---------------------------------------------------------------------------
-- Rules save with the rest of the editor, in the same transaction. The body
-- is 20260926000500's save_event_editor with the rules line added.
-- ---------------------------------------------------------------------------
create or replace function public.save_event_editor(p_event_id uuid, p_version timestamptz, p_details jsonb,
  p_divisions jsonb, p_unschedule uuid[] default '{}')
returns timestamptz language plpgsql security invoker set search_path = '' as $$
declare current_event public.events; d jsonb; t jsonb; p jsonb;
  division_ids uuid[] := '{}'; team_ids uuid[]; player_ids uuid[]; di int := 0; ti int; pi int;
  next_version timestamptz;
begin
  perform public.assert_event_editor(p_event_id);
  select * into current_event from public.events where id = p_event_id for update;
  if current_event.updated_at is distinct from p_version then
    raise exception 'Event changed. Reload before saving.' using errcode = '40001';
  end if;
  if jsonb_typeof(p_divisions) is distinct from 'array' or jsonb_array_length(p_divisions) > 30 then
    raise exception 'Invalid divisions' using errcode = '22023';
  end if;
  if nullif(btrim(p_details->>'name'), '') is null then
    raise exception 'Event name required' using errcode = '22023';
  end if;
  update public.events set name = p_details->>'name',
    schedule_days = array(select distinct value::date from jsonb_array_elements_text(p_details->'schedule_days') order by 1),
    time_start = (p_details->>'time_start')::time, time_end = (p_details->>'time_end')::time,
    courts = (p_details->>'courts')::smallint,
    court_names = array(select jsonb_array_elements_text(p_details->'court_names')),
    timezone = p_details->>'timezone', theme_primary = p_details->>'theme_primary', theme_bg = p_details->>'theme_bg',
    theme_text = p_details->>'theme_text', theme_text_secondary = p_details->>'theme_text_secondary',
    theme_heading = p_details->>'theme_heading',
    -- Rules (E-70): the Server Action sanitises them first (E-71); absent means unchanged.
    rules_html = coalesce(p_details->>'rules_html', rules_html)
  where id = p_event_id returning updated_at into next_version;

  update public.games set day = null, start_time = null, court = null
  where event_id = p_event_id and id = any(coalesce(p_unschedule, '{}')) and day is not null;

  for d in select value from jsonb_array_elements(p_divisions) loop
    division_ids := array_append(division_ids, (d->>'id')::uuid);
    if not exists(select 1 from public.divisions where id = (d->>'id')::uuid and event_id = p_event_id) then
      insert into public.divisions(id, event_id) values((d->>'id')::uuid, p_event_id);
    end if;
    update public.divisions set name = d->>'name', color = d->>'color',
      bracket_count = (d->>'bracket_count')::smallint,
      custom_games_per_team = (d->>'custom_games_per_team')::boolean,
      games_per_team = (d->>'games_per_team')::smallint, sort_order = di
    where id = (d->>'id')::uuid and event_id = p_event_id;
    team_ids := '{}'; ti := 0;
    for t in select value from jsonb_array_elements(d->'teams') loop
      team_ids := array_append(team_ids, (t->>'id')::uuid);
      if not exists(select 1 from public.teams where id = (t->>'id')::uuid and division_id = (d->>'id')::uuid) then
        insert into public.teams(id, division_id) values((t->>'id')::uuid, (d->>'id')::uuid);
      end if;
      update public.teams set name = t->>'name', coach = t->>'coach', sort_order = ti
      where id = (t->>'id')::uuid and division_id = (d->>'id')::uuid;
      player_ids := '{}'; pi := 0;
      for p in select value from jsonb_array_elements(t->'players') loop
        player_ids := array_append(player_ids, (p->>'id')::uuid);
        if not exists(select 1 from public.players where id = (p->>'id')::uuid and team_id = (t->>'id')::uuid) then
          insert into public.players(id, team_id) values((p->>'id')::uuid, (t->>'id')::uuid);
        end if;
        update public.players set name = p->>'name', number = p->>'number', sort_order = pi
        where id = (p->>'id')::uuid and team_id = (t->>'id')::uuid;
        pi := pi + 1;
      end loop;
      delete from public.players where team_id = (t->>'id')::uuid and not (id = any(player_ids));
      ti := ti + 1;
    end loop;
    -- Games of a removed team keep that side as TBD (teams FK: on delete set null).
    delete from public.teams where division_id = (d->>'id')::uuid and not (id = any(team_ids));
    di := di + 1;
  end loop;
  delete from public.games
  where event_id = p_event_id and division_id is not null and not (division_id = any(division_ids));
  delete from public.divisions where event_id = p_event_id and not (id = any(division_ids));
  return next_version;
end; $$;

-- ---------------------------------------------------------------------------
-- Every stored image is one plain file directly in its own event's folder of
-- the images bucket (events/{event id}/{name}.png|jpg|webp): no subfolders,
-- no "..", so an event can never point at another event's file.
-- ---------------------------------------------------------------------------
alter table public.events
  add constraint events_logo_path_own_folder
  check (logo_path is null or logo_path ~ ('^events/' || id::text || '/[A-Za-z0-9_-]+\.(png|jpg|webp)$'));
alter table public.event_sponsors
  add constraint event_sponsors_image_own_folder
  check (image_path ~ ('^events/' || event_id::text || '/[A-Za-z0-9_-]+\.(png|jpg|webp)$'));

-- ---------------------------------------------------------------------------
-- The event logo (E-15): set or clear it and hand back the file it replaced,
-- so the caller can delete that object. Changing the logo moves the event's
-- edit version on. The new version is handed back only when the caller's
-- version (p_version) was current: an editor window that is behind another
-- window's save must still be told "changed in another window" at its next
-- save, never quietly brought up to date and allowed to overwrite it.
-- ---------------------------------------------------------------------------
create function public.set_event_logo(p_event_id uuid, p_path text default null, p_version timestamptz default null)
returns table (old_path text, version timestamptz)
language plpgsql
set search_path = ''
as $$
declare
  v_before timestamptz;
  v_after timestamptz;
begin
  perform public.assert_event_editor(p_event_id);
  select e.logo_path, e.updated_at into old_path, v_before from public.events e where e.id = p_event_id for update;
  update public.events set logo_path = p_path where id = p_event_id returning updated_at into v_after;
  version := case when p_version is not null and p_version = v_before then v_after end;
  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- The major sponsor (E-16): at most one per event. Replacing or clearing it
-- returns the file it replaced. The event row lock serialises two
-- replacements arriving together.
-- ---------------------------------------------------------------------------
create function public.set_major_sponsor(p_event_id uuid, p_path text default null)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_old text;
begin
  perform public.assert_event_editor(p_event_id);
  perform 1 from public.events e where e.id = p_event_id for update;
  select s.image_path into v_old from public.event_sponsors s where s.event_id = p_event_id and s.tier = 'major';
  delete from public.event_sponsors where event_id = p_event_id and tier = 'major';
  if p_path is not null then
    insert into public.event_sponsors (event_id, tier, image_path) values (p_event_id, 'major', p_path);
  end if;
  return v_old;
end;
$$;

revoke execute on function public.set_event_logo(uuid, text, timestamptz) from public, anon;
revoke execute on function public.set_major_sponsor(uuid, text) from public, anon;
grant execute on function public.set_event_logo(uuid, text, timestamptz) to authenticated;
grant execute on function public.set_major_sponsor(uuid, text) to authenticated;
