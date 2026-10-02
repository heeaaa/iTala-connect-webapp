# iTala Connect

Basketball tournament management for community leagues: events, divisions, teams, round-robin schedules, seeded playoffs, live scores and standings. Rewrite of the iTala Platform scheduler on Next.js and Supabase.

Specs and plans live in `docs/`: [PRD](docs/PRD.md) (feature parity), [Migration plan](docs/MIGRATION_PLAN.md) (architecture and phases), [Mobile integration](docs/MOBILE_INTEGRATION.md), [Work status](docs/work-status.md).

## Requirements

- Node 24 LTS (`.nvmrc`) and npm
- Docker Desktop (for the local Supabase stack)

## First-time setup (local)

```bash
npm ci
npm run db:start              # local Supabase in Docker, applies supabase/migrations
npm run env:local             # writes .env.local with the LOCAL stack keys
npx playwright install chromium
npm run admin:create -- --email you@example.com --name "Your Name" --role superadmin
npm run dev                   # http://localhost:3000
```

`admin:create` prompts for the password (or reads `ADMIN_PASSWORD`). Use it for the first superadmin. After that, a superadmin adds organisers on the **Admins** screen: it creates the account and shows a one-time set-up link to send to the person (no email is sent), and it changes roles, disables accounts and makes a fresh link for a forgotten password. Public sign-up is turned off; accounts only exist when a superadmin creates them.

Set-up links expire after Supabase Auth's email link lifetime (1 hour by default; the local stack's `otp_expiry` in `supabase/config.toml`). If you change it on the hosted project, update the "expires in 1 hour" text in `src/app/admin/admins/admins-view.tsx`.

## Commands

| Command | What it does |
| --- | --- |
| `npm ci` | Install from the lockfile |
| `npm run dev` | Development server |
| `npm run lint` | ESLint and Prettier check |
| `npm run format` | Prettier write |
| `npm run typecheck` | Route type generation, then `tsc --noEmit` |
| `npm run test:unit` | Unit and component tests (Vitest, once) |
| `npm run test:coverage` | Same, with coverage thresholds (80% overall, 100% for `src/domain`) |
| `npm run test:db` | pgTAP tests for RLS, functions and storage (`supabase test db`) |
| `npm run test:integration` | Auth, PostgREST and Storage against the local stack |
| `npm run test:e2e` | Playwright journeys at 390 px and 1440 px (run `npm run build` first) |
| `npm run build` | Production build |
| `npm run golden:generate` | Rewrite `tests/golden/*.json` from the legacy code in `scripts/golden/legacy` (only when the case list changes; never to make a test pass) |
| `npm run migrate:firebase -- --file <export.json>` | Dry run of the Firebase import: plans every event from a Firebase console JSON export and prints the verification report (counts, issues, and where each game appears, its score, the standings and playoff teams, from the old code against the new). Writes nothing. Give event ids as `--event=<id>`; keep the export outside the repository |
| `npm run migrate:firebase -- --file <export.json> --apply --owner <email> --env <file> --to <host>` | The real import, with the keys from `<file>` only, and only if they are for `<host>`: prints the same report, writes every ready event (one transaction each, repeatable), reads each back and compares it again, then copies its images (PNG, JPEG or WebP up to 5 MB, from the old `*.supabase.co` bucket only) unless `--skip-images`. An event with differences needs `--accept-differences=<id>`; one changed or deleted in iTala Connect since its last import, or with far fewer games or scores in the export, is refused unless `--overwrite=<id>`. Exit 0 only when every event was written and matches. Either form takes `--relink-division=<event id>:<old key>=<new key>` to move the games of a division deleted in the old app to one that exists |
| `npm run check:secrets` | Fails if any server-only value or secret pattern is in `.next/static` |
| `npm run db:reset` | Recreate the local database from migrations |
| `npm run db:types` | Regenerate `src/lib/supabase/database.types.ts` |
| `npm run env:local` | Write `.env.local` for the local stack (`-- --force` to replace) |
| `npm run admin:create` | Create the first superadmin, or change an account's role, from the command line (reads `.env.local`) |

Integration and E2E tests refuse to run unless `NEXT_PUBLIC_SUPABASE_URL` is a local address.

## Layout

```
src/app          routes (public, auth, admin)
src/domain       pure scheduling, standings, playoff and matching logic (golden parity with the old app)
src/server       server-only: access checks, Server Actions
src/lib          Supabase clients, security headers, formatting
supabase/        migrations, pgTAP tests, local config
scripts/         check-secrets, local-env, create-admin
tests/           unit, component, integration, e2e
```

## Deploying

The site (https://itala-connect.netlify.app) is built by Netlify's free tier from `main`, with the settings in `netlify.toml`: the build runs `check:secrets`, and Node comes from `.nvmrc`. Every merge into `main` deploys.

- **Migrations first.** Push new migrations to the hosted Supabase project (`npx supabase db push`) before merging the code that needs them.
- **Environment values** live in Netlify (Project configuration > Environment variables), never in the repository: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SITE_URL`, `SUPABASE_SECRET_KEY` (marked as secret), `SUPABASE_STORAGE_BUCKET` and `DEFAULT_EVENT_TIMEZONE`. Leave `MOBILE_*` unset until the real mobile check, and never set `ENABLE_PROTOTYPES` or `FIREBASE_*`.
- **Reports Mobile reader** (after deploying and verifying `connect-reports` in the Mobile project): set `MOBILE_REPORTS_READ_SECRET` as a server-only Netlify secret, matching the Mobile function's `CONNECT_REPORTS_READ_SECRET`. The function performs GET-only reads; Connect checks its own event permission and approved league/team/game links before using the response. Leave this unset until that function is deployed. It is separate from the existing Mobile import reader, whose Auth session creation is unsuitable for Reports.
- **Compiler caches and secrets.** `npm run build` removes restored Turbopack compiler caches and disables new production disk caches. This supports Netlify Free's all-scope environment settings while keeping secret scanning enabled. See [mobile link deployment recovery](docs/MOBILE_LINK_SYNC.md#netlify-deployment-stopped-by-a-compiler-cache-secret-finding).
- **Supabase Auth** (URL Configuration): use `https://connect.itala.fyi` as the Site URL and allow `https://connect.itala.fyi/auth/callback` as the production Google redirect. Keep `http://localhost:3000/auth/callback` for local development. To sign in on PR previews, also allow `https://deploy-preview-*--itala-connect.netlify.app/auth/callback`. OAuth chooses the exact trusted Connect or numbered preview host that received the sign-in request so its PKCE cookie survives. The `redirectTo` URL ends at `/auth/callback` with no query string, matching the exact allow-list entry; Connect carries the post-login path in a short-lived cookie. Public sign-ups and anonymous sign-ins stay off.
- **Netlify**: set `NEXT_PUBLIC_SITE_URL=https://connect.itala.fyi` for Production and redeploy after changing it; updates to environment values do not change an existing deploy. The old `itala-connect.netlify.app` redirect can remain while old links are in use. In Google Cloud's Web OAuth client, the authorized redirect URI remains the Supabase project's `/auth/v1/callback` URL. See docs/MIGRATION_PLAN.md 12.2 for cutover.
