-- Firebase import, images (MIGRATION_PLAN.md 12.1 step 4, Phase 7c).
--
-- The import uploads each old image to the images bucket first (the same
-- folders and types as an upload in the editor), then sets the rows here.
-- Only the migration import may run these (security invoker, refused for any
-- other role, granted to service_role only).

-- An imported event's logo and sponsors, set together. Returns the files the
-- event no longer uses, for the import to remove from the bucket.
create function public.set_legacy_event_images(p_event_id uuid, p_logo_path text, p_sponsors jsonb)
returns text[]
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_old text[];
  v_new text[];
begin
  if not public.is_privileged_role() then
    raise exception 'Only the migration import can set imported images' using errcode = '42501';
  end if;
  if not exists (select 1 from public.events e where e.id = p_event_id and e.legacy_firebase_id is not null) then
    raise exception 'Not an imported event' using errcode = '22023';
  end if;
  select coalesce(array_agg(o.path), '{}') into v_old from (
    select e.logo_path as path from public.events e where e.id = p_event_id and e.logo_path is not null
    union all
    select s.image_path from public.event_sponsors s where s.event_id = p_event_id
  ) o;
  v_new := array_remove(array[p_logo_path], null)
    || array(select x ->> 'image_path' from jsonb_array_elements(coalesce(p_sponsors, '[]'::jsonb)) x);

  update public.events set logo_path = p_logo_path where id = p_event_id;
  delete from public.event_sponsors where event_id = p_event_id;
  insert into public.event_sponsors (event_id, tier, image_path, sort_order)
  select p_event_id, x ->> 'tier', x ->> 'image_path', (x ->> 'sort_order')::int
  from jsonb_array_elements(coalesce(p_sponsors, '[]'::jsonb)) x;

  return array(select d.p from (select unnest(v_old) as p except select unnest(v_new)) d order by d.p);
end;
$$;

revoke execute on function public.set_legacy_event_images(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.set_legacy_event_images(uuid, text, jsonb) to service_role;

-- The platform sponsors from the old database, only when iTala Connect has
-- none (ones set here are never replaced). Returns whether they were set.
create function public.set_legacy_platform_sponsors(p_sponsors jsonb)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.is_privileged_role() then
    raise exception 'Only the migration import can set imported images' using errcode = '42501';
  end if;
  -- One import at a time decides whether the list is empty.
  lock table public.platform_sponsors in share row exclusive mode;
  if exists (select 1 from public.platform_sponsors) then
    return false;
  end if;
  insert into public.platform_sponsors (tier, image_path, sort_order)
  select x ->> 'tier', x ->> 'image_path', (x ->> 'sort_order')::int
  from jsonb_array_elements(coalesce(p_sponsors, '[]'::jsonb)) x;
  return true;
end;
$$;

revoke execute on function public.set_legacy_platform_sponsors(jsonb) from public, anon, authenticated;
grant execute on function public.set_legacy_platform_sponsors(jsonb) to service_role;
