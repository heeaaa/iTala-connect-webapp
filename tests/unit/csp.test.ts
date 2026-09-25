import { describe, expect, it } from 'vitest';

import { buildCsp, createNonce } from '@/lib/security/csp';

function directives(csp: string): Map<string, string[]> {
  return new Map(
    csp.split(';').map((part) => {
      const [name = '', ...values] = part.trim().split(/\s+/);
      return [name, values];
    }),
  );
}

describe('buildCsp (X-03)', () => {
  const prod = directives(buildCsp({ nonce: 'abc123', isDev: false, supabaseUrl: 'https://proj.supabase.co' }));

  it('uses the nonce and strict-dynamic for scripts, no unsafe-inline or unsafe-eval', () => {
    expect(prod.get('script-src')).toEqual(["'self'", "'nonce-abc123'", "'strict-dynamic'"]);
    expect(prod.get('style-src')).toEqual(["'self'", "'nonce-abc123'"]);
  });

  it('blocks framing, plugins and base tag hijacking', () => {
    expect(prod.get('frame-ancestors')).toEqual(["'none'"]);
    expect(prod.get('object-src')).toEqual(["'none'"]);
    expect(prod.get('base-uri')).toEqual(["'self'"]);
    expect(prod.get('form-action')).toEqual(["'self'"]);
  });

  it('allows the Supabase project for API, Realtime and images only', () => {
    expect(prod.get('connect-src')).toEqual(["'self'", 'https://proj.supabase.co', 'wss://proj.supabase.co']);
    expect(prod.get('img-src')).toContain('https://proj.supabase.co');
  });

  it('upgrades insecure requests in production only', () => {
    expect(prod.has('upgrade-insecure-requests')).toBe(true);
    const dev = directives(buildCsp({ nonce: 'n', isDev: true, supabaseUrl: 'http://127.0.0.1:54321' }));
    expect(dev.has('upgrade-insecure-requests')).toBe(false);
    expect(dev.get('script-src')).toContain("'unsafe-eval'");
    expect(dev.get('connect-src')).toContain('ws://127.0.0.1:54321');
  });

  it('creates a different nonce each time', () => {
    const a = createNonce();
    const b = createNonce();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9+/=]{40,}$/);
  });
});
