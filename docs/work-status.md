# Work status

Last updated: 25/09/2026

## Objective

Rebuild the iTala Platform scheduler as iTala Connect (Next.js + Supabase) with full feature parity, real security, tests and a rebranded UI, then migrate existing Firebase data and switch connect.itala.fyi over.

## Decisions

- Next.js App Router replaces Vite; TypeScript strict; Tailwind; shadcn/ui where useful.
- New dedicated Supabase project; individual admin accounts with superadmin and admin roles.
- Platform UI uses the iTala logo palette; organiser-chosen event colours stay in full control of public event pages.
- Migrate existing Firebase data with a repeatable import, verify, then switch over.
- Repository https://github.com/heeaaa/iTala-connect-webapp and Supabase project https://ephhjzrkbjrhcjrwtknn.supabase.co are created (25/09/2026). Nothing pushed or applied to either yet.
- Mobile integration starts with a simple league import (docs/MOBILE_INTEGRATION.md stage 1), built as the first feature slice (phase 3b). Mobile reader uses a server-side cached anonymous session (O-3 decided).
- 25/09/2026: Aeron confirmed anonymous sign-ins are switched on in Supabase (needed on the iTala **mobile** project for the O-3 reader). The iTala Connect project itself should keep anonymous sign-ins and public sign-ups **off**; the schema gives anonymous users no profile and no access either way (tested).
- Phase 1 used the suggested options for open decisions it touches: O-1 superadmin owns legacy events (ownership reassignable by superadmin only), O-2 Admins screen in this migration (read-only list now, `npm run admin:create` meanwhile), O-4 per-event time zone defaulting to `DEFAULT_EVENT_TIMEZONE`.
- Re-publish always rebuilds from scratch (E-62); `publish_event` refuses when scores exist unless `p_clear_scores` is true, so declining changes nothing.
- docs/SCHEDULER_INTEGRATION_PLAN.md copied verbatim from `iTala/docs` as the parked long-term plan.
- Open decisions O-2 (full screen timing), O-5 to O-7: docs/MIGRATION_PLAN.md section 15.

## Changed areas (phase 1, 25/09/2026)

- Scaffold: Next.js 16.3.6, React 19.2, Tailwind 4, TypeScript strict (+ `noUncheckedIndexedAccess`), ESLint + Prettier, Vitest 5, Playwright 1.63, Node 24 pinned in `.nvmrc` and `engines`.
- `src/env.schema.ts`, `src/env.ts` (`server-only`), `src/env.client.ts`: zod validation, placeholder rejection, errors name variables never values. `.env.example` committed with names only.
- `src/proxy.ts`: per-request CSP nonce, Supabase session refresh with `getClaims()`, first gate on `/admin`. `next.config.ts`: HSTS, nosniff, frame DENY, referrer and permissions policies.
- `supabase/migrations`: core schema (plan section 7), RLS and storage policies (section 8), atomic functions `publish_event`, `append_games`, `move_game`, `swap_games`, `unschedule_game`, `set_score`, `approve_mobile_result`, audit triggers. `supabase/config.toml`: public sign-up off, anonymous sign-in off, 10-character passwords, images bucket 5 MB PNG/JPEG/WebP.
- Independent security review (subagent, read only, reproduced against the local stack): no critical or high findings; 4 medium and 5 low closed in `20260925000400_hardening.sql` and app fixes. Provenance now written only by `approve_mobile_result` / `dismiss_mobile_result` (stamped with the caller); parent keys (`games.event_id`, `divisions.event_id`, `teams.division_id`, ...) immutable; `legacy_*` columns import-only; publish status changes only through `publish_event`, which now locks the event's games before counting scores; helper functions not needed by anon revoked; hidden password prompt in `admin:create`; `check:secrets` also scans served `.next/server/app` output; proxy redirect keeps no-cache headers. Accepted as documented: draft image URLs readable by anyone holding them (plan section 8), Realtime DELETE payloads carry primary keys only, anon can read `division_event_id`/`team_event_id` for a known id.
- Auth: login (generic error, safe `next` redirect), logout to home, admin layout role gate, placeholder dashboard (own events; superadmin all), superadmin-only Settings and Admins placeholders. UI is deliberately unstyled pending phase 3.
- Scripts: `check-secrets.ts`, `local-env.ts`, `create-admin.ts`.
- CI: `.github/workflows/ci.yml` (lint, typecheck, unit+coverage, backend job with pgTAP, integration, build, check:secrets, E2E, gitleaks). Actions pinned to commit SHAs, `contents: read`, superseded runs cancelled, no secrets used.
- `README.md` rewritten; `CLAUDE.md` status and phase 1 conventions updated; `AGENTS.md` is written by `next dev` itself and was not added by hand.

## Commands and results (25/09/2026, cloud workspace, Node 24.21.0, local Supabase via CLI 2.117.0)

