# Work status

Last updated: 26/09/2026

## Current handoff: Phase 3b in progress

**Live checkpoint (26/09, 13:00 NZ):** Full 56-test browser suite passed before review fixes. Reviewer required 44px secondary action targets (fixed) and unsaved Back/Sign out protection. Sign out guard works; new browser Back regression still fails on both viewports (no confirmation). Latest focused run:6 pass/2 fail. Latest unit/component total546, coverage96.27% lines/93.36% branches. Build and secret scan pass; Prettier needs auth.spec.ts formatted. See handoff for exact reproduction and next steps. Do not call latest tree complete.

Read [PHASE_3B_HANDOFF.md](PHASE_3B_HANDOFF.md) first when resuming on the other laptop. The user authorised implementing Phase 3b and testing thoroughly, then requested a written checkpoint because this session's token budget was running low.

- Phase 4 Docker verification is complete. Phase 3b (mobile league import) was skipped in the old next-action list and is now the active implementation, before the remainder of phase 5.
- Written: server-only anonymous mobile reader; league list and preview; atomic import RPC and audit; new/delete dashboard actions; draft editor for dates, courts, hours, time zone, colours, divisions, teams and players; local mock mobile HTTP server and tests.
- Latest local Docker evidence: **145 pgTAP assertions**, **21 integration tests** (including concurrent duplicate imports), **539 unit/component tests**, 96.17% line / 93.36% branch coverage. Production build, TypeScript, lint and environment-aware client secret scan passed.
- Six focused Phase 3b browser journeys passed. Full 56-test suite now running on the rebuilt application, including actual nested Storage image deletion and remembered editor collapse state. Existing dashboard tests currently have selector failures under investigation; completion is not claimed.
- Added durable image cleanup migration: delete the database event first, queue cleanup atomically, retain/retry failed Storage removal. Added schema and cleanup failure tests, contrast warnings and remembered collapse state. Design detector returned no findings; visual finish review remains pending.
- All changes are **uncommitted**, including new/untracked files. They must be transferred with the working tree or committed before the other laptop can see them. No push, hosted migration, deployment, or real mobile connection was performed.

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

- Docker verification completed on 26/09/2026; results are recorded below. The hosted project and GitHub CI remain untested.
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
3. Done: `.github/workflows/ci.yml` is committed (commit "Add ci"). Still open for you: push to GitHub so CI runs, then set branch protection with the CI checks as required.
4. Done 25/09/2026: phase 2 domain port and golden parity suite (details below).
5. Done 26/09/2026: phase 4 public pages, code complete and verified against local Docker-backed Supabase (details below). Active next step: finish Phase 3b using PHASE_3B_HANDOFF.md, then the remaining phase 5 admin/editor work.

## Phase 2: domain port (25/09/2026)

- Port in `src/domain`:
  - `scheduler.ts`: slot grid, circle rounds, groups, placement, sort, generateSchedule, post-publish round robin, bracket.
  - `standings.ts`: standings, group complete.
  - `playoffs.ts`: resolve sources, resolveAllPlayoffs, playoff placement.
  - `schedule-edit.ts`: reconcile, matchup counts.
  - `mobile-matching.ts`: matchFinals, reviewReason, toMs, settling, drift, norm, proposeTeamPairs, scoredGameIds, orient, dayOf.
  - `types.ts`.
- Golden suite:
  - `scripts/golden/legacy/` holds verbatim copies of `scheduler.js` and `integration.js`, and `app-extract.js` (verbatim `app.js` functions with line ranges, plus two marked harness wrappers).
  - `scripts/golden/generate.mjs` (`npm run golden:generate`) runs only the legacy code on 10 fixed and 40 seeded-random events and writes `tests/golden/*.json` (1.4 MB, deterministic).
  - `tests/unit/golden-parity.test.ts` checks 305 cases.
  - Never regenerate the golden files to make a test pass.
- Recorded changes against the old code, each tested:
  - E-64: playoff games that do not fit go to Unscheduled, and so do all later rounds. The old code overflowed, sometimes before earlier rounds.
  - E-41: playoff placement keeps the end time's minutes.
  - M-08: "same day" uses the event time zone.
  - Labels use " - " instead of a long dash.
  - The old playoff "court 1 taken" check was provably dead and was dropped; the golden cases confirm no change.
- Evidence:
  - Mutation check: 4 planted defects each failed the golden suite (51, 48, 40 and 4 failing cases), and all passed again after restoring.
  - `npm run test:coverage`: 451 tests pass, `src/domain` 100% (threshold 100%).
  - Lint, typecheck, build and check:secrets pass (the pre-existing Prettier warning on `skills-lock.json` is unchanged from HEAD).
