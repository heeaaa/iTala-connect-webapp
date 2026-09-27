-- Results inbox (PRD M-06): "Keep published score" on a result that changed in
-- the mobile app after approval. As the old mobileDismissDrift did, the published
-- score and who approved it stay, and the mobile app's version as it is now
-- (points, stat count, last stat time) is recorded, so the same change is not
-- raised again. The first version (20260925000400) only stamped dismissed_at,
-- so the change came back on every refresh.
create or replace function public.dismiss_mobile_result(p_game_id uuid, p_source jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- security definer so it can write score_sources; the editor check is the gate and stays first.
  perform public.assert_event_editor(public.game_event_id(p_game_id));
  insert into public.score_sources (
    game_id, mobile_game_id, league_id, s1, s2, home_pts, away_pts, event_count,
    last_event_at, finished_at, method, dismissed_at
  ) values (
    p_game_id,
    p_source ->> 'mobile_game_id',
    p_source ->> 'league_id',
    (p_source ->> 's1')::integer,
    (p_source ->> 's2')::integer,
    (p_source ->> 'home_pts')::integer,
    (p_source ->> 'away_pts')::integer,
    (p_source ->> 'event_count')::integer,
    (p_source ->> 'last_event_at')::timestamptz,
    (p_source ->> 'finished_at')::timestamptz,
    coalesce(p_source ->> 'method', 'mobile'),
    now()
  )
  on conflict (game_id) do update set
    home_pts = excluded.home_pts,
    away_pts = excluded.away_pts,
    event_count = excluded.event_count,
    last_event_at = excluded.last_event_at,
    dismissed_at = now();
end;
$$;
