-- Import runs as the signed-in organiser, with ordinary table RLS intact.
create function public.audit_mobile_import() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_log(actor_id, action, event_id, detail)
  select auth.uid(), 'event.mobile_import', d.event_id,
    jsonb_build_object('league_id', new.league_id, 'message', 'Imported from iTala mobile league ' || new.league_name)
  from public.divisions d where d.id = new.division_id;
  return null;
end; $$;
create trigger audit_mobile_import after insert on public.division_mobile_links
for each row execute function public.audit_mobile_import();

create function public.create_draft_event(p_name text, p_timezone text, p_rules text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare result uuid;
begin
  if not public.is_active_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  if nullif(btrim(p_name), '') is null then raise exception 'Event name is required' using errcode = '22023'; end if;
  insert into public.events(owner_id, name, timezone, rules_html)
  values(auth.uid(), btrim(p_name), p_timezone,
    coalesce(nullif((select default_rules_html from public.platform_settings where id), ''), p_rules, ''))
  returning id into result;
  return result;
end; $$;

create function public.import_mobile_league(p_event_name text, p_division_name text, p_timezone text,
  p_rules text, p_league jsonb, p_teams jsonb, p_allow_duplicate boolean default false)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare event_id uuid; division_id uuid; team_id uuid; t jsonb; p jsonb; ti integer := 0; pi integer;
begin
  if not public.is_active_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  if nullif(p_league->>'id', '') is null or nullif(p_league->>'name', '') is null
    or nullif(btrim(p_division_name), '') is null or jsonb_typeof(p_teams) is distinct from 'array'
    or jsonb_array_length(p_teams) > 200 then
    raise exception 'Invalid league import' using errcode = '22023';
  end if;
  -- Serialise duplicate checks, including simultaneous tabs for the same league.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_league->>'id', 0));
  if not coalesce(p_allow_duplicate, false) and exists (
    select 1 from public.division_mobile_links l where l.league_id = p_league->>'id'
  ) then raise exception 'This league is already linked. Confirm Create anyway.' using errcode = '23505'; end if;
  event_id := public.create_draft_event(p_event_name, p_timezone, p_rules);
  insert into public.divisions(event_id, name) values(event_id, btrim(p_division_name)) returning id into division_id;
  insert into public.division_mobile_links(division_id, league_id, league_name, season, linked_by)
  values(division_id, p_league->>'id', p_league->>'name', p_league->>'season', auth.uid());
  for t in select value from jsonb_array_elements(p_teams) loop
    if nullif(t->>'id', '') is null or nullif(btrim(t->>'name'), '') is null
      or jsonb_typeof(t->'players') is distinct from 'array' or jsonb_array_length(t->'players') > 200 then
      raise exception 'Invalid team import' using errcode = '22023';
    end if;
    insert into public.teams(division_id, name, coach, sort_order)
    values(division_id, t->>'name', coalesce(t->>'coach', ''), ti) returning id into team_id;
    insert into public.division_mobile_team_links(division_id, team_id, mobile_team_id) values(division_id, team_id, t->>'id');
    pi := 0;
    for p in select value from jsonb_array_elements(t->'players') loop
      if nullif(p->>'id', '') is null or nullif(btrim(p->>'name'), '') is null then
        raise exception 'Invalid player import' using errcode = '22023';
      end if;
      insert into public.players(team_id, name, number, sort_order, mobile_player_id)
      values(team_id, p->>'name', coalesce(p->>'number', ''), pi, p->>'id');
      pi := pi + 1;
    end loop;
    ti := ti + 1;
  end loop;
  return event_id;
end; $$;
revoke all on function public.audit_mobile_import() from public, anon, authenticated;
revoke all on function public.create_draft_event(text,text,text) from public, anon;
revoke all on function public.import_mobile_league(text,text,text,text,jsonb,jsonb,boolean) from public, anon;
grant execute on function public.create_draft_event(text,text,text) to authenticated;
grant execute on function public.import_mobile_league(text,text,text,text,jsonb,jsonb,boolean) to authenticated;