- Independent review (read only; 200,000 fuzz cases against an instrumented legacy copy):
  - It confirmed the dead-check claim for normal inputs.
  - It found 4 real defects. Each got a regression test that failed first and passed after the fix:
    - a repeated schedule day double-booked playoff slots (days are now made distinct);
    - "HH:MM:SS" times from Postgres did not occupy their slot (occupancy is now keyed on minutes);
    - an empty `{}` score counted as scored;
    - a fractional games-per-team value was not truncated.
  - 3 golden cases were added with an unlisted day, an off-grid time and court 4.
  - Final run: 451 tests pass.
- Handed to later phases (from the review, not fixed here):
  - Phase 6: `hasDrifted` compares `lastEventAt` as exact text, like the old code. Postgres `timestamptz` returns "+00:00" where the mobile view says "Z", so every approval would look drifted. Store the raw mobile string in a text column, or compare with `toMs` (an Improve row). Test both forms.
  - Phase 5:
    - Add a distinct-days rule for `events.schedule_days` (schema, zod).
    - Make the games-per-team override zod schema `.int()`.
    - Validate `events.timezone` (`dayOf` throws on an invalid zone).
    - Add a unique constraint so the division team map is one-to-one.
    - The mapper from DB rows to domain shapes must pass stored, resolved playoff team ids to round robin, exactly as the old code did.
  - Phase 7 migration:
    - Convert scores as the old `parseInt` did (`""` is not a score).
    - Order teams by their Firebase key (RTDB returns key-sorted objects), not by `created_at`.
- Not yet wired into the app: publish and editor actions (phase 5) and the public standings (phase 4) will call these modules.

## Phase 4: public pages (26/09/2026, code complete, local database checks passed)

- Built:
  - Home `/` (H-01 to H-05): published only, current and upcoming first, today judged in each event time zone. Functional styling on placeholder tokens; the platform look is a later Impeccable round (user decision 26/09/2026).
  - Event page `/events/[eventId]`: Schedule, Standings, Teams and Rules tabs in the URL; sponsor rows and logo (P-01); draft preview for owners (A-06); share previews (P-12); real 404 and an error page (N-04).
  - Live island (`src/components/event/live-event.tsx`): Supabase Realtime on `game_scores` and `games`, with standings and playoff seeds recomputed on the client from `src/domain`.
  - Owner score entry (P-08): the `saveScore` Server Action calls `set_score`, debounced 700 ms, and a failure is reported and rolled back.
  - Legacy `#/event/{id}` redirect via `/l/[legacyId]`.
  - Rules are sanitised with `sanitize-html` (new dependency, MIT; allow-list of the old toolbar tags, no attributes).
- Mapping: `src/lib/public-event/model.ts` normalises Postgres `HH:MM:SS` times, validates stored playoff sources with zod, orders games by `position`, and keeps a playoff-flagged game out of standings even when its bracket link is unreadable. That last point was a bug caught by a unit test.
- Evidence (26/09/2026, this machine):
  - `npm run test:coverage`: 504 tests pass. They include XSS payloads for the sanitiser, the mapper, Home ordering, loaders and the score action against a fake Supabase client, and the live island with mocked Realtime (score paint-in, DELETE, refresh debounce, reconnecting, debounced save, failure rollback, live standings).
  - Lint, typecheck, build and check:secrets pass.
  - Visual and axe pass: the new tabs in the prototype, the 404s and the Home error state at 390 and 1440 px, all clean after two fixes (Standings overflowed the page at 390 px, and rules list markers were missing). Screenshots are in `.impeccable/review/phase4/` (gitignored).
  - A malformed id returned HTTP 200 because of `loading.tsx` streaming. The file was removed; it now returns 404 (PRD N-04 note).
- Verified with Docker Desktop on 26/09/2026: Realtime delivery under RLS, `set_score` through the action, nested PostgREST selects, draft visibility, legacy lookup and `tests/e2e/public-event.spec.ts` (journeys 3, 6 and 8, axe on every tab, Home). See the full command results below.
- Follow-ups:
  - Realtime DELETE payloads carry only the key and are not filtered by event; the island ignores ids that are not in the event.
  - Platform look for Home, login and admin.

## Platform look (26/09/2026, Impeccable, shipped)

