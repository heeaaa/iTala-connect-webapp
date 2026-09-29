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
    if not exists (select 1 from public.division_mobile_links l
                   where l.division_id = v_game.division_id and l.league_id = v_league_id) then
      raise exception 'Mobile league is not linked to this fixture division' using errcode = '23514';
    end if;
    select m.team_id into v_home_team from public.division_mobile_team_links m
      where m.division_id = v_game.division_id and m.mobile_team_id = p_source ->> 'home_team_id';
    select m.team_id into v_away_team from public.division_mobile_team_links m
      where m.division_id = v_game.division_id and m.mobile_team_id = p_source ->> 'away_team_id';
    if v_home_team is null or v_away_team is null or v_home_team = v_away_team or
       (v_game.team1_id is not null and v_game.team1_id not in (v_home_team, v_away_team)) or
       (v_game.team2_id is not null and v_game.team2_id not in (v_home_team, v_away_team)) then
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
