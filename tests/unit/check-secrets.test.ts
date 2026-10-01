import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { containsServiceRoleJwt, scan, scanBuildOutput } from '../../scripts/check-secrets';

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

describe('build output including restored Netlify compiler caches', () => {
  it('detects secret bytes in both cache locations without reporting the value', () => {
    mkdirSync(join(dir, '.next', 'static'), { recursive: true });
    const secret = 'test_only_connect_link_secret_0123456789';
    const caches = ['.next/cache/turbopack', '.netlify/.next/cache/turbopack'];
    for (const cache of caches) {
      mkdirSync(join(dir, cache), { recursive: true });
      writeFileSync(join(dir, cache, 'environment.sst'), Buffer.concat([Buffer.from([0, 255]), Buffer.from(secret)]));
    }

    const findings = scanBuildOutput(dir, { CONNECT_LINK_SYNC_SECRET: secret });
    expect(findings).toEqual(
      caches.map((cache) => ({ file: join(cache, 'environment.sst'), what: 'value of CONNECT_LINK_SYNC_SECRET' })),
    );
    expect(JSON.stringify(findings)).not.toContain(secret);
  });

  it('keeps the browser scan and served-file filter when compiler caches are absent', () => {
    mkdirSync(join(dir, '.next', 'static'), { recursive: true });
    mkdirSync(join(dir, '.next', 'server', 'app'), { recursive: true });
    writeFileSync(join(dir, '.next', 'static', 'client.js'), '"sb_secret_ABCDEFGHIJKLMNOP"');
    writeFileSync(join(dir, '.next', 'server', 'app', 'page.html'), '"sb_secret_ABCDEFGHIJKLMNOP"');
    writeFileSync(join(dir, '.next', 'server', 'app', 'page.js'), '"sb_secret_ABCDEFGHIJKLMNOP"');
    expect(scanBuildOutput(dir, {}).map((finding) => finding.file)).toEqual([
      join('.next', 'static', 'client.js'),
      join('.next', 'server', 'app', 'page.html'),
    ]);
  });
});
