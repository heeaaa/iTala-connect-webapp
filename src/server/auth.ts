import 'server-only';

import { redirect } from 'next/navigation';
import { cache } from 'react';

import { createClient } from '@/lib/supabase/server';
import { resolveAccess, type Access, type ProfileRow } from './access';

/**
 * Verified access for the current request. Uses getClaims() (signature
 * checked), never getSession(). Cached per request.
 */
export const getAccess = cache(async (): Promise<Access> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  const userId = typeof sub === 'string' ? sub : null;
  if (!userId) return resolveAccess(null, null);

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, display_name, role, disabled_at')
    .eq('id', userId)
    .maybeSingle<ProfileRow>();

  return resolveAccess(userId, profile ?? null);
});

export type Admin = Extract<Access, { kind: 'admin' }>['profile'];

/** For pages and layouts: redirects when the visitor is not an active admin. */
export async function requireAdmin(nextPath = '/admin'): Promise<Admin> {
  const access = await getAccess();
  if (access.kind === 'signed-out') redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  if (access.kind === 'no-access') redirect(`/login?error=${access.reason}`);
  return access.profile;
}

export async function requireSuperadmin(): Promise<Admin> {
  const admin = await requireAdmin();
  if (admin.role !== 'superadmin') redirect('/admin');
  return admin;
}

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/** For Server Actions: returns an error result instead of redirecting. */
export async function authorizeAdmin(): Promise<ActionResult<Admin>> {
  const access = await getAccess();
  if (access.kind !== 'admin') return { ok: false, error: 'Please sign in again.' };
  return { ok: true, data: access.profile };
}

/** Event ownership check, same rule as the RLS helper (A-03, A-05). */
export async function canEditEvent(eventId: string): Promise<boolean> {
  const access = await getAccess();
  if (access.kind !== 'admin') return false;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('is_event_editor', { p_event_id: eventId });
  return !error && data === true;
}
