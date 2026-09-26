-- Editor save for drafts and published events (PRD E-02, E-05, E-14, E-22, E-23).
-- Replaces save_draft_editor. One transaction; it never writes score,
-- provenance or mobile-link rows itself (E-06). On a published event:
--   * p_unschedule lists this event's games that no longer fit the new days,
--     hours or courts (computed by the ported reconcileSchedule); they move to
--     Unscheduled (E-14).
--   * removing a division removes its games with it, and so their scores (E-22,
--     the editor states the count first).
--   * removing a team keeps its games with that side TBD (E-23, confirmed first).
drop function public.save_draft_editor(uuid, timestamptz, jsonb, jsonb);

create function public.save_event_editor(p_event_id uuid, p_version timestamptz, p_details jsonb,
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
    theme_heading = p_details->>'theme_heading'
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
revoke all on function public.save_event_editor(uuid, timestamptz, jsonb, jsonb, uuid[]) from public, anon;
grant execute on function public.save_event_editor(uuid, timestamptz, jsonb, jsonb, uuid[]) to authenticated;
