import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  authorize: vi.fn(),
  verifyOtp: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
  profile: null as unknown,
}));
// Next's redirect throws to stop the action; the fake does the same.
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));
vi.mock('@/server/auth', () => ({ authorizeAdmin: fake.authorize }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { verifyOtp: fake.verifyOtp, updateUser: fake.updateUser, signOut: fake.signOut },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: fake.profile }) }) }) }),
  }),
}));
import { changePassword, confirmSetupLink } from '@/server/actions/account';

const ID = '00000000-0000-4000-8000-000000000007';
const TOKEN = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8';
const LINK_FAILED = 'This link has expired or has already been used. Ask a superadmin for a new set-up link.';
const form = (values: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
};

beforeEach(() => {
  vi.clearAllMocks();
  fake.authorize.mockResolvedValue({ ok: true, data: { id: ID } });
  fake.verifyOtp.mockResolvedValue({ data: { user: { id: ID } }, error: null });
  fake.updateUser.mockResolvedValue({ data: {}, error: null });
  fake.profile = { id: ID, display_name: 'Sam', role: 'admin', disabled_at: null };
});

describe('confirmSetupLink (A-09)', () => {
  it('uses the token and takes an admin on to choose their password', async () => {
    await expect(confirmSetupLink({}, form({ token_hash: TOKEN, type: 'invite' }))).rejects.toThrow(
      'REDIRECT /admin/password?welcome=1',
    );
    expect(fake.verifyOtp).toHaveBeenCalledWith({ token_hash: TOKEN, type: 'invite' });
    await expect(confirmSetupLink({}, form({ token_hash: TOKEN, type: 'recovery' }))).rejects.toThrow('REDIRECT');
    expect(fake.verifyOtp).toHaveBeenLastCalledWith({ token_hash: TOKEN, type: 'recovery' });
  });

  it('says the link is used up or expired, without touching Auth for a malformed one', async () => {
    expect(await confirmSetupLink({}, form({ token_hash: TOKEN, type: 'signup' }))).toEqual({ error: LINK_FAILED });
    expect(await confirmSetupLink({}, form({ token_hash: 'short', type: 'invite' }))).toEqual({ error: LINK_FAILED });
    // Only Auth's own format (56 hex characters) is sent on.
    expect(await confirmSetupLink({}, form({ token_hash: TOKEN.toUpperCase(), type: 'invite' }))).toEqual({
      error: LINK_FAILED,
    });
    expect(await confirmSetupLink({}, form({ token_hash: `${TOKEN}0`, type: 'invite' }))).toEqual({
      error: LINK_FAILED,
    });
    expect(fake.verifyOtp).not.toHaveBeenCalled();
    fake.verifyOtp.mockResolvedValueOnce({ data: { user: null }, error: { code: 'otp_expired' } });
    expect(await confirmSetupLink({}, form({ token_hash: TOKEN, type: 'invite' }))).toEqual({ error: LINK_FAILED });
  });

  it('signs out again anyone the link lets in who has no admin access', async () => {
    fake.profile = { id: ID, display_name: 'Sam', role: 'admin', disabled_at: '2026-09-27T00:00:00Z' };
    expect(await confirmSetupLink({}, form({ token_hash: TOKEN, type: 'recovery' }))).toEqual({
      error: 'This account has been disabled. Contact a superadmin if you think this is a mistake.',
    });
    expect(fake.signOut).toHaveBeenCalled();
    fake.profile = { id: ID, display_name: 'Sam', role: null, disabled_at: null };
    expect(await confirmSetupLink({}, form({ token_hash: TOKEN, type: 'invite' }))).toEqual({
      error: 'This account does not have access to iTala Connect. Ask a superadmin to give you access.',
    });
    fake.profile = null;
    expect(await confirmSetupLink({}, form({ token_hash: TOKEN, type: 'invite' }))).toEqual({
      error: 'This account does not have access to iTala Connect.',
    });
    expect(fake.signOut).toHaveBeenCalledTimes(3);
  });
});

describe('changePassword (A-09)', () => {
  const pw = (password: string, confirm = password) => form({ password, confirm });

  it('saves a new password for the signed-in admin', async () => {
    expect(await changePassword({}, pw('correct horse battery'))).toEqual({ done: true });
    expect(fake.updateUser).toHaveBeenCalledWith({ password: 'correct horse battery' });
  });

  it('checks the length and that both match before asking Auth', async () => {
    expect(await changePassword({}, pw('short'))).toEqual({ error: 'Use at least 10 characters.' });
    expect(await changePassword({}, pw('correct horse battery', 'correct horse batterx'))).toEqual({
      error: 'The two passwords do not match.',
    });
    expect(await changePassword({}, pw('x'.repeat(201)))).toEqual({
      error: 'Keep the password under 200 characters.',
    });
    fake.authorize.mockResolvedValueOnce({ ok: false, error: 'Please sign in again.' });
    expect(await changePassword({}, pw('correct horse battery'))).toEqual({ error: 'Please sign in again.' });
    expect(fake.updateUser).not.toHaveBeenCalled();
  });

  it('explains what Auth refused in plain words, never its own text', async () => {
    const cases: [string | undefined, string][] = [
      ['same_password', 'Choose a password different from your current one.'],
      ['weak_password', 'Choose a longer or less common password.'],
      ['reauthentication_needed', 'For your security, sign out and in again, then choose your password.'],
      [undefined, 'Could not save the password. Please try again.'],
    ];
    for (const [code, message] of cases) {
      fake.updateUser.mockResolvedValueOnce({ data: {}, error: { code, message: 'internal text' } });
      expect(await changePassword({}, pw('correct horse battery'))).toEqual({ error: message });
    }
  });
});
