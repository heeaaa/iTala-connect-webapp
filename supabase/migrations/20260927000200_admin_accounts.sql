-- Admins screen (PRD A-09): the accounts a superadmin manages. Emails and
-- sign-in state live in auth.users, which the API never exposes, so this
-- returns only what the screen shows, and only to an active superadmin.
-- Anonymous auth users have no profile, so they never appear.
create function public.list_admin_accounts()
returns table (
  id uuid,
  display_name text,
  email text,
  role public.app_role,
  disabled_at timestamptz,
  signed_in boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_superadmin() then
    raise exception 'Only a superadmin can list accounts' using errcode = '42501';
  end if;
  return query
    select p.id, p.display_name, u.email::text, p.role, p.disabled_at, u.last_sign_in_at is not null
    from public.profiles p
    join auth.users u on u.id = p.id
    order by lower(p.display_name), u.email;
end;
$$;

revoke execute on function public.list_admin_accounts() from public, anon;
grant execute on function public.list_admin_accounts() to authenticated;

-- ---------------------------------------------------------------------------
-- Audit (PRD X-09): account changes are recorded with who and when, like
-- event and score changes. Security definer: the only writers of audit_log.
-- ---------------------------------------------------------------------------
create function public.audit_profiles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role is distinct from old.role then
    insert into public.audit_log (actor_id, action, detail)
    values ((select auth.uid()), 'account.role',
            jsonb_build_object('account', new.id, 'from', old.role, 'to', new.role));
  end if;
  if new.disabled_at is distinct from old.disabled_at then
    insert into public.audit_log (actor_id, action, detail)
    values ((select auth.uid()),
            case when new.disabled_at is null then 'account.enable' else 'account.disable' end,
            jsonb_build_object('account', new.id));
  end if;
  return null;
end;
$$;

create trigger audit_profiles
after update on public.profiles
for each row execute function public.audit_profiles();

revoke execute on function public.audit_profiles() from public, anon, authenticated;

-- A set-up link changes nothing in the database, but it lets whoever holds it
-- sign in as that account, so making one is recorded too (who, for whom, which kind).
create function public.record_account_link(p_account uuid, p_kind text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_superadmin() then
    raise exception 'Only a superadmin can make set-up links' using errcode = '42501';
  end if;
  if p_kind not in ('invite', 'recovery') then
    raise exception 'Unknown link kind' using errcode = '22023';
  end if;
  insert into public.audit_log (actor_id, action, detail)
  values ((select auth.uid()), 'account.link', jsonb_build_object('account', p_account, 'kind', p_kind));
end;
$$;

revoke execute on function public.record_account_link(uuid, text) from public, anon;
grant execute on function public.record_account_link(uuid, text) to authenticated;
