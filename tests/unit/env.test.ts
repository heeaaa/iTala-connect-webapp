import { describe, expect, it } from 'vitest';

import { clientEnvSchema, EnvError, isValidTimeZone, parseEnv, serverEnvSchema } from '@/env.schema';

const base = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://ephhjzrkbjrhcjrwtknn.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abcdefghijklmnopqrstuvwxyz',
  NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
};

function problems(source: Record<string, string | undefined>, schema = serverEnvSchema): string[] {
  try {
    parseEnv(schema, source);
    return [];
  } catch (e) {
    expect(e).toBeInstanceOf(EnvError);
    return (e as EnvError).problems;
  }
}

describe('server env validation (X-02)', () => {
  it('accepts a minimal valid environment and applies defaults', () => {
    const env = parseEnv(serverEnvSchema, base);
    expect(env.SUPABASE_STORAGE_BUCKET).toBe('images');
    expect(env.DEFAULT_EVENT_TIMEZONE).toBe('Pacific/Auckland');
    expect(env.SUPABASE_SECRET_KEY).toBeUndefined();
    expect(env.MOBILE_SUPABASE_URL).toBeUndefined();
  });

  it('treats blank optional values as unset', () => {
    const env = parseEnv(serverEnvSchema, { ...base, MOBILE_SUPABASE_URL: '  ', SUPABASE_STORAGE_BUCKET: '' });
    expect(env.MOBILE_SUPABASE_URL).toBeUndefined();
    expect(env.SUPABASE_STORAGE_BUCKET).toBe('images');
  });

  it('names every missing required variable', () => {
    expect(problems({})).toEqual(
      expect.arrayContaining([
        'NEXT_PUBLIC_SUPABASE_URL is missing',
        'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing',
        'NEXT_PUBLIC_SITE_URL is missing',
      ]),
    );
  });

  it('rejects placeholder values from the old app', () => {
    const found = problems({
      ...base,
      NEXT_PUBLIC_SUPABASE_URL: 'https://YOUR_PROJECT.supabase.co',
      SUPABASE_SECRET_KEY: 'change-me-change-me-change-me',
    });
    expect(found).toEqual(
      expect.arrayContaining([
        'NEXT_PUBLIC_SUPABASE_URL still holds a placeholder value',
        'SUPABASE_SECRET_KEY still holds a placeholder value',
      ]),
    );
  });

  it('never includes the offending value in the error', () => {
    const secret = 'sb_secret_THIS_MUST_NOT_APPEAR_IN_ERRORS';
    try {
      parseEnv(serverEnvSchema, { ...base, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: secret });
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).not.toContain(secret);
      expect((e as EnvError).problems).toContain(
        'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be the publishable key, not the secret key',
      );
    }
  });

  it('rejects non-http URLs and short keys', () => {
    const found = problems({ ...base, NEXT_PUBLIC_SITE_URL: 'ftp://example.com', SUPABASE_SECRET_KEY: 'short' });
    expect(found).toEqual(
      expect.arrayContaining([
        'NEXT_PUBLIC_SITE_URL must be an http:// or https:// URL',
        'SUPABASE_SECRET_KEY is too short to be a real key',
      ]),
    );
  });

  it('requires the mobile key when the mobile URL is set', () => {
    expect(problems({ ...base, MOBILE_SUPABASE_URL: 'https://mobile.supabase.co' })).toContain(
      'MOBILE_SUPABASE_PUBLISHABLE_KEY is required when MOBILE_SUPABASE_URL is set',
    );
    expect(
      problems({
        ...base,
        MOBILE_SUPABASE_URL: 'https://mobile.supabase.co',
        MOBILE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_mobilemobilemobile',
      }),
    ).toEqual([]);
  });

  it('validates the default event time zone', () => {
    expect(problems({ ...base, DEFAULT_EVENT_TIMEZONE: 'Mars/Olympus' })).toContain(
      'DEFAULT_EVENT_TIMEZONE is not a valid IANA time zone',
    );
    expect(parseEnv(serverEnvSchema, { ...base, DEFAULT_EVENT_TIMEZONE: 'Asia/Manila' }).DEFAULT_EVENT_TIMEZONE).toBe(
      'Asia/Manila',
    );
  });

  it('keeps design prototypes off unless ENABLE_PROTOTYPES is exactly 1', () => {
    expect(parseEnv(serverEnvSchema, base).ENABLE_PROTOTYPES).toBe(false);
    expect(parseEnv(serverEnvSchema, { ...base, ENABLE_PROTOTYPES: '0' }).ENABLE_PROTOTYPES).toBe(false);
    expect(parseEnv(serverEnvSchema, { ...base, ENABLE_PROTOTYPES: '1' }).ENABLE_PROTOTYPES).toBe(true);
    expect(problems({ ...base, ENABLE_PROTOTYPES: 'true' })).toContain('ENABLE_PROTOTYPES must be 0 or 1');
  });

  it('client schema exposes only NEXT_PUBLIC_ values', () => {
    const env = parseEnv(clientEnvSchema, { ...base, SUPABASE_SECRET_KEY: 'sb_secret_should_be_dropped_entirely' });
    expect(Object.keys(env).sort()).toEqual(Object.keys(base).sort());
  });
});

describe('isValidTimeZone', () => {
  it.each([
    ['Pacific/Auckland', true],
    ['UTC', true],
    ['Not/AZone', false],
  ])('%s -> %s', (tz, ok) => {
    expect(isValidTimeZone(tz)).toBe(ok);
  });
});
