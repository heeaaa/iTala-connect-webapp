-- Firebase import: guards from the 7b/7c review (Phase 7, 27/09/2026).
--
-- import_legacy_event (replaces the two-argument version from 0500):
--   * refuses an event changed in iTala Connect since its last import (an
--     audited action such as a score, approval, publish or link; an edit to
--     the event, its divisions, teams, games or scores; a row added there), or
--     one imported before and since deleted in Connect, unless p_force;
--   * refuses an export that holds far fewer games or scores for the event
--     than iTala Connect does (a cleared or partial export), unless p_force;
--   * refuses a payload whose lists are missing instead of treating them as
--     empty;
--   * keeps the stored link time when the export has none, and clears a
--     Connect linker on a re-import (the link is the old one again).
-- set_legacy_event_images (replaces the three-argument version from 0600):
--   with p_replace false it only fills empty slots and removes nothing, so a
--   re-run whose old images cannot be fetched keeps the copies made before;
--   every call records 'event.legacy_images', which the guard above treats
--   as part of the import.

drop function public.import_legacy_event(uuid, jsonb);
drop function public.set_legacy_event_images(uuid, text, jsonb);

-- When the import last wrote this event (its data or its images).
create function public.legacy_import_baseline(p_event_id uuid)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select max(a.at) from public.audit_log a
  where a.event_id = p_event_id and a.action in ('event.legacy_import', 'event.legacy_images');
$$;
revoke execute on function public.legacy_import_baseline(uuid) from public, anon, authenticated;

-- What changed in iTala Connect since then, in words, or null.
create function public.legacy_import_changes(p_event_id uuid)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_since timestamptz := public.legacy_import_baseline(p_event_id);
  v_what text;
begin
  if v_since is null then
    return 'it has no record of an earlier import';
  end if;
  -- An owner reassigned by a superadmin is kept by the import, so it does not count.
  select a.action into v_what from public.audit_log a
  where a.event_id = p_event_id and a.at > v_since
    and a.action not in ('event.legacy_import', 'event.legacy_images', 'event.reassign')
  order by a.at limit 1;
  if v_what is not null then
    return 'it has a change recorded as ' || v_what;
  end if;
  if exists (select 1 from public.events e where e.id = p_event_id and e.updated_at > v_since) then
    return 'its details were edited';
  end if;
  if exists (select 1 from public.divisions d where d.event_id = p_event_id and (d.updated_at > v_since or d.created_at > v_since)) then
    return 'a division was added or edited';
  end if;
  if exists (select 1 from public.teams t join public.divisions d on d.id = t.division_id
             where d.event_id = p_event_id and (t.updated_at > v_since or t.created_at > v_since)) then
    return 'a team was added or edited';
  end if;
  if exists (select 1 from public.games g where g.event_id = p_event_id and (g.updated_at > v_since or g.created_at > v_since)) then
    return 'a game was added or moved';
  end if;
  if exists (select 1 from public.game_scores s where s.event_id = p_event_id and s.updated_at > v_since) then
    return 'a score was entered';
  end if;
  if exists (select 1 from public.event_sponsors s where s.event_id = p_event_id and s.created_at > v_since) then
    return 'a sponsor was added';
  end if;
  return null;
end;
$$;
revoke execute on function public.legacy_import_changes(uuid) from public, anon, authenticated;

create function public.import_legacy_event(p_owner uuid, p_event jsonb, p_force boolean default false)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  e jsonb := p_event -> 'event';
  d jsonb;
  t jsonb;
  g jsonb;
  v_event uuid;
  v_created boolean;
  v_div uuid;
  v_team uuid;
  v_game uuid;
  v_changed text;
  v_had_games int;
  v_had_scores int;
  v_keys text[] := '{}';
  v_teams uuid[] := '{}';
  v_gids text[] := '{}';
  n_players int := 0;
  n_scores int := 0;
  n_sources int := 0;
  n_links int := 0;
  n_rows int;
