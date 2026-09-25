import { describe, expect, it } from 'vitest';

import { resolveAccess, safeNextPath, type ProfileRow } from '@/server/access';

const uid = '00000000-0000-0000-0000-00000000000a';
const profile = (over: Partial<ProfileRow> = {}): ProfileRow => ({
  id: uid,
  display_name: 'Aroha',
  role: 'admin',
  disabled_at: null,
  ...over,
});

describe('resolveAccess (A-01 to A-03)', () => {
  it('signed out without verified claims', () => {
    expect(resolveAccess(null, profile())).toEqual({ kind: 'signed-out' });
  });

  it('no access without a profile (for example an anonymous auth user)', () => {
    expect(resolveAccess(uid, null)).toEqual({ kind: 'no-access', reason: 'no-profile' });
  });

  it('no access when the profile belongs to someone else', () => {
    expect(resolveAccess(uid, profile({ id: '00000000-0000-0000-0000-00000000000b' }))).toEqual({
      kind: 'no-access',
      reason: 'no-profile',
    });
  });

  it('no access without a role', () => {
    expect(resolveAccess(uid, profile({ role: null }))).toEqual({ kind: 'no-access', reason: 'no-role' });
  });

  it('disabled beats any role, including superadmin', () => {
    expect(resolveAccess(uid, profile({ role: 'superadmin', disabled_at: '2026-09-25T00:00:00Z' }))).toEqual({
      kind: 'no-access',
      reason: 'disabled',
    });
  });

  it.each(['admin', 'superadmin'] as const)('%s gets admin access with the role kept', (role) => {
    const access = resolveAccess(uid, profile({ role }));
    expect(access.kind).toBe('admin');
    expect(access.kind === 'admin' && access.profile.role).toBe(role);
  });
});

describe('safeNextPath (no open redirects)', () => {
  it.each([
    [undefined, '/admin'],
    [42, '/admin'],
    ['/admin', '/admin'],
    ['/admin/events/123', '/admin/events/123'],
    ['/admin?tab=results', '/admin?tab=results'],
    ['/administrator', '/admin'],
    ['/', '/admin'],
    ['https://evil.example', '/admin'],
    ['//evil.example/admin', '/admin'],
    ['/admin\\@evil.example', '/admin'],
    ['/admin\r\nSet-Cookie: x=1', '/admin'],
  ])('%j -> %s', (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });
});
