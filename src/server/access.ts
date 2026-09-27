/**
 * Pure access decisions, shared by pages, layouts and Server Actions.
 * No I/O here so every branch is unit tested.
 */

export type AdminRole = 'superadmin' | 'admin';

export interface ProfileRow {
  id: string;
  display_name: string;
  role: AdminRole | null;
  disabled_at: string | null;
}

export type Access =
  | { kind: 'signed-out' }
  | { kind: 'no-access'; reason: 'no-profile' | 'no-role' | 'disabled' }
  | { kind: 'admin'; profile: ProfileRow & { role: AdminRole } };

export function resolveAccess(userId: string | null, profile: ProfileRow | null): Access {
  if (!userId) return { kind: 'signed-out' };
  if (!profile || profile.id !== userId) return { kind: 'no-access', reason: 'no-profile' };
  if (profile.disabled_at) return { kind: 'no-access', reason: 'disabled' };
  if (!profile.role) return { kind: 'no-access', reason: 'no-role' };
  return { kind: 'admin', profile: { ...profile, role: profile.role } };
}

/**
 * Where to send someone after sign-in. Only same-site admin paths are
 * allowed, so the login form cannot be used as an open redirect.
 */
export function safeNextPath(next: unknown): string {
  if (typeof next !== 'string') return '/admin';
  if (!next.startsWith('/admin')) return '/admin';
  if (next.startsWith('//') || next.includes('\\') || /[\r\n]/.test(next)) return '/admin';
  if (next.length > 1 && !/^\/admin(\/|\?|$)/.test(next)) return '/admin';
  return next;
}

export const NO_ACCESS_MESSAGES: Record<'no-profile' | 'no-role' | 'disabled', string> = {
  'no-profile': 'This account does not have access to iTala Connect.',
  'no-role': 'This account does not have access to iTala Connect. Ask a superadmin to give you access.',
  disabled: 'This account has been disabled. Contact a superadmin if you think this is a mistake.',
};

/** A-07 and A-10: one generic message for every credential failure. */
export const SIGN_IN_FAILED = 'Incorrect email or password.';

/** A-11: why a Google sign-in ended back on the login page. Never echoes provider text. */
export const GOOGLE_SIGN_IN_FAILED =
  "Google sign-in didn't work for this account. Only invited organisers can sign in: ask a superadmin to invite the email address of your Google account.";

export type LoginNotice = 'google' | 'no-profile' | 'no-role' | 'disabled';

export function loginNoticeMessage(key: unknown): string | undefined {
  if (key === 'google') return GOOGLE_SIGN_IN_FAILED;
  return key === 'no-profile' || key === 'no-role' || key === 'disabled' ? NO_ACCESS_MESSAGES[key] : undefined;
}
