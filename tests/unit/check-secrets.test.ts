import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { containsServiceRoleJwt, scan } from '../../scripts/check-secrets';

const jwt = (payload: object) =>
  `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.c2lnbmF0dXJl`;

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'check-secrets-'));
  mkdirSync(join(dir, 'chunks'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('check:secrets scan (X-01)', () => {
  it('passes clean output, including the publishable key and an anon JWT', () => {
    writeFileSync(
      join(dir, 'chunks', 'a.js'),
      `const k="sb_publishable_abcdefghijklmnop";const a="${jwt({ role: 'anon' })}";`,
    );
    expect(scan(dir, { SUPABASE_SECRET_KEY: 'sb_secret_value_not_in_bundle' })).toEqual([]);
  });

  it('finds a server-only value by name without echoing it', () => {
    writeFileSync(join(dir, 'chunks', 'b.js'), 'fetch("https://mobile-project.supabase.co/rest")');
    const findings = scan(dir, { MOBILE_SUPABASE_URL: 'https://mobile-project.supabase.co' });
    expect(findings).toEqual([{ file: join('chunks', 'b.js'), what: 'value of MOBILE_SUPABASE_URL' }]);
  });

  it('finds secret-key and service-role patterns even when env is empty', () => {
    writeFileSync(join(dir, 'c.js'), 'x="sb_secret_ABCDEFGHIJKLMNOP"');
    writeFileSync(join(dir, 'd.js'), `y="${jwt({ iss: 'supabase', role: 'service_role' })}"`);
    const whats = scan(dir, {}).map((f) => f.what);
    expect(whats).toEqual(expect.arrayContaining(['Supabase secret key (sb_secret_...)', 'Supabase service_role JWT']));
  });

  it('ignores very short env values that would match by accident', () => {
    writeFileSync(join(dir, 'e.js'), 'const x = "abc"');
    expect(scan(dir, { SUPABASE_SECRET_KEY: 'abc' })).toEqual([]);
  });
});

describe('containsServiceRoleJwt', () => {
  it('ignores JWT-like strings that do not decode', () => {
    expect(containsServiceRoleJwt('eyJx.eyJ!!!.zz')).toBe(false);
    expect(containsServiceRoleJwt(`${jwt({ role: 'authenticated' })}`)).toBe(false);
  });
});

describe('served server output filter', () => {
  it('scans only files that reach the browser', async () => {
    const { SERVED_SERVER_OUTPUT } = await import('../../scripts/check-secrets');
    writeFileSync(join(dir, 'page.html'), 'x="sb_secret_ABCDEFGHIJKLMNOP"');
    writeFileSync(join(dir, 'page.js'), 'y="sb_secret_ABCDEFGHIJKLMNOP"');
    const files = scan(dir, {}, (f) => SERVED_SERVER_OUTPUT.test(f)).map((f) => f.file);
    expect(files).toEqual(['page.html']);
  });
});
