-- Link wizard (PRD M-03): link a division made by hand to a mobile league and
-- map its teams one to one. The link and its team map are replaced together.
-- Security invoker: the division's editor check and ordinary RLS apply; the
-- team map's own checks (team in this division, one mobile team per division
-- team) still hold.
create function public.set_division_mobile_link(
  p_division_id uuid,
  p_league_id text,
  p_league_name text,
  p_season text,
  p_teams jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  t jsonb;
begin
  perform public.assert_event_editor(public.division_event_id(p_division_id));
  if nullif(btrim(coalesce(p_league_id, '')), '') is null then
    raise exception 'Choose a mobile league' using errcode = '22023';
  end if;
  -- Tells the audit trigger this is the wizard, not an import.
  perform set_config('itala.link_source', 'wizard', true);
  insert into public.division_mobile_links (division_id, league_id, league_name, season, linked_by)
  values (p_division_id, p_league_id, coalesce(p_league_name, ''), nullif(p_season, ''), (select auth.uid()))
  on conflict (division_id) do update set
    league_id = excluded.league_id,
    league_name = excluded.league_name,
    season = excluded.season,
    linked_at = now(),
    linked_by = excluded.linked_by;
  delete from public.division_mobile_team_links where division_id = p_division_id;
  for t in select * from jsonb_array_elements(coalesce(p_teams, '[]'::jsonb)) loop
    insert into public.division_mobile_team_links (division_id, team_id, mobile_team_id)
    values (p_division_id, (t ->> 'team_id')::uuid, t ->> 'mobile_team_id');
  end loop;
  perform set_config('itala.link_source', '', true);
end;
$$;

revoke execute on function public.set_division_mobile_link(uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.set_division_mobile_link(uuid, text, text, text, jsonb) to authenticated;

-- Audit (X-09): a link made in the wizard (new or changed) is recorded as such;
-- an import keeps its own entry, as before.
create or replace function public.audit_mobile_import() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
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

drop trigger audit_mobile_import on public.division_mobile_links;
create trigger audit_mobile_import after insert or update on public.division_mobile_links
for each row execute function public.audit_mobile_import();