begin
  if not public.is_privileged_role() then
    raise exception 'Only the migration import can import legacy events' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_owner and p.role is not null and p.disabled_at is null) then
    raise exception 'The owner must be an active admin' using errcode = '22023';
  end if;
  if jsonb_typeof(e) is distinct from 'object' or nullif(e ->> 'legacy_firebase_id', '') is null then
    raise exception 'The event has no Firebase id' using errcode = '22023';
  end if;
  -- A missing list is never read as "none": that would delete what is stored.
  if jsonb_typeof(p_event -> 'divisions') is distinct from 'array'
     or jsonb_typeof(p_event -> 'games') is distinct from 'array'
     or exists (select 1 from jsonb_array_elements(p_event -> 'divisions') x
                where jsonb_typeof(x -> 'teams') is distinct from 'array'
                   or exists (select 1 from jsonb_array_elements(case when jsonb_typeof(x -> 'teams') = 'array' then x -> 'teams' else '[]'::jsonb end) y
                              where jsonb_typeof(y -> 'players') is distinct from 'array')) then
    raise exception 'The import payload is incomplete' using errcode = '22023';
  end if;

  -- Guards for an event already here, or imported before and since deleted.
  select ev.id into v_event from public.events ev where ev.legacy_firebase_id = e ->> 'legacy_firebase_id';
  if not p_force then
    if v_event is not null then
      v_changed := public.legacy_import_changes(v_event);
      if v_changed is not null then
        raise exception 'This event was changed in iTala Connect since its last import (%)', v_changed
          using errcode = '55000', hint = 'Importing it again would undo that. Only with an explicit overwrite for this event.';
      end if;
      select count(*) into v_had_games from public.games gm where gm.event_id = v_event;
      select count(*) into v_had_scores from public.game_scores gs where gs.event_id = v_event;
      if (v_had_games >= 4 and jsonb_array_length(p_event -> 'games') * 2 < v_had_games)
         or (v_had_scores >= 4 and (select count(*) from jsonb_array_elements(p_event -> 'games') x
                                    where jsonb_typeof(x -> 'score') = 'object') * 2 < v_had_scores) then
        raise exception 'The export has far fewer games or scores for this event than iTala Connect holds (% games, % scores)',
          v_had_games, v_had_scores
          using errcode = '55000', hint = 'A cleared or partial export would delete them. Only with an explicit overwrite for this event.';
      end if;
    elsif exists (select 1 from public.audit_log a
                  where a.action = 'event.legacy_import' and a.detail ->> 'legacy_firebase_id' = e ->> 'legacy_firebase_id') then
      raise exception 'This event was imported before and has since been deleted in iTala Connect'
        using errcode = '55000', hint = 'Only with an explicit overwrite for this event.';
    end if;
  end if;

  perform set_config('itala.legacy_import', 'on', true);

  -- The event. A later import keeps the owner (a superadmin may have
  -- reassigned it), the creation time and the images.
  insert into public.events as ev (
    owner_id, legacy_firebase_id, legacy_created_by, name, status, schedule_days, time_start, time_end,
    courts, court_names, timezone, theme_primary, theme_bg, theme_text, theme_text_secondary, theme_heading,
    rules_html, created_at)
  values (
    p_owner, e ->> 'legacy_firebase_id', e ->> 'legacy_created_by', e ->> 'name', e ->> 'status',
    array(select jsonb_array_elements_text(e -> 'schedule_days'))::date[],
    (e ->> 'time_start')::time, (e ->> 'time_end')::time, (e ->> 'courts')::smallint,
    array(select jsonb_array_elements_text(e -> 'court_names')), e ->> 'timezone',
    e ->> 'theme_primary', e ->> 'theme_bg', e ->> 'theme_text', e ->> 'theme_text_secondary', e ->> 'theme_heading',
    e ->> 'rules_html', coalesce((e ->> 'created_at')::timestamptz, now()))
  on conflict (legacy_firebase_id) do update set
    legacy_created_by = excluded.legacy_created_by,
    name = excluded.name,
    status = excluded.status,
    schedule_days = excluded.schedule_days,
    time_start = excluded.time_start,
    time_end = excluded.time_end,
    courts = excluded.courts,
    court_names = excluded.court_names,
    timezone = excluded.timezone,
    theme_primary = excluded.theme_primary,
    theme_bg = excluded.theme_bg,
    theme_text = excluded.theme_text,
    theme_text_secondary = excluded.theme_text_secondary,
    theme_heading = excluded.theme_heading,
    rules_html = excluded.rules_html
  returning ev.id, (ev.xmax = 0) into v_event, v_created;

  -- Divisions, their teams and players, and mobile links.
  for d in select * from jsonb_array_elements(p_event -> 'divisions') loop
    insert into public.divisions as dv (event_id, legacy_key, name, color, bracket_count, custom_games_per_team, games_per_team, sort_order)
    values (v_event, d ->> 'legacy_key', d ->> 'name', d ->> 'color', (d ->> 'bracket_count')::smallint,
            (d ->> 'custom_games_per_team')::boolean, (d ->> 'games_per_team')::smallint, (d ->> 'sort_order')::int)
    on conflict (event_id, legacy_key) do update set
      name = excluded.name, color = excluded.color, bracket_count = excluded.bracket_count,
      custom_games_per_team = excluded.custom_games_per_team, games_per_team = excluded.games_per_team,
      sort_order = excluded.sort_order
    returning dv.id into v_div;
    v_keys := v_keys || (d ->> 'legacy_key');

    for t in select * from jsonb_array_elements(d -> 'teams') loop
      insert into public.teams as tm (division_id, legacy_code, name, coach, sort_order)
      values (v_div, t ->> 'legacy_code', t ->> 'name', t ->> 'coach', (t ->> 'sort_order')::int)
      on conflict (division_id, legacy_code) do update set
        name = excluded.name, coach = excluded.coach, sort_order = excluded.sort_order
      returning tm.id into v_team;
      v_teams := v_teams || v_team;
      -- Players have no old key: the team's list is replaced.
      delete from public.players where team_id = v_team;
      insert into public.players (team_id, name, number, sort_order)
      select v_team, p ->> 'name', p ->> 'number', (p ->> 'sort_order')::int
      from jsonb_array_elements(t -> 'players') p;
      get diagnostics n_rows = row_count;
      n_players := n_players + n_rows;
    end loop;
    delete from public.teams where division_id = v_div and not (id = any(v_teams));

    if jsonb_typeof(d -> 'mobile_link') = 'object' then
      insert into public.division_mobile_links as ml (division_id, league_id, league_name, season, linked_at, linked_by_legacy)
      values (v_div, d -> 'mobile_link' ->> 'league_id', coalesce(d -> 'mobile_link' ->> 'league_name', ''),
              d -> 'mobile_link' ->> 'season', coalesce((d -> 'mobile_link' ->> 'linked_at')::timestamptz, now()),
              d -> 'mobile_link' ->> 'linked_by_legacy')
      on conflict (division_id) do update set
        league_id = excluded.league_id, league_name = excluded.league_name, season = excluded.season,
        -- Without a time in the export, the stored one stays.
        linked_at = coalesce((d -> 'mobile_link' ->> 'linked_at')::timestamptz, ml.linked_at),
        linked_by = null, linked_by_legacy = excluded.linked_by_legacy;
      delete from public.division_mobile_team_links where division_id = v_div;
      insert into public.division_mobile_team_links (division_id, team_id, mobile_team_id)
      select v_div, tm.id, x ->> 'mobile_team_id'
      from jsonb_array_elements(coalesce(d -> 'mobile_link' -> 'teams', '[]'::jsonb)) x
      join public.teams tm on tm.division_id = v_div and tm.legacy_code = x ->> 'legacy_code';
      n_links := n_links + 1;
    else
      delete from public.division_mobile_links where division_id = v_div;
    end if;
  end loop;
  delete from public.divisions where event_id = v_event and (legacy_key is null or not (legacy_key = any(v_keys)));

  -- Games. Every slot is freed first so games can trade slots in one pass
  -- without tripping games_slot_unique.
  update public.games set day = null, start_time = null, court = null where event_id = v_event and day is not null;
  for g in select * from jsonb_array_elements(p_event -> 'games') loop
    insert into public.games as gm (
      event_id, division_id, legacy_gid, legacy_index, legacy_team1, legacy_team2, day, start_time, court,
      group_id, team1_id, team2_id, label, type, is_playoff, bracket_game_id, team1_source, team2_source,
      playoff_round, position)
    values (
      v_event,
      (select dv.id from public.divisions dv where dv.event_id = v_event and dv.legacy_key = g ->> 'division_key'),
      g ->> 'legacy_gid', (g ->> 'legacy_index')::int, g ->> 'legacy_team1', g ->> 'legacy_team2',
      (g ->> 'day')::date, (g ->> 'start_time')::time, (g ->> 'court')::smallint, g ->> 'group_id',
      (select tm.id from public.teams tm join public.divisions dv on dv.id = tm.division_id
        where dv.event_id = v_event and dv.legacy_key = g -> 'team1' ->> 'divisionKey' and tm.legacy_code = g -> 'team1' ->> 'code'),
      (select tm.id from public.teams tm join public.divisions dv on dv.id = tm.division_id
        where dv.event_id = v_event and dv.legacy_key = g -> 'team2' ->> 'divisionKey' and tm.legacy_code = g -> 'team2' ->> 'code'),
      coalesce(g ->> 'label', ''), coalesce(g ->> 'type', 'group'), coalesce((g ->> 'is_playoff')::boolean, false),
      g ->> 'bracket_game_id',
      case when jsonb_typeof(g -> 'team1_source') = 'object' then g -> 'team1_source' end,
      case when jsonb_typeof(g -> 'team2_source') = 'object' then g -> 'team2_source' end,
      (g ->> 'playoff_round')::int, (g ->> 'position')::int)
    on conflict (event_id, legacy_gid) do update set
      division_id = excluded.division_id, legacy_index = excluded.legacy_index,
      legacy_team1 = excluded.legacy_team1, legacy_team2 = excluded.legacy_team2,
      day = excluded.day, start_time = excluded.start_time, court = excluded.court, group_id = excluded.group_id,
      team1_id = excluded.team1_id, team2_id = excluded.team2_id, label = excluded.label, type = excluded.type,
      is_playoff = excluded.is_playoff, bracket_game_id = excluded.bracket_game_id,
      team1_source = excluded.team1_source, team2_source = excluded.team2_source,
      playoff_round = excluded.playoff_round, position = excluded.position
    returning gm.id into v_game;
    v_gids := v_gids || (g ->> 'legacy_gid');

    if jsonb_typeof(g -> 'score') = 'object' then
      insert into public.game_scores as gs (game_id, event_id, s1, s2)
      values (v_game, v_event, (g -> 'score' ->> 's1')::int, (g -> 'score' ->> 's2')::int)
      on conflict (game_id) do update set s1 = excluded.s1, s2 = excluded.s2;
      n_scores := n_scores + 1;
    else
      delete from public.game_scores where game_id = v_game;
    end if;

    if jsonb_typeof(g -> 'source') = 'object' then
      insert into public.score_sources as ss (
        game_id, mobile_game_id, league_id, s1, s2, home_pts, away_pts, event_count, last_event_at, finished_at,
        approved_by_legacy, approved_at, method, dismissed_at)
      values (
        v_game, g -> 'source' ->> 'mobile_game_id', g -> 'source' ->> 'league_id',
        (g -> 'source' ->> 's1')::int, (g -> 'source' ->> 's2')::int,
        (g -> 'source' ->> 'home_pts')::int, (g -> 'source' ->> 'away_pts')::int, (g -> 'source' ->> 'event_count')::int,
        (g -> 'source' ->> 'last_event_at')::timestamptz, (g -> 'source' ->> 'finished_at')::timestamptz,
        g -> 'source' ->> 'approved_by_legacy', (g -> 'source' ->> 'approved_at')::timestamptz,
        g -> 'source' ->> 'method', (g -> 'source' ->> 'dismissed_at')::timestamptz)
      on conflict (game_id) do update set
        mobile_game_id = excluded.mobile_game_id, league_id = excluded.league_id, s1 = excluded.s1, s2 = excluded.s2,
        home_pts = excluded.home_pts, away_pts = excluded.away_pts, event_count = excluded.event_count,
        last_event_at = excluded.last_event_at, finished_at = excluded.finished_at,
        approved_by = null, approved_by_legacy = excluded.approved_by_legacy, approved_at = excluded.approved_at,
        method = excluded.method, dismissed_at = excluded.dismissed_at;
      n_sources := n_sources + 1;
    else
      delete from public.score_sources where game_id = v_game;
    end if;
  end loop;
  delete from public.games where event_id = v_event and (legacy_gid is null or not (legacy_gid = any(v_gids)));

  perform set_config('itala.legacy_import', '', true);
  insert into public.audit_log (actor_id, action, event_id, detail)
  values (null, 'event.legacy_import', v_event, jsonb_build_object(
    'legacy_firebase_id', e ->> 'legacy_firebase_id', 'created', v_created, 'forced', p_force,
    'divisions', coalesce(array_length(v_keys, 1), 0), 'teams', coalesce(array_length(v_teams, 1), 0),
    'players', n_players, 'games', coalesce(array_length(v_gids, 1), 0), 'scores', n_scores,
    'approvals', n_sources, 'mobile_links', n_links));

  return jsonb_build_object(
    'event_id', v_event, 'created', v_created,
    'divisions', coalesce(array_length(v_keys, 1), 0), 'teams', coalesce(array_length(v_teams, 1), 0),
    'players', n_players, 'games', coalesce(array_length(v_gids, 1), 0), 'scores', n_scores,
    'approvals', n_sources, 'mobile_links', n_links);
