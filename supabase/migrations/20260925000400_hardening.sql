-- Hardening after the phase 1 independent review (25/09/2026).
-- Each block names the finding it closes; pgTAP cases live in
-- supabase/tests/004_hardening.sql.

-- ---------------------------------------------------------------------------
-- Shared: is the current statement run by a privileged role (migration
-- scripts with the secret key, the dashboard, or postgres)?
-- security invoker on purpose: current_user must be the caller's role.
-- ---------------------------------------------------------------------------
create function public.is_privileged_role()
returns boolean
language sql
stable
set search_path = ''
as $$
  select current_user in ('postgres', 'supabase_admin', 'service_role')
    or coalesce(auth.role(), '') = 'service_role';
$$;

-- ---------------------------------------------------------------------------
-- Finding 2: parent keys are immutable, so a row can never carry stale
-- event ids into RLS decisions (scores, visibility) after a move.
-- Players may move between teams of the same event only.
-- ---------------------------------------------------------------------------
create function public.guard_immutable_parent()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  col text := tg_argv[0];
begin
  if to_jsonb(new) -> col is distinct from to_jsonb(old) -> col then
    raise exception '% cannot change on %', col, tg_table_name using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger games_event_immutable before update of event_id on public.games
for each row execute function public.guard_immutable_parent('event_id');
create trigger divisions_event_immutable before update of event_id on public.divisions
for each row execute function public.guard_immutable_parent('event_id');
create trigger teams_division_immutable before update of division_id on public.teams
for each row execute function public.guard_immutable_parent('division_id');
create trigger event_sponsors_event_immutable before update of event_id on public.event_sponsors
for each row execute function public.guard_immutable_parent('event_id');
create trigger game_scores_game_immutable before update of game_id on public.game_scores
for each row execute function public.guard_immutable_parent('game_id');
create trigger score_sources_game_immutable before update of game_id on public.score_sources
for each row execute function public.guard_immutable_parent('game_id');
create trigger mobile_links_division_immutable before update of division_id on public.division_mobile_links
for each row execute function public.guard_immutable_parent('division_id');

create function public.players_same_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.team_id is distinct from old.team_id
     and public.team_event_id(new.team_id) is distinct from public.team_event_id(old.team_id) then
    raise exception 'A player can only move to a team in the same event' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger players_same_event before update of team_id on public.players
for each row execute function public.players_same_event();

-- ---------------------------------------------------------------------------
-- Finding 4: legacy_* and *_legacy columns are written only by the
-- migration import (privileged), so nobody can pre-claim an old Firebase id.
-- ---------------------------------------------------------------------------
create function public.guard_legacy_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_privileged_role() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if exists (
      select 1 from jsonb_each(to_jsonb(new)) n
      where (n.key like 'legacy\_%' or n.key like '%\_legacy') and n.value <> 'null'::jsonb
    ) then
      raise exception 'Legacy columns are set by the migration import only' using errcode = '42501';
    end if;
  elsif exists (
    select 1 from jsonb_each(to_jsonb(new)) n
    join jsonb_each(to_jsonb(old)) o using (key)
    where (n.key like 'legacy\_%' or n.key like '%\_legacy') and n.value is distinct from o.value
  ) then
    raise exception 'Legacy columns are set by the migration import only' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger events_legacy_guard before insert or update on public.events
for each row execute function public.guard_legacy_columns();
create trigger divisions_legacy_guard before insert or update on public.divisions
for each row execute function public.guard_legacy_columns();
create trigger teams_legacy_guard before insert or update on public.teams
for each row execute function public.guard_legacy_columns();
create trigger games_legacy_guard before insert or update on public.games
for each row execute function public.guard_legacy_columns();
create trigger mobile_links_legacy_guard before insert or update on public.division_mobile_links
for each row execute function public.guard_legacy_columns();

-- ---------------------------------------------------------------------------
-- Finding 5: publishing happens only through publish_event, so its score
-- check (E-62) cannot be skipped. publish_event marks the transaction;
-- API clients cannot set custom settings themselves.
-- ---------------------------------------------------------------------------
create function public.guard_event_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_privileged_role()
     or current_setting('itala.publishing_event', true) = new.id::text then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'draft' or new.published_at is not null then
      raise exception 'New events start as drafts; use Publish' using errcode = '42501';
    end if;
  elsif new.status is distinct from old.status or new.published_at is distinct from old.published_at then
    raise exception 'Publish status changes only through Publish' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger events_status_guard before insert or update on public.events
