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

## Deploying to Netlify

The hosted Supabase project is `https://ephhjzrkbjrhcjrwtknn.supabase.co`. The site deploys from GitHub (`main`) on Netlify's free tier, with the build settings in `netlify.toml`. Environment values go in Netlify, never in the repository.

**Before the first deploy (Supabase dashboard):**

1. Migrations are pushed: `npx supabase link --project-ref ephhjzrkbjrhcjrwtknn`, then `npx supabase db push`. After any new migration, push it before (or with) the deploy that needs it.
2. Authentication: public **sign-ups off** and **anonymous sign-ins off** for this project (the local `supabase/config.toml` does not change the hosted project).
3. A superadmin account exists, to sign in with and to create the other admins on the Admins screen.

**Netlify, once:**

1. Add a new project, import from GitHub, choose `heeaaa/iTala-connect-webapp`, production branch **`main`**. Leave the build settings to `netlify.toml` (build `npm run build && npm run check:secrets`; the publish directory is set by Netlify's Next.js adapter; Node 24 from `.nvmrc`). Never drag and drop a folder.
2. Environment variables (Project configuration > Environment variables), available to builds and functions:

   | Name | Value | Mark "contains secret values"? |
   | --- | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://ephhjzrkbjrhcjrwtknn.supabase.co` | No |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the project's publishable key (`sb_publishable_...`) | No: public by design |
   | `NEXT_PUBLIC_SITE_URL` | the site's own address, for example `https://<name>.netlify.app` (later `https://connect.itala.fyi`) | No |
   | `SUPABASE_SECRET_KEY` | the project's secret key (`sb_secret_...`) | **Yes** |
   | `SUPABASE_STORAGE_BUCKET` | `images` | No |
   | `DEFAULT_EVENT_TIMEZONE` | `Pacific/Auckland` (or `America/Vancouver`) | No |
   | `MOBILE_SUPABASE_URL`, `MOBILE_SUPABASE_PUBLISHABLE_KEY` | leave **unset** until the real mobile check; setting them turns the mobile features on | **Yes** (server only) |

   Never set `ENABLE_PROTOTYPES` or any `FIREBASE_*` value on Netlify.
3. Security: keep deploy previews for pull requests from forks behind approval (the sensitive variable policy), so outside code never builds with the secret key.
4. Back in Supabase, Authentication > URL Configuration: set the **Site URL** to the Netlify address and add `https://<name>.netlify.app/**` to the **Redirect URLs**. Without it, sign-in and the Admins screen's set-up links point to the wrong place. Google sign-in, if on, keeps its Supabase callback in the Google console; nothing changes there.

**First deploy, then check:**

- The build log shows `check:secrets passed`. If Netlify's own secret scanning stops the build on the publishable key (smart detection), add that one value to `SECRETS_SCAN_SMART_DETECTION_OMIT_VALUES`; it is public by design. Never safelist the secret key.
- The home page loads; `/admin` sends you to sign in; you can sign in as superadmin; the Admins screen opens, and a set-up link it makes starts with the Netlify address (not `localhost`).
- The response headers include `Content-Security-Policy` and `Strict-Transport-Security`.

**After that:** every merge into `main` deploys. Work continues on a branch and reaches the site through a pull request once CI is green. Moving `connect.itala.fyi` to Netlify is the cutover step (docs/MIGRATION_PLAN.md 12.2), not part of this setup; when it happens, update `NEXT_PUBLIC_SITE_URL` and the Supabase URL configuration to the new address.