- Direction: **Broadcast Package**, chosen on the decision page over the rolled Season Program Guide (seed a20866ff, code-led). The mobile app's colour-role rule was declared not binding by the user; the platform's own law is teal for identity and plate edges, lime only for LIVE pips and the one primary action on a screen.
- Built: Home, Sign in, the admin shell (Dashboard, Settings, Admins), the 404 pages and the error pages.
  - Brand tokens are in `src/app/globals.css`; the font is Saira with its width axis (`src/app/platform-fonts.ts`).
  - Components are in `src/components/platform/`.
  - The logo is `public/brand/itala-mark.png`: the mobile app's `favicon.png` copied unchanged, with provenance embedded. Its ground #0B0F18 equals the page ground.
- Contract: `.impeccable/surfaces/src-app-public-page-tsx.md`. DESIGN.md and `.impeccable/design.json` now document both worlds (event pages: Painted Lines; platform: Broadcast Package).
- Evidence: `/prototype/platform` shows the screens with sample data because there is no database here (404 unless ENABLE_PROTOTYPES=1).
  - Captures at 390 and 1440 are in `.impeccable/review/platform/` (gitignored); axe is clean and nothing scrolls sideways.
  - Finish review: fix (8), then a second verdict: fix (1 unresolved plus 2 regressions), then a third: ship.
  - Not captured: the Admins screen, and the hover, focus and loading states.
  - Tests pass, including new platform-frame component tests; lint, types, build and check:secrets pass.
- Verified with Docker Desktop on 26/09/2026: signed-in admin screens and Home with real local data (`auth.spec.ts`, `public-event.spec.ts`).

## Docker verification (26/09/2026, Windows PC with Docker Desktop)

- `npm ci`: initially failed because two `@emnapi` entries were missing from `package-lock.json`; repaired the lockfile and the clean install passed (503 packages).
- `npx playwright install chromium`: passed. `npm run db:start`: passed; all four migrations applied. `npm run env:local`: passed after using a Windows-compatible shell invocation for `npx`.
- `npm run test:db`: 4 files, 130 assertions passed. `npm run test:integration`: 1 file, 15 tests passed.
- `npm run typecheck`: passed. `npm run test:coverage`: 19 files, 511 tests passed; 97.18% lines and 94.55% branches overall.
- `npm run build`: passed with font network access. `npm run check:secrets`: passed.
- `npm run test:e2e`: initial setup exposed two seed inserts that incorrectly expected returned rows and a mixed-shape games insert missing non-null fields. The first full run passed 45/50; its failures identified an outdated 404 heading assertion, shared score state between viewport projects, and orphaned users from aborted setup attempts. After fixing the tests and resetting only the local test database, the full suite passed 50/50 (390 px and 1440 px), including the live score Realtime journey.
- `npm run lint`: ESLint passed; Prettier initially flagged 119 files because this Windows checkout uses CRLF. `prettier --check . --end-of-line auto` passed. `.prettierrc.json` now sets that option for the standard lint command.

The commands below remain the repeatable procedure for another local verification run.

1. Install Docker Desktop and Node 24 LTS (`.nvmrc`). Then:
   ```bash
   npm ci
   npx playwright install chromium
   npm run db:start        # local Supabase in Docker, applies supabase/migrations
   npm run env:local       # writes .env.local for the LOCAL stack only
   ```
2. Database and backend:
   ```bash
   npm run test:db           # pgTAP: RLS, functions, storage (130 assertions at phase 1)
   npm run test:integration  # Auth, PostgREST RLS, RPC, Storage against the local stack
   ```
3. App gates:
   ```bash
   npm run lint && npm run typecheck && npm run test:coverage
   npm run build && npm run check:secrets
   npm run test:e2e          # full suite at 390 and 1440 px: auth.spec.ts, today-prototype.spec.ts, public-event.spec.ts (50 tests)
   ```
   `tests/e2e/global-setup.ts` now also seeds a published league night (`tests/e2e/seed-public-event.ts`) with the secret key; it needs `SUPABASE_SECRET_KEY` in `.env.local` (`npm run env:local` writes it). The Playwright web server sets `ENABLE_PROTOTYPES=1` itself. Watch `public-event.spec.ts` "Live scores" closely: it is the first real test of Realtime under RLS. `today-prototype.spec.ts` passed 8/8 here only through a scratch config without the Supabase seeding; this is its first run inside the real suite.
4. Anything that fails: follow CLAUDE.md "reproduce -> fail -> fix -> pass". Do not weaken tests. The known baseline Prettier warning is `skills-lock.json`.
5. Then push so GitHub Actions runs the same gates. Phase 4 (public pages: home, event tabs, realtime scores, standings from `src/domain/standings.ts`, legacy redirects, share previews) needs this stack for its queries and E2E journeys 3 and 6.
