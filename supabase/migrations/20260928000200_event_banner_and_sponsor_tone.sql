-- Event presentation: optional responsive banner and per-logo sponsor backing.
-- Existing rows start with a light plaque; organisers can choose a dark one
-- for white or other light logos.

alter table public.events add column banner_path text;
alter table public.events add column banner_focus text not null default 'center'
  check (banner_focus in ('left', 'center', 'right'));
alter table public.event_sponsors add column display_mode text not null default 'light'
  check (display_mode in ('light', 'dark'));
alter table public.platform_sponsors add column display_mode text not null default 'light'
  check (display_mode in ('light', 'dark'));

alter table public.events
  add constraint events_banner_path_own_folder
  check (banner_path is null or banner_path ~ ('^events/' || id::text || '/[A-Za-z0-9_-]+\.(png|jpg|webp)$'));

-- Replacing a major sponsor must keep its chosen plaque mode.
create or replace function public.set_major_sponsor(p_event_id uuid, p_path text default null)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_old text;
  v_mode text;
begin
  perform public.assert_event_editor(p_event_id);
  perform 1 from public.events e where e.id = p_event_id for update;
  select s.image_path, s.display_mode into v_old, v_mode
    from public.event_sponsors s where s.event_id = p_event_id and s.tier = 'major';
  delete from public.event_sponsors where event_id = p_event_id and tier = 'major';
  if p_path is not null then
    insert into public.event_sponsors (event_id, tier, image_path, display_mode)
      values (p_event_id, 'major', p_path, coalesce(v_mode, 'light'));
  end if;
  return v_old;
end;
$$;

create function public.set_event_banner(p_event_id uuid, p_path text default null, p_version timestamptz default null)
returns table (old_path text, version timestamptz)
language plpgsql
set search_path = ''
as $$
declare
  v_before timestamptz;
  v_after timestamptz;
begin
  perform public.assert_event_editor(p_event_id);
  select e.banner_path, e.updated_at into old_path, v_before
    from public.events e where e.id = p_event_id for update;
  update public.events set banner_path = p_path where id = p_event_id returning updated_at into v_after;
  version := case when p_version is not null and p_version = v_before then v_after end;
  return next;
end;
$$;

revoke execute on function public.set_event_banner(uuid, text, timestamptz) from public, anon;
grant execute on function public.set_event_banner(uuid, text, timestamptz) to authenticated;

create function public.set_event_banner_focus(p_event_id uuid, p_focus text, p_version timestamptz default null)
returns timestamptz
language plpgsql
set search_path = ''
as $$
declare
  v_before timestamptz;
  v_after timestamptz;
begin
  perform public.assert_event_editor(p_event_id);
  select e.updated_at into v_before from public.events e where e.id = p_event_id for update;
  update public.events set banner_focus = p_focus where id = p_event_id and banner_path is not null
    returning updated_at into v_after;
  if v_after is null then raise exception 'Event banner is missing'; end if;
  return case when p_version is not null and p_version = v_before then v_after end;
end;
$$;

revoke execute on function public.set_event_banner_focus(uuid, text, timestamptz) from public, anon;
grant execute on function public.set_event_banner_focus(uuid, text, timestamptz) to authenticated;
