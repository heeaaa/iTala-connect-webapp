import type * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The helpers read the signed-in user (getClaims) and their profile; both are faked here.
const fake = vi.hoisted(() => ({ sub: null as string | null, profile: null as unknown }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('react', async (original) => ({ ...(await original<typeof React>()), cache: <T>(fn: T) => fn }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getClaims: async () => ({ data: fake.sub ? { claims: { sub: fake.sub } } : null }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: fake.profile }) }) }) }),
  }),
}));
import { authorizeSuperadmin } from '@/server/auth';

const ID = '00000000-0000-4000-8000-000000000001';
const profile = (role: string | null, disabled_at: string | null = null) => ({
  id: ID,
  display_name: 'Sam',
  role,
  disabled_at,
});

beforeEach(() => {
  fake.sub = ID;
});

describe('authorizeSuperadmin (settings and admins actions)', () => {
  it('lets an active superadmin through', async () => {
    fake.profile = profile('superadmin');
    expect(await authorizeSuperadmin()).toMatchObject({ ok: true, data: { id: ID, role: 'superadmin' } });
  });

  it('refuses an admin, a disabled superadmin, an account with no role and a signed-out visitor', async () => {
    fake.profile = profile('admin');
    expect(await authorizeSuperadmin()).toEqual({ ok: false, error: 'Only a superadmin can do this.' });
    fake.profile = profile('superadmin', '2026-09-27T00:00:00Z');
    expect(await authorizeSuperadmin()).toEqual({ ok: false, error: 'Please sign in again.' });
    fake.profile = profile(null);
    expect(await authorizeSuperadmin()).toEqual({ ok: false, error: 'Please sign in again.' });
    fake.sub = null;
    expect(await authorizeSuperadmin()).toEqual({ ok: false, error: 'Please sign in again.' });
  });
});
