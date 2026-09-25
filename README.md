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

`admin:create` prompts for the password (or reads `ADMIN_PASSWORD`). Run it again with `--role admin` for other organisers. Public sign-up is turned off; accounts only exist when a superadmin creates them.

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
| `npm run check:secrets` | Fails if any server-only value or secret pattern is in `.next/static` |
| `npm run db:reset` | Recreate the local database from migrations |
| `npm run db:types` | Regenerate `src/lib/supabase/database.types.ts` |
| `npm run env:local` | Write `.env.local` for the local stack (`-- --force` to replace) |
| `npm run admin:create` | Create an admin or change an account's role (reads `.env.local`) |

Integration and E2E tests refuse to run unless `NEXT_PUBLIC_SUPABASE_URL` is a local address.

## Layout

```
src/app          routes (public, auth, admin)
src/domain       pure scheduling, standings and matching logic (phase 2)
src/server       server-only: access checks, Server Actions
src/lib          Supabase clients, security headers, formatting
supabase/        migrations, pgTAP tests, local config
scripts/         check-secrets, local-env, create-admin
tests/           unit, component, integration, e2e
```

## Production (later phases)

The hosted project is `https://ephhjzrkbjrhcjrwtknn.supabase.co`. Nothing has been applied to it yet. Before first deploy: link with `npx supabase link`, push migrations with `npx supabase db push`, and in the dashboard turn **off** public sign-ups and anonymous sign-ins for this project (the local `supabase/config.toml` does not change the hosted project). Environment values go in Netlify, never in the repository.
