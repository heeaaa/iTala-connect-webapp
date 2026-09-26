'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { serverEnv } from '@/env';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { authorizeSuperadmin, type ActionResult } from '@/server/auth';

/** A one-time link the superadmin sends to the person themselves (no email service). */
export type SetupLink = { name: string; email: string; link: string };

type LinkType = 'invite' | 'recovery';

const accountSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name.').max(120, 'Keep the name to 120 characters.'),
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address.').max(254)),
  role: z.enum(['admin', 'superadmin']),
});
export type NewAccountInput = z.input<typeof accountSchema>;

const NOT_CREATED = 'Could not create the account. Please try again.';
const EXISTS = 'An account with this email already exists. Use New set-up link on its row.';
const NO_LINK = 'Could not make a set-up link. Please try again.';
const GONE = 'That account no longer exists. Refresh the page.';

/** Where the link lands: a page that only uses the token when the person presses Continue. */
function setupUrl(type: LinkType, hashedToken: string) {
  const url = new URL('/auth/confirm', serverEnv().NEXT_PUBLIC_SITE_URL);
  url.searchParams.set('token_hash', hashedToken);
  url.searchParams.set('type', type);
  return url.toString();
}

/** The secret-key client, or null where it is not configured (so the action says so, not crashes). */
function secretClient() {
  try {
    return createAdminClient();
  } catch {
    return null;
  }
}

/** Who made a link for whom goes in the audit log: whoever holds a link can sign in as that account. */
async function recordLink(db: Awaited<ReturnType<typeof createClient>>, account: string, kind: LinkType) {
  const { error } = await db.rpc('record_account_link', { p_account: account, p_kind: kind });
  return !error;
}

const alreadyExists = (error: { code?: string; status?: number; message?: string }) =>
  error.code === 'email_exists' ||
  error.code === 'user_already_exists' ||
  /already been registered/i.test(error.message ?? '');

/**
 * Create an admin or superadmin account (PRD A-09). Auth creates the user and
 * a one-time invite token without sending any email; the role is then set
 * through the superadmin's own session, so RLS and the profile guard apply.
 * An email that already has an account is refused first: Auth would otherwise
 * hand back that account (one never set up) with a new token. If the role
 * cannot be set, the user this call created is removed again.
 */
export async function createAdminAccount(input: NewAccountInput): Promise<ActionResult<SetupLink>> {
  const auth = await authorizeSuperadmin();
  if (!auth.ok) return auth;
  const parsed = accountSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? NOT_CREATED };
  const { name, email, role } = parsed.data;
  const admin = secretClient();
  if (!admin) return { ok: false, error: 'Account management is not set up on this server.' };

  const db = await createClient();
  const { data: accounts, error: listError } = await db.rpc('list_admin_accounts');
  if (listError) return { ok: false, error: NOT_CREATED };
  if (accounts.some((a) => a.email?.toLowerCase() === email)) return { ok: false, error: EXISTS };

  const { data, error } = await admin.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { data: { display_name: name } },
  });
  if (error) {
    return {
      ok: false,
      error: alreadyExists(error) ? EXISTS : NOT_CREATED,
    };
  }
  const token = data.properties?.hashed_token;
  if (!data.user || !token) return { ok: false, error: NOT_CREATED };

  const { data: rows, error: roleError } = await db
    .from('profiles')
    .update({ role, display_name: name })
    .eq('id', data.user.id)
    .select('id');
  if (roleError || !rows?.length) {
    await admin.auth.admin.deleteUser(data.user.id);
    return { ok: false, error: NOT_CREATED };
  }
  revalidatePath('/admin/admins');
  // The link is only handed over once it is on record (X-09).
  if (!(await recordLink(db, data.user.id, 'invite')))
    return {
      ok: false,
      error: 'The account was created, but its link could not be made. Use New set-up link on its row.',
    };
  return { ok: true, data: { name, email, link: setupUrl('invite', token) } };
}

/**
 * A fresh set-up link for an existing account: the invite again if they never
 * finished setting up, otherwise a link to choose a new password (a forgotten
 * password, since there is no email service to send resets).
 */
export async function newSetupLink(userId: string): Promise<ActionResult<SetupLink>> {
  const auth = await authorizeSuperadmin();
  if (!auth.ok) return auth;
  const id = z.uuid().safeParse(userId);
  if (!id.success) return { ok: false, error: GONE };
  if (id.data === auth.data.id) return { ok: false, error: 'This is your own account. Use Change password instead.' };

  const db = await createClient();
  const { data: profile } = await db
    .from('profiles')
    .select('display_name, role, disabled_at')
    .eq('id', id.data)
    .maybeSingle();
  if (!profile) return { ok: false, error: GONE };
  if (profile.disabled_at) return { ok: false, error: 'Enable the account before making a set-up link.' };
  if (!profile.role) return { ok: false, error: 'Give the account a role before making a set-up link.' };

  const admin = secretClient();
  if (!admin) return { ok: false, error: 'Account management is not set up on this server.' };
  const { data: found, error: findError } = await admin.auth.admin.getUserById(id.data);
  const email = found?.user?.email;
  if (findError || !email) return { ok: false, error: GONE };
  const type: LinkType = found.user.email_confirmed_at ? 'recovery' : 'invite';
  const { data, error } =
    type === 'invite'
      ? await admin.auth.admin.generateLink({ type: 'invite', email })
      : await admin.auth.admin.generateLink({ type: 'recovery', email });
  const token = data?.properties?.hashed_token;
  if (error || !token || !(await recordLink(db, id.data, type))) return { ok: false, error: NO_LINK };
  return { ok: true, data: { name: profile.display_name, email, link: setupUrl(type, token) } };
}

const roleSchema = z.object({ userId: z.uuid(), role: z.enum(['admin', 'superadmin']) });

/** Change another account's role (PRD A-09). Nobody changes their own (the profile guard agrees). */
export async function setAdminRole(input: z.input<typeof roleSchema>): Promise<ActionResult> {
  const auth = await authorizeSuperadmin();
  if (!auth.ok) return auth;
  const parsed = roleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: GONE };
  if (parsed.data.userId === auth.data.id) return { ok: false, error: 'You cannot change your own role.' };
  const db = await createClient();
  const { data, error } = await db
    .from('profiles')
    .update({ role: parsed.data.role })
    .eq('id', parsed.data.userId)
    .select('id');
  if (error) return { ok: false, error: 'Could not change the role. Please try again.' };
  if (!data?.length) return { ok: false, error: GONE };
  revalidatePath('/admin/admins');
  return { ok: true, data: undefined };
}

const disableSchema = z.object({ userId: z.uuid(), disabled: z.boolean() });

/**
 * Disable or enable another account (PRD A-09). A disabled account keeps its
 * sign-in but has no admin rights anywhere (pages, actions, RLS, storage), and
 * its events stay as they are.
 */
export async function setAdminDisabled(input: z.input<typeof disableSchema>): Promise<ActionResult> {
  const auth = await authorizeSuperadmin();
  if (!auth.ok) return auth;
  const parsed = disableSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: GONE };
  if (parsed.data.userId === auth.data.id) return { ok: false, error: 'You cannot disable your own account.' };
  const db = await createClient();
  const { data, error } = await db
    .from('profiles')
    .update({ disabled_at: parsed.data.disabled ? new Date().toISOString() : null })
    .eq('id', parsed.data.userId)
    .select('id');
  if (error) return { ok: false, error: 'Could not change the account. Please try again.' };
  if (!data?.length) return { ok: false, error: GONE };
  revalidatePath('/admin/admins');
  return { ok: true, data: undefined };
}
