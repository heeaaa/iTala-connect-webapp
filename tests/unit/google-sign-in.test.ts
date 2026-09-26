import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  oauth: vi.fn(),
  exchange: vi.fn(),
  profile: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/env', () => ({
  serverEnv: () => ({
    NEXT_PUBLIC_SITE_URL: 'https://connect.example.nz',
    NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key_value',
  }),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { signInWithOAuth: fake.oauth, exchangeCodeForSession: fake.exchange, signOut: fake.signOut },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: fake.profile }) }) }),
  }),
}));
import { GOOGLE_SIGN_IN_FAILED, loginNoticeMessage, NO_ACCESS_MESSAGES } from '@/server/access';
import { googleSignInEnabled } from '@/server/auth-providers';
import { GET as start } from '@/app/auth/google/route';
import { GET as callback } from '@/app/auth/callback/route';

const settings = (body: unknown, ok = true) => vi.fn().mockResolvedValue({ ok, json: async () => body } as Response);
const request = (path: string) => new NextRequest(new URL(path, 'https://connect.example.nz'));
const location = (response: Response) => response.headers.get('location');
const user = { id: '00000000-0000-4000-8000-000000000001' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', settings({ external: { google: true } }));
  fake.oauth.mockResolvedValue({
    data: { url: 'https://project.supabase.co/auth/v1/authorize?provider=google' },
    error: null,
  });
  fake.exchange.mockResolvedValue({ data: { user }, error: null });
  fake.profile.mockResolvedValue({ data: { id: user.id, display_name: 'Aroha', role: 'admin', disabled_at: null } });
});
afterEach(() => vi.unstubAllGlobals());

describe('googleSignInEnabled', () => {
  it('reads the public Auth settings with the publishable key', async () => {
    expect(await googleSignInEnabled()).toBe(true);
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(String(url)).toBe('https://project.supabase.co/auth/v1/settings');
    expect(init?.headers).toEqual({ apikey: 'sb_publishable_test_key_value' });
  });
  it('hides Google when it is off, the response is odd, or Auth cannot be reached', async () => {
    vi.stubGlobal('fetch', settings({ external: { google: false } }));
    expect(await googleSignInEnabled()).toBe(false);
    vi.stubGlobal('fetch', settings({ external: { google: 'yes' } }));
    expect(await googleSignInEnabled()).toBe(false);
    vi.stubGlobal('fetch', settings({}, false));
    expect(await googleSignInEnabled()).toBe(false);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await googleSignInEnabled()).toBe(false);
  });
});

describe('login notices', () => {
  it('maps only known keys to fixed messages', () => {
    expect(loginNoticeMessage('google')).toBe(GOOGLE_SIGN_IN_FAILED);
    expect(loginNoticeMessage('no-role')).toBe(NO_ACCESS_MESSAGES['no-role']);
    expect(loginNoticeMessage('<script>')).toBeUndefined();
    expect(loginNoticeMessage(undefined)).toBeUndefined();
  });
});

describe('/auth/google', () => {
  it('starts the Google flow with a callback on the configured site, keeping a safe next path', async () => {
    const response = await start(request('/auth/google?next=/admin/events/abc'));
    expect(location(response)).toBe('https://project.supabase.co/auth/v1/authorize?provider=google');
    expect(fake.oauth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: 'https://connect.example.nz/auth/callback?next=%2Fadmin%2Fevents%2Fabc',
        skipBrowserRedirect: true,
      },
    });
  });
  it('never forwards an off-site next path', async () => {
    await start(request('/auth/google?next=//evil.example/admin'));
    expect(fake.oauth.mock.calls[0]![0].options.redirectTo).toBe(
      'https://connect.example.nz/auth/callback?next=%2Fadmin',
    );
  });
  it('goes back to sign in when Google is off or the flow cannot start', async () => {
    vi.stubGlobal('fetch', settings({ external: { google: false } }));
    expect(location(await start(request('/auth/google')))).toBe(
      'https://connect.example.nz/login?error=google&next=%2Fadmin',
    );
    expect(fake.oauth).not.toHaveBeenCalled();
    vi.stubGlobal('fetch', settings({ external: { google: true } }));
    fake.oauth.mockResolvedValue({ data: { url: null }, error: { message: 'bad' } });
    expect(location(await start(request('/auth/google')))).toContain('/login?error=google');
  });
});

describe('/auth/callback', () => {
  it('signs an invited admin in and returns to the requested page', async () => {
    const response = await callback(request('/auth/callback?code=abc&next=/admin/events/1'));
    expect(fake.exchange).toHaveBeenCalledWith('abc');
    expect(location(response)).toBe('https://connect.example.nz/admin/events/1');
    expect(fake.signOut).not.toHaveBeenCalled();
  });
  it('turns provider errors, such as an uninvited account, into the fixed Google notice', async () => {
    const response = await callback(
      request('/auth/callback?error=server_error&error_description=Signups+not+allowed+for+this+instance'),
    );
    expect(location(response)).toBe('https://connect.example.nz/login?error=google&next=%2Fadmin');
    expect(fake.exchange).not.toHaveBeenCalled();
    fake.exchange.mockResolvedValue({ data: { user: null }, error: { message: 'invalid grant' } });
    expect(location(await callback(request('/auth/callback?code=stale')))).toContain('/login?error=google');
  });
  it('signs out an account without admin rights and says why', async () => {
    fake.profile.mockResolvedValue({ data: { id: user.id, display_name: 'Sam', role: null, disabled_at: null } });
    expect(location(await callback(request('/auth/callback?code=abc')))).toBe(
      'https://connect.example.nz/login?error=no-role&next=%2Fadmin',
    );
    fake.profile.mockResolvedValue({
      data: { id: user.id, display_name: 'Sam', role: 'admin', disabled_at: '2026-09-01' },
    });
    expect(location(await callback(request('/auth/callback?code=abc')))).toContain('error=disabled');
    fake.profile.mockResolvedValue({ data: null });
    expect(location(await callback(request('/auth/callback?code=abc')))).toContain('error=no-profile');
    expect(fake.signOut).toHaveBeenCalledTimes(3);
  });
  it('keeps the redirect on this site whatever next says', async () => {
    expect(location(await callback(request('/auth/callback?code=abc&next=https://evil.example')))).toBe(
      'https://connect.example.nz/admin',
    );
  });
});
