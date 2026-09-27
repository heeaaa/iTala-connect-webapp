-- Firebase import writer (MIGRATION_PLAN.md 12.1 step 5, Phase 7b).
--
-- import_legacy_event writes one old event, planned by scripts/migrate-firebase.ts,
-- in one transaction: a failure changes nothing. It upserts on the legacy_* keys,
-- so running it again with a later export updates the same rows (ids stay the
-- same), and removes what is no longer in the export. Images are not touched
-- here (the image step sets logo_path and event_sponsors).
--
-- Only the migration import may run it (the secret key): it is security invoker,
-- refuses any other role, and is granted to service_role only.
--
-- Audit (X-09): while it runs, the per-row audit triggers stay quiet and one
-- 'event.legacy_import' row records the import instead. The switch is a
-- transaction-local setting that only this function sets; clients cannot call
-- set_config (only public functions are exposed), and the trigger functions are
-- security definer, so they read the setting rather than the caller's role.

create function public.legacy_import_running()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(current_setting('itala.legacy_import', true), '') = 'on';
$$;
revoke execute on function public.legacy_import_running() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Audit triggers: unchanged apart from the first line of each body.
-- ---------------------------------------------------------------------------

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
  elsif tg_op = 'DELETE' then
    insert into public.audit_log (actor_id, action, event_id, detail)
    values ((select auth.uid()), 'event.delete', old.id, jsonb_build_object('name', old.name));
  end if;
  return null;
end;
$$;

create or replace function public.audit_game_scores()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.legacy_import_running() then return null; end if;
  if tg_op = 'DELETE' then
    -- Event deletion cascades here; the event.delete row already covers it.
    if exists (select 1 from public.events e where e.id = old.event_id) then
      insert into public.audit_log (actor_id, action, event_id, detail)
      values ((select auth.uid()), 'score.clear', old.event_id,
              jsonb_build_object('game_id', old.game_id, 'old_s1', old.s1, 'old_s2', old.s2));
    end if;
    return null;
  end if;
  if tg_op = 'UPDATE' and new.s1 is not distinct from old.s1 and new.s2 is not distinct from old.s2 then
    return null;
  end if;
  insert into public.audit_log (actor_id, action, event_id, detail)
  values ((select auth.uid()), 'score.set', new.event_id,
          jsonb_build_object(
            'game_id', new.game_id, 's1', new.s1, 's2', new.s2,
            'old_s1', case when tg_op = 'UPDATE' then old.s1 end,
            'old_s2', case when tg_op = 'UPDATE' then old.s2 end));
  return null;
end;
$$;

create or replace function public.audit_score_sources()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event uuid := (select g.event_id from public.games g where g.id = new.game_id);
begin
  if public.legacy_import_running() then return null; end if;
  if new.approved_at is not null
     and (tg_op = 'INSERT' or new.approved_at is distinct from old.approved_at) then
    insert into public.audit_log (actor_id, action, event_id, detail)
    values ((select auth.uid()), 'result.approve', v_event,
            jsonb_build_object('game_id', new.game_id, 'mobile_game_id', new.mobile_game_id,
                               's1', new.s1, 's2', new.s2, 'method', new.method));
  end if;
  if new.dismissed_at is not null
     and (tg_op = 'INSERT' or new.dismissed_at is distinct from old.dismissed_at) then
    insert into public.audit_log (actor_id, action, event_id, detail)
    values ((select auth.uid()), 'result.dismiss', v_event,
            jsonb_build_object('game_id', new.game_id, 'mobile_game_id', new.mobile_game_id));
  end if;
  return null;
end;
$$;

create or replace function public.audit_games_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.legacy_import_running() then return null; end if;
  insert into public.audit_log (actor_id, action, event_id, detail)
  select (select auth.uid()), 'games.delete', o.event_id,
         jsonb_build_object('count', count(*), 'game_ids', jsonb_agg(o.id))
  from old_rows o
  where exists (select 1 from public.events e where e.id = o.event_id)
  group by o.event_id;
  return null;
end;
$$;

create or replace function public.audit_mobile_import() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if public.legacy_import_running() then return null; end if;
  if coalesce(current_setting('itala.link_source', true), '') = 'wizard' then
    insert into public.audit_log (actor_id, action, event_id, detail)
    select auth.uid(), 'division.mobile_link', d.event_id,
      jsonb_build_object('division_id', new.division_id, 'league_id', new.league_id,
        'message', 'Linked to iTala mobile league ' || new.league_name)
    from public.divisions d where d.id = new.division_id;
  elsif tg_op = 'INSERT' then
    insert into public.audit_log (actor_id, action, event_id, detail)
    select auth.uid(), 'event.mobile_import', d.event_id,
      jsonb_build_object('league_id', new.league_id, 'message', 'Imported from iTala mobile league ' || new.league_name)
    from public.divisions d where d.id = new.division_id;
  end if;
  return null;
end; $$;

-- ---------------------------------------------------------------------------
-- The writer
-- ---------------------------------------------------------------------------

create function public.import_legacy_event(p_owner uuid, p_event jsonb)
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
  if nullif(e ->> 'legacy_firebase_id', '') is null then
    raise exception 'The event has no Firebase id' using errcode = '22023';
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
  for d in select * from jsonb_array_elements(coalesce(p_event -> 'divisions', '[]'::jsonb)) loop
    insert into public.divisions as dv (event_id, legacy_key, name, color, bracket_count, custom_games_per_team, games_per_team, sort_order)
    values (v_event, d ->> 'legacy_key', d ->> 'name', d ->> 'color', (d ->> 'bracket_count')::smallint,
            (d ->> 'custom_games_per_team')::boolean, (d ->> 'games_per_team')::smallint, (d ->> 'sort_order')::int)
    on conflict (event_id, legacy_key) do update set
      name = excluded.name, color = excluded.color, bracket_count = excluded.bracket_count,
      custom_games_per_team = excluded.custom_games_per_team, games_per_team = excluded.games_per_team,
      sort_order = excluded.sort_order
    returning dv.id into v_div;
    v_keys := v_keys || (d ->> 'legacy_key');

    for t in select * from jsonb_array_elements(coalesce(d -> 'teams', '[]'::jsonb)) loop
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
      from jsonb_array_elements(coalesce(t -> 'players', '[]'::jsonb)) p;
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
        linked_at = excluded.linked_at, linked_by_legacy = excluded.linked_by_legacy;
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
  for g in select * from jsonb_array_elements(coalesce(p_event -> 'games', '[]'::jsonb)) loop
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
    'legacy_firebase_id', e ->> 'legacy_firebase_id', 'created', v_created,
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

revoke execute on function public.import_legacy_event(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.import_legacy_event(uuid, jsonb) to service_role;

-- Platform settings from the old database: the default rules template, only
-- when iTala Connect has none yet (one set here is never overwritten).
-- Sponsors are images, set by the image step. Returns whether it was set.
create function public.import_legacy_platform(p_default_rules_html text)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.is_privileged_role() then
    raise exception 'Only the migration import can import legacy settings' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_default_rules_html, '')), '') is null then
    return false;
  end if;
  insert into public.platform_settings (id, default_rules_html) values (true, p_default_rules_html)
  on conflict (id) do update set default_rules_html = excluded.default_rules_html
  where public.platform_settings.default_rules_html = '';
  return found;
end;
$$;

revoke execute on function public.import_legacy_platform(text) from public, anon, authenticated;
grant execute on function public.import_legacy_platform(text) to service_role;
