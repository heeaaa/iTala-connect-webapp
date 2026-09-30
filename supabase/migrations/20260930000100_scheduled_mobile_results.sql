-- CSI-09/10: a mobile final may have one approved Connect fixture only.
-- Abort on duplicates; the documented preflight query lists IDs for deliberate repair. No score is removed here.
do $$
begin
  if exists (select 1 from public.score_sources where mobile_game_id is not null
             group by mobile_game_id having count(*) > 1) then
    raise exception 'Duplicate score_sources.mobile_game_id values exist. Run the CSI-10 preflight query and resolve each approval before applying this migration.'
      using errcode = '23505';
  end if;
end;
$$;

-- Return only conflicting mobile IDs, never another organiser's fixture or event.
create function public.mobile_result_conflicts(p_event_id uuid, p_mobile_game_ids text[])
returns table (mobile_game_id text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_event_editor(p_event_id);
  return query
    select s.mobile_game_id from public.score_sources s
    join public.games g on g.id = s.game_id
    where s.mobile_game_id = any(p_mobile_game_ids) and g.event_id <> p_event_id;
end;
$$;

revoke execute on function public.mobile_result_conflicts(uuid, text[]) from public, anon;
grant execute on function public.mobile_result_conflicts(uuid, text[]) to authenticated;

create unique index score_sources_mobile_game_id_unique
  on public.score_sources (mobile_game_id) where mobile_game_id is not null;

-- Resolve a playoff source from current Connect scores. Playoff team columns
-- are normally null; the inbox resolves seed and winner sources in memory.
-- This private helper applies the same rules inside the approval transaction.
create function public.resolve_claimed_playoff_team(p_game_id uuid, p_source jsonb, p_depth integer default 0)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game public.games%rowtype;
  v_ref public.games%rowtype;
  v_s1 integer;
  v_s2 integer;
  v_team1 uuid;
  v_team2 uuid;
  v_group_count integer;
  v_complete_count integer;
  v_rank integer;
  v_team uuid;
begin
  if p_depth > 16 or p_source is null then return null; end if;
  select * into v_game from public.games where id = p_game_id;
  if v_game.id is null then return null; end if;

  if p_source ->> 'type' = 'seed' then
    if coalesce(p_source ->> 'rank', '') !~ '^[1-9][0-9]*$' then return null; end if;
    v_rank := (p_source ->> 'rank')::integer;
    select count(*) into v_group_count from public.games g
      where g.division_id = v_game.division_id and g.type = 'group' and not g.is_playoff
        and g.team1_id is not null and g.team2_id is not null;
    if v_group_count = 0 then return null; end if;
    select count(*) into v_complete_count from public.games g
      join public.game_scores s on s.game_id = g.id and s.s1 is not null and s.s2 is not null
      where g.division_id = v_game.division_id and g.type = 'group' and not g.is_playoff
        and g.team1_id is not null and g.team2_id is not null;
    if v_complete_count <> v_group_count then return null; end if;

    with sides as (
      select g.team1_id as team_id, g.team2_id as opponent_id, s.s1 as pf, s.s2 as pa
      from public.games g join public.game_scores s on s.game_id = g.id
      where g.division_id = v_game.division_id and g.type = 'group' and not g.is_playoff
        and g.team1_id is not null and g.team2_id is not null
      union all
      select g.team2_id, g.team1_id, s.s2, s.s1
      from public.games g join public.game_scores s on s.game_id = g.id
      where g.division_id = v_game.division_id and g.type = 'group' and not g.is_playoff
        and g.team1_id is not null and g.team2_id is not null
    )
    select t.id into v_team from public.teams t
    left join lateral (
      select coalesce(sum((side.pf > side.pa)::integer), 0) as wins,
        coalesce(sum(side.pf - side.pa), 0) as diff,
        coalesce(sum(side.pf), 0) as pf
      from sides side
      join public.teams opponent on opponent.id = side.opponent_id
        and opponent.division_id = v_game.division_id
      where side.team_id = t.id
    ) standing on true
    where t.division_id = v_game.division_id
    order by standing.wins desc, standing.diff desc, standing.pf desc,
      t.sort_order, t.created_at, t.id
    offset v_rank - 1 limit 1;
    return v_team;
  end if;

  if p_source ->> 'type' = 'winner' then
    if nullif(p_source ->> 'bracketGameId', '') is null then return null; end if;
    select * into v_ref from public.games g
      where g.division_id = v_game.division_id and g.is_playoff
        and g.bracket_game_id = p_source ->> 'bracketGameId' and g.position < v_game.position
      order by g.position, g.id limit 1;
    if v_ref.id is null then return null; end if;
    select s1, s2 into v_s1, v_s2 from public.game_scores where game_id = v_ref.id;
    if v_s1 is null or v_s2 is null or v_s1 = v_s2 then return null; end if;
    if v_ref.team1_source is not null and v_ref.team2_source is not null and v_ref.bracket_game_id is not null then
      v_team1 := public.resolve_claimed_playoff_team(v_ref.id, v_ref.team1_source, p_depth + 1);
      v_team2 := public.resolve_claimed_playoff_team(v_ref.id, v_ref.team2_source, p_depth + 1);
    else
      v_team1 := v_ref.team1_id;
      v_team2 := v_ref.team2_id;
    end if;
    if v_team1 is null or v_team2 is null then return null; end if;
    return case when v_s1 > v_s2 then v_team1 else v_team2 end;
  end if;
  return null;
end;
$$;

revoke execute on function public.resolve_claimed_playoff_team(uuid, jsonb, integer)
  from public, anon, authenticated;

create or replace function public.approve_mobile_result(p_game_id uuid, p_s1 integer, p_s2 integer, p_source jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game public.games%rowtype;
  v_mobile_id text := p_source ->> 'mobile_game_id';
  v_league_id text := p_source ->> 'league_id';
  v_claimed_id uuid;
  v_prior_game uuid;
  v_current_source text;
  v_home_team uuid;
  v_away_team uuid;
  v_fixture_team1 uuid;
  v_fixture_team2 uuid;
  v_scored boolean;
begin
  -- The editor check stays first because this function writes with definer rights.
  perform public.assert_event_editor(public.game_event_id(p_game_id));
  if p_s1 is null or p_s2 is null or p_s1 < 0 or p_s2 < 0 then
    raise exception 'An approved result needs two scores of 0 or more' using errcode = '22023';
  end if;
  select * into strict v_game from public.games where id = p_game_id for update;

  if left(coalesce(v_mobile_id, ''), 3) = 'cg_' then
    if v_mobile_id !~* '^cg_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Invalid scheduled fixture ID' using errcode = '22023';
    end if;
    v_claimed_id := substring(v_mobile_id from 4)::uuid;
    if p_game_id <> v_claimed_id then
      raise exception 'Scheduled result belongs to another fixture' using errcode = '23514';
    end if;
    -- Link replacement locks the same division row, so a map cannot change
    -- between this check and the provenance write.
    perform 1 from public.divisions where id = v_game.division_id for share;
    if not exists (select 1 from public.division_mobile_links l
                   where l.division_id = v_game.division_id and l.league_id = v_league_id) then
      raise exception 'Mobile league is not linked to this fixture division' using errcode = '23514';
    end if;
    select m.team_id into v_home_team from public.division_mobile_team_links m
      where m.division_id = v_game.division_id and m.mobile_team_id = p_source ->> 'home_team_id';
    select m.team_id into v_away_team from public.division_mobile_team_links m
      where m.division_id = v_game.division_id and m.mobile_team_id = p_source ->> 'away_team_id';
    if v_game.is_playoff and v_game.bracket_game_id is not null
       and v_game.team1_source is not null and v_game.team2_source is not null then
      v_fixture_team1 := public.resolve_claimed_playoff_team(v_game.id, v_game.team1_source);
      v_fixture_team2 := public.resolve_claimed_playoff_team(v_game.id, v_game.team2_source);
    else
      v_fixture_team1 := v_game.team1_id;
      v_fixture_team2 := v_game.team2_id;
    end if;
    if v_home_team is null or v_away_team is null or v_fixture_team1 is null or v_fixture_team2 is null or
       not ((v_fixture_team1 = v_home_team and v_fixture_team2 = v_away_team) or
            (v_fixture_team1 = v_away_team and v_fixture_team2 = v_home_team)) then
      raise exception 'Team links do not match the scheduled fixture' using errcode = '23514';
    end if;
  end if;

  -- A unique index is the final boundary for approvals racing across fixtures.
  if v_mobile_id is not null then
    select game_id into v_prior_game from public.score_sources where mobile_game_id = v_mobile_id;
    if v_prior_game is not null and v_prior_game <> p_game_id then
      raise exception 'Mobile final is already approved for another fixture' using errcode = '23505';
    end if;
  end if;
  select mobile_game_id into v_current_source from public.score_sources where game_id = p_game_id for update;
  if v_claimed_id is not null then
    select exists (select 1 from public.game_scores where game_id = p_game_id
                   and (s1 is not null or s2 is not null)) into v_scored;
    if (v_current_source is not null and v_current_source is distinct from v_mobile_id) or
       (v_scored and v_current_source is distinct from v_mobile_id) then
      raise exception 'Connect already has a score for this fixture' using errcode = '23514';
    end if;
  end if;

  insert into public.game_scores (game_id, event_id, s1, s2)
  values (p_game_id, v_game.event_id, p_s1, p_s2)
  on conflict (game_id) do update set s1 = excluded.s1, s2 = excluded.s2;

  insert into public.score_sources (
    game_id, mobile_game_id, league_id, s1, s2, home_pts, away_pts, event_count,
    last_event_at, finished_at, approved_by, approved_at, method, dismissed_at
  ) values (
    p_game_id, v_mobile_id, v_league_id, p_s1, p_s2,
    (p_source ->> 'home_pts')::integer, (p_source ->> 'away_pts')::integer,
    (p_source ->> 'event_count')::integer, (p_source ->> 'last_event_at')::timestamptz,
    (p_source ->> 'finished_at')::timestamptz, (select auth.uid()), now(),
    coalesce(p_source ->> 'method', 'mobile'), null
  )
  on conflict (game_id) do update set
    mobile_game_id = excluded.mobile_game_id, league_id = excluded.league_id,
    s1 = excluded.s1, s2 = excluded.s2, home_pts = excluded.home_pts, away_pts = excluded.away_pts,
    event_count = excluded.event_count, last_event_at = excluded.last_event_at,
    finished_at = excluded.finished_at, approved_by = excluded.approved_by,
    approved_at = excluded.approved_at, approved_by_legacy = null,
    method = excluded.method, dismissed_at = null;
end;
$$;
