/**
 * npm run check:secrets (X-01)
 *
 * Scans what the browser can receive from a build: .next/static, plus the
 * prerendered HTML and RSC payloads under .next/server/app. It looks for:
 *  - the value of every server-only variable present in the environment,
 *  - Supabase secret key and service-role JWT patterns, whatever the env.
 * Fails with the variable name and file, never the value.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export const SERVER_ONLY_VARS = [
  'SUPABASE_SECRET_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_DB_URL',
  'ADMIN_PASSWORD',
  'MOBILE_SUPABASE_URL',
  'MOBILE_SUPABASE_PUBLISHABLE_KEY',
  'FIREBASE_DATABASE_URL',
  'FIREBASE_SERVICE_ACCOUNT_JSON',
] as const;

const PATTERNS: { name: string; re: RegExp }[] = [
  { name: 'Supabase secret key (sb_secret_...)', re: /sb_secret_[A-Za-z0-9_-]{10,}/ },
  { name: 'private key block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
];

const JWT = /eyJ[A-Za-z0-9_-]+\.(eyJ[A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g;

/** True when the text holds a JWT whose payload role is service_role (legacy Supabase keys). */
export function containsServiceRoleJwt(text: string): boolean {
  for (const match of text.matchAll(JWT)) {
    try {
      const payload = JSON.parse(Buffer.from(match[1] ?? '', 'base64url').toString('utf8')) as { role?: unknown };
      if (payload.role === 'service_role') return true;
    } catch {
      // Not a JWT after all.
    }
  }
  return false;
}

export interface Finding {
  file: string;
  what: string;
}

function* walk(dir: string, accept: (file: string) => boolean = () => true): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full, accept);
    else if (accept(full)) yield full;
  }
}

/** Files under .next/server/app that are sent to browsers as-is. */
export const SERVED_SERVER_OUTPUT = /\.(html|rsc|body|meta|segment\.rsc)$/;

export function scan(
  dir: string,
  env: Record<string, string | undefined>,
  accept: (file: string) => boolean = () => true,
): Finding[] {
  const values = SERVER_ONLY_VARS.flatMap((name) => {
    const value = env[name]?.trim();
    // Very short values would match by accident and are not secrets anyway.
    return value && value.length >= 12 ? [{ name, value }] : [];
  });

  const findings: Finding[] = [];
  for (const file of walk(dir, accept)) {
    const text = readFileSync(file, 'utf8');
    const rel = relative(dir, file);
    for (const { name, value } of values) {
      if (text.includes(value)) findings.push({ file: rel, what: `value of ${name}` });
    }
    for (const { name, re } of PATTERNS) {
      if (re.test(text)) findings.push({ file: rel, what: name });
    }
    if (containsServiceRoleJwt(text)) findings.push({ file: rel, what: 'Supabase service_role JWT' });
  }
  return findings;
}

function main() {
  const root = join(process.cwd(), '.next');
  const staticDir = join(root, 'static');
  const serverApp = join(root, 'server', 'app');
  try {
    statSync(staticDir);
  } catch {
    console.error('check:secrets: .next/static not found. Run `npm run build` first.');
    process.exit(2);
  }
  const findings = [
    ...scan(staticDir, process.env).map((f) => ({ ...f, file: join('static', f.file) })),
    ...(existsSync(serverApp)
      ? scan(serverApp, process.env, (file) => SERVED_SERVER_OUTPUT.test(file)).map((f) => ({
          ...f,
          file: join('server', 'app', f.file),
        }))
      : []),
  ];
  const checked = SERVER_ONLY_VARS.filter((n) => (process.env[n]?.trim().length ?? 0) >= 12);
  if (findings.length > 0) {
    console.error('check:secrets FAILED. Server-only material found in browser-facing build output:');
    for (const f of findings) console.error(`  - ${f.what} in .next/${f.file}`);
    process.exit(1);
  }
  console.log(
    `check:secrets passed: no secret patterns in .next/static or served .next/server/app output; server-only values checked: ${
      checked.length ? checked.join(', ') : 'none set in this environment'
    }.`,
  );
}

if (process.argv[1] && /check-secrets\.ts$/.test(process.argv[1])) main();