for each row execute function public.guard_event_status();

-- Finding 3: lock the event's games before counting scores, so a score
-- written concurrently either lands before the count (and blocks the
-- publish) or fails on its foreign key after the rebuild. It can no longer
-- be deleted silently.
create or replace function public.publish_event(p_event_id uuid, p_games jsonb, p_clear_scores boolean default false)
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
  perform 1 from public.games g where g.event_id = p_event_id for update;

  select count(*) into v_scored
  from public.game_scores s
  where s.event_id = p_event_id and (s.s1 is not null or s.s2 is not null);

  if v_scored > 0 and not coalesce(p_clear_scores, false) then
    raise exception 'This event has % recorded score(s). Confirm clearing them to re-publish.', v_scored
      using errcode = 'P0001', hint = 'scores_exist';
  end if;

  delete from public.games g where g.event_id = p_event_id;
  v_count := public.insert_games_json_invoker(p_event_id, p_games);

  perform set_config('itala.publishing_event', p_event_id::text, true);
  update public.events
     set status = 'published', published_at = clock_timestamp()
   where id = p_event_id;
  perform set_config('itala.publishing_event', '', true);

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Finding 1: score provenance is written only by approve/dismiss functions,
-- which stamp who and when from the session. Editors keep delete (a manual
-- score edit clears provenance) and read.
-- ---------------------------------------------------------------------------
revoke insert, update on public.score_sources from anon, authenticated;

create or replace function public.approve_mobile_result(p_game_id uuid, p_s1 integer, p_s2 integer, p_source jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- security definer so it can write score_sources; the editor check below
  -- is therefore the gate and must stay first.
  perform public.assert_event_editor(public.game_event_id(p_game_id));
  if p_s1 is null or p_s2 is null or p_s1 < 0 or p_s2 < 0 then
    raise exception 'An approved result needs two scores of 0 or more' using errcode = '22023';
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
    approved_by_legacy = null,
    method = excluded.method,
    dismissed_at = null;
end;
$$;

-- Dismiss a mobile result (results inbox, phase 6). Keeps any score.
create function public.dismiss_mobile_result(p_game_id uuid, p_source jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_event_editor(public.game_event_id(p_game_id));
  insert into public.score_sources (game_id, mobile_game_id, league_id, s1, s2, finished_at, method, dismissed_at)
  values (
    p_game_id,
    p_source ->> 'mobile_game_id',
    p_source ->> 'league_id',
    (p_source ->> 's1')::integer,
    (p_source ->> 's2')::integer,
    (p_source ->> 'finished_at')::timestamptz,
    coalesce(p_source ->> 'method', 'mobile'),
    now()
  )
  on conflict (game_id) do update set dismissed_at = now();
end;
$$;

revoke execute on function public.approve_mobile_result(uuid, integer, integer, jsonb) from public, anon;
grant execute on function public.approve_mobile_result(uuid, integer, integer, jsonb) to authenticated;
revoke execute on function public.dismiss_mobile_result(uuid, jsonb) from public, anon;
grant execute on function public.dismiss_mobile_result(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Finding 6: helpers that anonymous visitors never need are not callable
-- by them. (can_read_event, is_event_editor, division_event_id and
-- team_event_id stay callable because anon SELECT policies use them.)
-- ---------------------------------------------------------------------------
revoke execute on function public.game_event_id(uuid) from public, anon;
grant execute on function public.game_event_id(uuid) to authenticated;
revoke execute on function public.assert_event_editor(uuid) from public, anon;
grant execute on function public.assert_event_editor(uuid) to authenticated;
revoke execute on function public.can_write_image_path(text) from public, anon;
grant execute on function public.can_write_image_path(text) to authenticated;

-- Trigger functions are never called through the API.
revoke execute on function public.events_validate() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.guard_immutable_parent() from public, anon, authenticated;
revoke execute on function public.players_same_event() from public, anon, authenticated;
revoke execute on function public.guard_legacy_columns() from public, anon, authenticated;
revoke execute on function public.guard_event_status() from public, anon, authenticated;