end;
$$;

revoke execute on function public.import_legacy_event(uuid, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.import_legacy_event(uuid, jsonb, boolean) to service_role;

-- An imported event's logo and sponsors. With p_replace they are set
-- together and the files no longer used are returned for removal; without it
-- (some old images could not be copied this time) only empty slots are
-- filled and nothing is returned, so earlier copies stay.
create function public.set_legacy_event_images(p_event_id uuid, p_logo_path text, p_sponsors jsonb, p_replace boolean default true)
returns text[]
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_old text[];
  v_new text[];
  v_unused text[] := '{}';
begin
  if not public.is_privileged_role() then
    raise exception 'Only the migration import can set imported images' using errcode = '42501';
  end if;
  if not exists (select 1 from public.events e where e.id = p_event_id and e.legacy_firebase_id is not null) then
    raise exception 'Not an imported event' using errcode = '22023';
  end if;
  if p_replace then
    select coalesce(array_agg(o.path), '{}') into v_old from (
      select e.logo_path as path from public.events e where e.id = p_event_id and e.logo_path is not null
      union all
      select s.image_path from public.event_sponsors s where s.event_id = p_event_id
    ) o;
    v_new := array_remove(array[p_logo_path], null)
      || array(select x ->> 'image_path' from jsonb_array_elements(coalesce(p_sponsors, '[]'::jsonb)) x);
    update public.events set logo_path = p_logo_path where id = p_event_id;
    delete from public.event_sponsors where event_id = p_event_id;
    insert into public.event_sponsors (event_id, tier, image_path, sort_order)
    select p_event_id, x ->> 'tier', x ->> 'image_path', (x ->> 'sort_order')::int
    from jsonb_array_elements(coalesce(p_sponsors, '[]'::jsonb)) x;
    v_unused := array(select d.p from (select unnest(v_old) as p except select unnest(v_new)) d order by d.p);
  else
    if p_logo_path is not null then
      update public.events set logo_path = p_logo_path where id = p_event_id and logo_path is null;
    end if;
    if not exists (select 1 from public.event_sponsors s where s.event_id = p_event_id) then
      insert into public.event_sponsors (event_id, tier, image_path, sort_order)
      select p_event_id, x ->> 'tier', x ->> 'image_path', (x ->> 'sort_order')::int
      from jsonb_array_elements(coalesce(p_sponsors, '[]'::jsonb)) x;
    end if;
  end if;
  -- Part of the import: changes made here do not count as changes in Connect.
  insert into public.audit_log (actor_id, action, event_id, detail)
  values (null, 'event.legacy_images', p_event_id, jsonb_build_object('replaced', p_replace, 'unused', to_jsonb(v_unused)));
  return v_unused;
end;
$$;

revoke execute on function public.set_legacy_event_images(uuid, text, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.set_legacy_event_images(uuid, text, jsonb, boolean) to service_role;
