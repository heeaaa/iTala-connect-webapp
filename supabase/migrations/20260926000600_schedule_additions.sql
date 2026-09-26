-- Phase 5c-3: "+ Round robin" (E-63) and "+ Playoff" (E-64) in one
-- transaction each, and distinct event days (Phase 2 review handover).

-- ---------------------------------------------------------------------------
-- Event days are distinct. The editor RPC and zod already de-duplicate; the
-- database now says so too, because a repeated day would offer the same
-- slots twice to the scheduler and to playoff placement.
-- ---------------------------------------------------------------------------
create function public.dates_are_distinct(p_days date[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select count(*) = count(distinct d) from unnest(p_days) as d;
$$;

revoke execute on function public.dates_are_distinct(date[]) from public, anon;
grant execute on function public.dates_are_distinct(date[]) to authenticated;

-- Existing rows: each day once, in order (a missing element is not a day).
update public.events
   set schedule_days = array(select distinct d from unnest(schedule_days) as d where d is not null order by 1)
 where not public.dates_are_distinct(schedule_days);

alter table public.events
  add constraint events_schedule_days_distinct check (public.dates_are_distinct(schedule_days));

-- ---------------------------------------------------------------------------
-- Shared start of both additions: the caller edits the event, it is
-- published, and it is locked so a re-publish cannot run alongside. Games
-- that no longer fit the event's days, hours or courts are unscheduled
-- first, as the old editor's collectEditorFields (reconcileSchedule) did
-- before either addition.
-- ---------------------------------------------------------------------------
create function public.begin_schedule_addition(p_event_id uuid, p_unschedule uuid[])
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform public.assert_event_editor(p_event_id);
  perform 1 from public.events e where e.id = p_event_id and e.status = 'published' for update;
  if not found then
    raise exception 'Games are added this way to published events only' using errcode = '22023';
  end if;
  update public.games
     set day = null, start_time = null, court = null
   where event_id = p_event_id and id = any (coalesce(p_unschedule, '{}'));
end;
$$;

-- ---------------------------------------------------------------------------
-- "+ Round robin" on a published event. Like the old editor, it keeps the
-- chosen games per team on the division and adds the new games; when any
-- were added it sorts the whole schedule (sortSchedule after concat):
-- scheduled games by day, time and court, unscheduled games last,
-- otherwise in their existing order. Security invoker, so RLS applies;
-- never touches scores.
-- ---------------------------------------------------------------------------
create function public.add_round_robin(
  p_event_id uuid,
  p_division_id uuid,
  p_custom boolean,
  p_games_per_team integer,
  p_unschedule uuid[],
  p_games jsonb
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform public.begin_schedule_addition(p_event_id, p_unschedule);
  update public.divisions
     set custom_games_per_team = p_custom,
         games_per_team = case when p_custom then p_games_per_team end
   where id = p_division_id and event_id = p_event_id;
  if not found then
    raise exception 'Division not found in this event' using errcode = 'P0002';
  end if;
  v_count := public.insert_games_json_invoker(p_event_id, p_games);
  if v_count > 0 then
    with ordered as (
      select id,
             (row_number() over (
                order by (day is null or start_time is null), day, start_time, court, position, id
             ) - 1)::integer as pos
        from public.games
       where event_id = p_event_id
    )
    update public.games g
       set position = o.pos
      from ordered o
     where g.id = o.id and g.position <> o.pos;
  end if;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- "+ Playoff" on a published event: the bracket games are appended after the
-- existing ones without sorting, as the old editor pushed them.
-- ---------------------------------------------------------------------------
create function public.add_playoff(p_event_id uuid, p_unschedule uuid[], p_games jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
begin
  perform public.begin_schedule_addition(p_event_id, p_unschedule);
  return public.insert_games_json_invoker(p_event_id, p_games);
end;
$$;

revoke execute on function public.begin_schedule_addition(uuid, uuid[]) from public, anon;
revoke execute on function public.add_round_robin(uuid, uuid, boolean, integer, uuid[], jsonb) from public, anon;
revoke execute on function public.add_playoff(uuid, uuid[], jsonb) from public, anon;
grant execute on function public.begin_schedule_addition(uuid, uuid[]) to authenticated;
grant execute on function public.add_round_robin(uuid, uuid, boolean, integer, uuid[], jsonb) to authenticated;
grant execute on function public.add_playoff(uuid, uuid[], jsonb) to authenticated;
