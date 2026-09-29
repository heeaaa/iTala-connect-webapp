-- CSI-02: the page's link version is checked under a division row lock.
-- Replacing a different league requires an explicit confirmation flag.
drop function public.set_division_mobile_link(uuid, text, text, text, jsonb);

create function public.set_division_mobile_link(
  p_division_id uuid,
  p_league_id text,
  p_league_name text,
  p_season text,
  p_teams jsonb,
  p_expected_league_id text,
  p_confirm_replace boolean
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  t jsonb;
  v_current text;
begin
  perform public.assert_event_editor(public.division_event_id(p_division_id));
  if nullif(btrim(coalesce(p_league_id, '')), '') is null then
    raise exception 'Choose a mobile league' using errcode = '22023';
  end if;
  perform 1 from public.divisions where id = p_division_id for update;
  select league_id into v_current from public.division_mobile_links where division_id = p_division_id;
  if v_current is distinct from p_expected_league_id then
    raise exception 'The division link changed. Refresh and review it.' using errcode = '23514';
  end if;
  if v_current is not null and v_current <> p_league_id and p_confirm_replace is distinct from true then
    raise exception 'Confirm replacement of the current mobile league' using errcode = '23514';
  end if;
  perform set_config('itala.link_source', 'wizard', true);
  insert into public.division_mobile_links (division_id, league_id, league_name, season, linked_by)
  values (p_division_id, p_league_id, coalesce(p_league_name, ''), nullif(p_season, ''), (select auth.uid()))
  on conflict (division_id) do update set
    league_id = excluded.league_id, league_name = excluded.league_name,
    season = excluded.season, linked_at = now(), linked_by = excluded.linked_by;
  delete from public.division_mobile_team_links where division_id = p_division_id;
  for t in select * from jsonb_array_elements(coalesce(p_teams, '[]'::jsonb)) loop
    insert into public.division_mobile_team_links (division_id, team_id, mobile_team_id)
    values (p_division_id, (t ->> 'team_id')::uuid, t ->> 'mobile_team_id');
  end loop;
  perform set_config('itala.link_source', '', true);
end;
$$;

revoke execute on function public.set_division_mobile_link(uuid, text, text, text, jsonb, text, boolean)
  from public, anon;
grant execute on function public.set_division_mobile_link(uuid, text, text, text, jsonb, text, boolean)
  to authenticated;

-- Admins may know a league is linked elsewhere, but not another owner's event details.
create function public.mobile_league_link_count(p_league_id text)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not public.is_active_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  select count(*)::integer into v_count from public.division_mobile_links
    where league_id = p_league_id;
  return v_count;
end;
$$;

revoke execute on function public.mobile_league_link_count(text) from public, anon;
grant execute on function public.mobile_league_link_count(text) to authenticated;
