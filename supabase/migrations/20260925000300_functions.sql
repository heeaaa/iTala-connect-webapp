-- Atomic operations (docs/MIGRATION_PLAN.md section 7) and audit triggers.
-- Operation functions are security invoker, so RLS still applies; each one
-- also checks is_event_editor up front to return a clear error instead of
-- silently touching zero rows.

-- ---------------------------------------------------------------------------
-- Audit triggers (security definer: the only writers of audit_log)
-- ---------------------------------------------------------------------------

create function public.audit_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
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

create trigger audit_events
after insert or update or delete on public.events
for each row execute function public.audit_events();

create function public.audit_game_scores()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
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

create trigger audit_game_scores
after insert or update or delete on public.game_scores
for each row execute function public.audit_game_scores();

create function public.audit_score_sources()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event uuid := (select g.event_id from public.games g where g.id = new.game_id);
begin
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

create trigger audit_score_sources
after insert or update on public.score_sources
for each row execute function public.audit_score_sources();

-- One row per statement for game deletes, so a re-publish is one entry.
create function public.audit_games_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_log (actor_id, action, event_id, detail)
  select (select auth.uid()), 'games.delete', o.event_id,
         jsonb_build_object('count', count(*), 'game_ids', jsonb_agg(o.id))
  from old_rows o
  where exists (select 1 from public.events e where e.id = o.event_id)
  group by o.event_id;
  return null;
end;
$$;

create trigger audit_games_delete
after delete on public.games
referencing old table as old_rows
for each statement execute function public.audit_games_delete();

-- ---------------------------------------------------------------------------
-- Operations
-- ---------------------------------------------------------------------------