- `npm run lint`: pass (ESLint 0 problems, Prettier clean).
- `npm run typecheck`: pass.
- `npm run test:coverage`: 6 files, 53 tests pass. Coverage 83.7% lines, 87.1% branches (thresholds 80%).
- `npm run test:db`: 4 files, 130 pgTAP assertions pass. `004_hardening.sql` was run first without the hardening migration: 14 of 20 failed for the reviewed defects, then all passed with it. First run failed 3 real defects (admins could reassign ownership, superadmin could demote self: guard triggers were security definer) and one more (a re-publish inside one transaction was not audited, 2 assertions). Fixed, then green.
- `npm run test:integration`: 15 tests pass (Auth settings, PostgREST RLS, RPC permissions, Storage MIME and size limits).
- `npm run build`: pass. `npm run check:secrets`: pass; also shown to exit 1 on a secret planted in `.next/static` and in `.next/server/app/*.html`.
- `npm run admin:create`: smoke-tested locally (create, re-run on an existing account, refuses to prompt without a terminal).
- gitleaks (docker, whole folder): findings only in gitignored local files (`.env.local`, `.next`, `test-results`), none in delivered source.
- `npm run test:e2e`: 24 pass (12 journeys x 390 px and 1440 px) with a preinstalled Chromium build older than Playwright 1.63 expects (`PLAYWRIGHT_CHROMIUM_EXECUTABLE`). NOT RUN with Playwright's own Chromium; CI installs it.
- `actionlint` on ci.yml: pass. CI itself: NOT RUN (nothing pushed).
- `supabase db lint`: no errors.
- Impeccable launcher: NOT RUN (needs your computer; see next action).

## Blockers

- Phase 2 needs read access to the old code folder `..\iTala-platform` (golden parity fixtures). Not yet connected to the Cowork session.
- Phase 6 needs access details for the mobile Supabase project. Phase 7 needs a Firebase service account or JSON export.

## Next action

1. Done 25/09/2026: `/impeccable init` wrote `PRODUCT.md`. Open: copy locale (user asked for Canadian English; org rule and CLAUDE.md say NZ English, DD/MM/YYYY) and the default event time zone (most organisers are in BC). Phase 3 next: `/impeccable shape` for the Today screen.
   Done 25/09/2026: shape confirmed for the Today screen (public event page, Schedule tab). Direction **Painted Lines** chosen on the Impeccable decision page (seed b7ecb8d8, assigned, code-led): organiser colours as gym floor paint; per-court panels with fixed stations Final / On court / Up next above tonight's court x time grid with a single moving "now" line; team filter remembered per device. Accepted defaults for open points: On court = scheduled slot in progress in the event time zone, Final = slot passed and both scores in; remembered team and time-proportional rows need PRD rows (P-04, P-05 Improve). Next: record the direction contract in the surface brief, then build the 390 px and 1440 px prototype with mock data.
   Done 25/09/2026: Today prototype built at `/prototype/today` (sample data, 404 unless `ENABLE_PROTOTYPES=1`; controls for clock, courts, colours, feed, owner view, simulated basket).
   - Code: `src/domain/game-day.ts` (pure game-day rules), `src/lib/event-time.ts`, `src/lib/color.ts`, `src/components/event/` (EventShell with `--ev-*` tokens, Today components, `today.module.css`), `src/app/event-fonts.ts` (Big Shoulders, Big Shoulders Stencil, Archivo via next/font), `src/prototype/league-night.ts`.
   - Contract: `.impeccable/surfaces/src-app-public-events-eventid-page-tsx.md`.
   - PRD: P-04 and P-05 Improve, new P-13.
   - Checks: 115 unit/component tests pass with coverage gates; lint and typecheck clean except the pre-existing Prettier warning on `skills-lock.json` (unchanged from HEAD); build and check:secrets pass.
   - E2E: `tests/e2e/today-prototype.spec.ts` 8/8 at 390 and 1440 with axe. Run with a scratch config because Docker and local Supabase were not available; the full suite is NOT RUN here, but CI runs it.
   - Finish review: disposition fix, 8 material fixes applied.
   Finish review re-scored: ship (8 fixes plus 2 regressions resolved). DESIGN.md and `.impeccable/design.json` written from the built world (event pages only; platform navy/teal/lime screens not designed yet).
   Next: phase 4 wires `/events/[eventId]` to real data using these components; design the platform screens (home, login, admin) in the iTala logo palette.
2. You: phase 0, rotate the two old admin passwords and check the live Firebase rules.
3. You: save the CI workflow from the chat as `.github/workflows/ci.yml` (Cowork cannot write inside `.github`). Then (optional now) `git init`, commit, push to GitHub so CI runs; set branch protection with the five CI checks as required.
4. Next session: phase 2 domain port and golden parity suite, once the iTala-platform folder is connected.