create function public.assert_event_editor(p_event_id uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_event_id is null or not public.is_event_editor(p_event_id) then
    raise exception 'You do not have permission to edit this event' using errcode = '42501';
  end if;
end;
$$;


-- Inserts a jsonb array of games for an event with the caller's rights
-- (RLS applies). Unknown keys are ignored; id is kept when given (stable
-- game ids) or generated.
create function public.insert_games_json_invoker(p_event_id uuid, p_games jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform public.assert_event_editor(p_event_id);
  if p_games is null or jsonb_typeof(p_games) <> 'array' then
    raise exception 'games must be a JSON array' using errcode = '22023';
  end if;
  insert into public.games (
    id, event_id, division_id, day, start_time, court, group_id, team1_id, team2_id,
    label, type, is_playoff, bracket_game_id, team1_source, team2_source, playoff_round, position
  )
  select coalesce(r.id, gen_random_uuid()), p_event_id, r.division_id, r.day, r.start_time, r.court,
         r.group_id, r.team1_id, r.team2_id, coalesce(r.label, ''), coalesce(r.type, 'group'),
         coalesce(r.is_playoff, false), r.bracket_game_id, r.team1_source, r.team2_source,
         r.playoff_round, coalesce(r.position, 0)
  from jsonb_to_recordset(p_games) as r(
    id uuid, division_id uuid, day date, start_time time, court smallint, group_id text,
    team1_id uuid, team2_id uuid, label text, type text, is_playoff boolean,
    bracket_game_id text, team1_source jsonb, team2_source jsonb, playoff_round integer, position integer
  );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Publish or re-publish (E-61, E-62). Rebuilds the schedule from scratch in
-- one transaction. If scores exist and p_clear_scores is false it refuses
-- and changes nothing, so "decline" is safe.
create function public.publish_event(p_event_id uuid, p_games jsonb, p_clear_scores boolean default false)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_scored integer;
  v_count integer;
begin
  perform public.assert_event_editor(p_event_id);
  perform 1 from public.events e where e.id = p_event_id for update;

  select count(*) into v_scored
  from public.game_scores s
  where s.event_id = p_event_id and (s.s1 is not null or s.s2 is not null);

  if v_scored > 0 and not coalesce(p_clear_scores, false) then
    raise exception 'This event has % recorded score(s). Confirm clearing them to re-publish.', v_scored
      using errcode = 'P0001', hint = 'scores_exist';
  end if;

  delete from public.games g where g.event_id = p_event_id;
  v_count := public.insert_games_json_invoker(p_event_id, p_games);

  update public.events
     set status = 'published', published_at = clock_timestamp()
   where id = p_event_id;

  return v_count;
end;
$$;


-- Round robin and playoff additions (E-63, E-64).
create function public.append_games(p_event_id uuid, p_games jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
begin
  perform public.assert_event_editor(p_event_id);
  return public.insert_games_json_invoker(p_event_id, p_games);
end;
$$;

create function public.move_game(p_game_id uuid, p_day date, p_start_time time, p_court smallint)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform public.assert_event_editor(public.game_event_id(p_game_id));
  if p_day is null or p_start_time is null or p_court is null then
    raise exception 'A slot needs a day, a time and a court' using errcode = '22023';
  end if;
  update public.games set day = p_day, start_time = p_start_time, court = p_court where id = p_game_id;
end;
$$;

create function public.unschedule_game(p_game_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform public.assert_event_editor(public.game_event_id(p_game_id));
  update public.games set day = null, start_time = null, court = null where id = p_game_id;
end;
$$;

-- Swaps the slots of two games in the same event. Either may be unscheduled.
create function public.swap_games(p_a uuid, p_b uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  a public.games%rowtype;
  b public.games%rowtype;
begin
  select * into a from public.games where id = p_a for update;
  select * into b from public.games where id = p_b for update;
  if a.id is null or b.id is null then
    raise exception 'Game not found' using errcode = 'P0002';
  end if;
  if a.event_id <> b.event_id then
    raise exception 'Games belong to different events' using errcode = '22023';
  end if;
  perform public.assert_event_editor(a.event_id);
  update public.games set day = null, start_time = null, court = null where id = a.id;
  update public.games set day = a.day, start_time = a.start_time, court = a.court where id = b.id;
  update public.games set day = b.day, start_time = b.start_time, court = b.court where id = a.id;
end;
$$;

-- Manual score entry: both null clears the score. Any manual edit drops
-- mobile provenance for that game.
create function public.set_score(p_game_id uuid, p_s1 integer, p_s2 integer)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform public.assert_event_editor(public.game_event_id(p_game_id));
  if p_s1 is null and p_s2 is null then
    delete from public.game_scores where game_id = p_game_id;
  else
    insert into public.game_scores (game_id, event_id, s1, s2)
    values (p_game_id, public.game_event_id(p_game_id), p_s1, p_s2)
    on conflict (game_id) do update set s1 = excluded.s1, s2 = excluded.s2;
  end if;
  delete from public.score_sources where game_id = p_game_id;
end;
$$;

-- Approve a mobile result: score and provenance written together.
create function public.approve_mobile_result(p_game_id uuid, p_s1 integer, p_s2 integer, p_source jsonb)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform public.assert_event_editor(public.game_event_id(p_game_id));
  if p_s1 is null or p_s2 is null then
    raise exception 'An approved result needs both scores' using errcode = '22023';
  end if;
  insert into public.game_scores (game_id, event_id, s1, s2)
  values (p_game_id, public.game_event_id(p_game_id), p_s1, p_s2)
  on conflict (game_id) do update set s1 = excluded.s1, s2 = excluded.s2;

  insert into public.score_sources (
    game_id, mobile_game_id, league_id, s1, s2, home_pts, away_pts, event_count,
    last_event_at, finished_at, approved_by, approved_at, method, dismissed_at
  ) values (
    p_game_id,
    p_source ->> 'mobile_game_id',
    p_source ->> 'league_id',
    p_s1, p_s2,
    (p_source ->> 'home_pts')::integer,
    (p_source ->> 'away_pts')::integer,
    (p_source ->> 'event_count')::integer,
    (p_source ->> 'last_event_at')::timestamptz,
    (p_source ->> 'finished_at')::timestamptz,
    (select auth.uid()), now(),
    coalesce(p_source ->> 'method', 'mobile'),
    null
  )
  on conflict (game_id) do update set
    mobile_game_id = excluded.mobile_game_id,
    league_id = excluded.league_id,
    s1 = excluded.s1, s2 = excluded.s2,
    home_pts = excluded.home_pts, away_pts = excluded.away_pts,
    event_count = excluded.event_count,
    last_event_at = excluded.last_event_at,
    finished_at = excluded.finished_at,
    approved_by = excluded.approved_by,
    approved_at = excluded.approved_at,
    method = excluded.method,
    dismissed_at = null;
end;
$$;

-- Mutations are for signed-in users only.
revoke execute on function public.publish_event(uuid, jsonb, boolean) from public, anon;
revoke execute on function public.append_games(uuid, jsonb) from public, anon;
revoke execute on function public.insert_games_json_invoker(uuid, jsonb) from public, anon;
revoke execute on function public.move_game(uuid, date, time, smallint) from public, anon;
revoke execute on function public.unschedule_game(uuid) from public, anon;
revoke execute on function public.swap_games(uuid, uuid) from public, anon;
revoke execute on function public.set_score(uuid, integer, integer) from public, anon;
revoke execute on function public.approve_mobile_result(uuid, integer, integer, jsonb) from public, anon;
grant execute on function public.publish_event(uuid, jsonb, boolean) to authenticated;
grant execute on function public.append_games(uuid, jsonb) to authenticated;
grant execute on function public.insert_games_json_invoker(uuid, jsonb) to authenticated;
grant execute on function public.move_game(uuid, date, time, smallint) to authenticated;
grant execute on function public.unschedule_game(uuid) to authenticated;
grant execute on function public.swap_games(uuid, uuid) to authenticated;
grant execute on function public.set_score(uuid, integer, integer) to authenticated;
grant execute on function public.approve_mobile_result(uuid, integer, integer, jsonb) to authenticated;

-- Trigger functions are never called directly through the API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.profiles_guard() from public, anon, authenticated;
revoke execute on function public.events_owner_guard() from public, anon, authenticated;
revoke execute on function public.games_validate_refs() from public, anon, authenticated;
revoke execute on function public.game_scores_stamp() from public, anon, authenticated;
revoke execute on function public.mobile_team_link_validate() from public, anon, authenticated;
revoke execute on function public.audit_events() from public, anon, authenticated;
revoke execute on function public.audit_game_scores() from public, anon, authenticated;
revoke execute on function public.audit_score_sources() from public, anon, authenticated;
revoke execute on function public.audit_games_delete() from public, anon, authenticated;
