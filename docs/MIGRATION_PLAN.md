# iTala Connect - Migration and Architecture Plan

Status: draft for review, 25/09/2026. Owner: Aeron. Nothing has been built yet.

This plan moves the iTala Platform scheduler (`iTala-platform`, vanilla JS + Firebase, live at connect.itala.fyi) to a new Next.js + Supabase app in `iTala-connect-webapp`. Features stay the same. What changes is security, structure, testing and the UI brand. The feature list, with a parity code for every row, is in [PRD.md](PRD.md).

**Decisions already made (25/09/2026)**

| Decision | Choice |
| --- | --- |
| Framework | Next.js (App Router), TypeScript strict. Replaces Vite from the CLAUDE.md starting stack. |
| Database | A **new, dedicated** Supabase project (Postgres, Auth, Storage, Realtime). |
| Admin sign-in | **Individual accounts** in Supabase Auth, roles `superadmin` and `admin`. |
| Brand | iTala Connect adopts the iTala logo palette (navy, teal, lime). **Organiser-chosen event colours stay** and fully control each public event page. |
| Existing data | **Migrate, then switch over**, with a repeatable import from Firebase. |
| Mobile integration | **Start with a simple league import** (fetch mobile leagues, create a Connect event from one), then the results inbox, then schedule sync. See [MOBILE_INTEGRATION.md](MOBILE_INTEGRATION.md). Parked long-term plan: [SCHEDULER_INTEGRATION_PLAN.md](SCHEDULER_INTEGRATION_PLAN.md). |
| Hosting | Netlify free tier (Next.js runs through Netlify's automatic OpenNext adapter). |
| Repository | https://github.com/heeaaa/iTala-connect-webapp |
| Supabase project | `iTala-connect-webapp`, https://ephhjzrkbjrhcjrwtknn.supabase.co (URL only; keys go in `.env.local` and Netlify, never in docs or chat) |

## 1. What the old app is, in one paragraph

A zero-build static site (8 script files, about 4,000 lines, no dependencies). All data lives in one Firebase Realtime Database tree `events/{id}` plus `platform/`. Admin "login" compares passwords that are shipped to every browser in `src/config.js`, so the database must accept anonymous writes. The code is careful (stable game ids `gid`, a legacy-score migration, a mobile-results inbox with drift detection, and a Playwright test suite), but the security model cannot be fixed without a server. A full inventory is in PRD.md.

## 2. Why this architecture

| Problem in the old app | How the new architecture removes it |
| --- | --- |
| Passwords and keys in browser JS | Real accounts in Supabase Auth; secrets only in server env; `server-only` imports; CI leak check |
| Database open to anyone | Postgres Row Level Security on every table, plus server-side checks in every Server Action |
| One JSON blob per event, whole-event overwrites | Normalised tables; scores, provenance and links in their own tables with their own writes |
| Positional score keys | Games have a UUID primary key; scores keyed by game id only |
| Raw HTML and unescaped URLs | React escaping, sanitised rules HTML, validated storage paths |
| Browser-only scheduling | Same pure scheduler, run on the server inside one atomic publish |
| Drag and drop not usable on touch or keyboard | dnd-kit with pointer, touch and keyboard sensors |
| Mobile integration via anonymous browser sign-in | Server-only, select-only reader with a cached anonymous session; the browser never sees the mobile project |

## 3. Stack

| Layer | Choice | Notes |
| --- | --- | --- |
| Runtime | Node 24 LTS, pinned in `.nvmrc` and `engines`, same in CI | |
| Framework | Next.js 16.x App Router, React 19, TypeScript `strict` | Confirm the current stable with `npm view next version` at scaffold time. Session refresh lives in `proxy.ts` (Next 16 name for middleware). |
| Styling | Tailwind CSS v4, CSS variables for tokens | Brand tokens and event tokens are separate layers (section 6) |
| Components | shadcn/ui (Radix primitives) where it saves work: Dialog, Popover, Tabs, Toast, Dropdown | Accessible dialogs replace `alert` and `confirm` |
| Forms and validation | zod schemas shared by client forms and Server Actions | |
| Drag and drop | `@dnd-kit/core` | Pointer, touch and keyboard |
| Rich text | Tiptap (StarterKit limited to the old toolbar) + `sanitize-html` on the server | |
| Backend | Supabase: Postgres, Auth, Storage, Realtime | `@supabase/supabase-js` + `@supabase/ssr` |
| Image compression | `browser-image-compression` | |
| PWA | Web app manifest and icons only | No service worker offline promises (CLAUDE.md PWA rules) |
| Tests | Vitest, React Testing Library, Playwright, `@axe-core/playwright`, pgTAP via `supabase test db` | |
| Local backend | Supabase CLI (`supabase start`, Docker) | Replaces the old Local Mode |
| Package manager | npm, committed `package-lock.json` | |

All are maintained FOSS. No paid services, runtime AI calls or app-store distribution.

## 4. Project structure

```
iTala-connect-webapp/
  CLAUDE.md                     project instructions (updated)
  PRODUCT.md                    impeccable init output (design phase)
  DESIGN.md                     approved visual system (design phase)
  .env.example                  committed, names only
  .env.local                    gitignored, real values
  .nvmrc
  next.config.ts                security headers, images config
  src/
    proxy.ts                    Supabase session refresh + admin route guard
    env.ts                      zod-validated server env (imports 'server-only')
    env.client.ts               zod-validated NEXT_PUBLIC_* env
    app/
      (public)/page.tsx                        home
      (public)/events/[eventId]/page.tsx       public event page, ?tab=
      (auth)/login/page.tsx
      admin/layout.tsx                         role gate (getClaims)
      admin/page.tsx                           dashboard
      admin/events/new/page.tsx
      admin/events/[eventId]/page.tsx          editor
      admin/events/[eventId]/results/page.tsx
      admin/import-mobile/page.tsx                    league list, preview, create event
      admin/events/[eventId]/divisions/[divisionId]/mobile-link/page.tsx
      admin/settings/page.tsx
      admin/admins/page.tsx
      legacy-redirect (client component on /)  #/event/{firebaseId} links
    domain/                     pure TypeScript, no I/O, 100% unit-tested
      scheduler.ts  standings.ts  playoffs.ts  matchups.ts
      reconcile.ts  time.ts  colours.ts  mobile-matching.ts
    server/                     'server-only'
      auth.ts                   requireAdmin, requireEventEditor
      repositories/*.ts         typed queries
      actions/*.ts              Server Actions (zod in, typed result out)
      mobile/reader.ts          read-only mobile Supabase client
      storage.ts                signed upload URLs, deletes
    components/                 UI, split by feature
    lib/supabase/{client,server}.ts
  supabase/
    config.toml
    migrations/*.sql            schema, RLS, functions, storage policies
    seed.sql                    local test data
    tests/*.sql                 pgTAP RLS tests
  scripts/
    migrate-firebase.ts         one-off, repeatable import
    golden/                     generators that run the OLD scheduler for fixtures
  tests/
    unit/  component/  integration/  e2e/  fixtures/
  .github/workflows/ci.yml
  docs/PRD.md  docs/MIGRATION_PLAN.md  docs/work-status.md
```

Rule from CLAUDE.md applied here: selection, filtering and scheduling logic (`src/domain`) is separate from UI (`src/components`) and infrastructure (`src/server`).

## 5. Configuration and secrets

`.env.example` is committed with names and placeholder comments only. `.env.local` holds real values and is gitignored, along with every `.env*` except the example. Netlify holds production values in its environment settings.

| Variable | Scope | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Public | iTala Connect Supabase URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public | Publishable key. Public by design; RLS is the boundary. |
| `SUPABASE_SECRET_KEY` | **Server only** | Used only by `scripts/migrate-firebase.ts`, admin invites and storage cleanup. Never used for ordinary reads or writes. |
| `SUPABASE_STORAGE_BUCKET` | Server | Default `images` |
| `NEXT_PUBLIC_SITE_URL` | Public | Canonical URL for auth redirects and share previews |
| `MOBILE_SUPABASE_URL` | **Server only** | Mobile scorekeeper project. Blank = integration off. |
| `MOBILE_SUPABASE_PUBLISHABLE_KEY` | **Server only** | Mobile project key |
| `DEFAULT_EVENT_TIMEZONE` | Server | Default `Pacific/Auckland` |
| `FIREBASE_DATABASE_URL`, `FIREBASE_SERVICE_ACCOUNT_JSON` | **Script only** | Read the old database during migration. Not loaded by the app. Removed after cutover. |

How secrecy is enforced, not just hoped for:

1. `src/env.ts` starts with `import 'server-only'`, so importing it from a client component fails the build.
2. zod validates every value at boot and rejects the old placeholders (`YOUR_`, `change-me`). Errors name the variable, never print the value.
3. No admin passwords exist in env at all. They live in Supabase Auth as bcrypt hashes.
4. CI step `check:secrets` builds, then scans `.next/static` for every server-only value from the CI env and fails on a match.
5. `gitleaks` runs in CI on every push.
6. Netlify deploys from git with a build; no drag-and-drop folder, so `.env` cannot be uploaded by mistake.

Honest note: `NEXT_PUBLIC_*` values are readable by anyone, exactly like the old Firebase config. That is safe only because RLS and Auth now exist. The migration is what makes them safe, not the `.env` file.

## 6. Design and rebrand (impeccable workflow)

The installed Impeccable skill (v4.3.1) drives this. Its launcher could not run from this planning session (the design scripts live on your computer and need a local shell), so the steps below are the plan; they run at the start of the design phase.

1. `impeccable context`, then `impeccable init` to write `PRODUCT.md`: audiences, jobs and tone from PRD.md section 1. Two surface briefs: **Operate** (admin dashboard and editor) and **Read/Operate** (public event page).
2. `impeccable shape` confirms the brief (the answers already given: logo palette for the platform, organiser colours for event pages).
3. CLAUDE.md design workflow: two browser-previewable directions of the **"Today" screen**, which for iTala Connect is the public event page Schedule tab on a game day (today's games, live scores, team filter), at 390 px and 1440 px. Recommend one, **wait for your choice**.
4. Record the approved system in `DESIGN.md`: palette, type, spacing, layout, components, states, motion.
5. Build screens, then `impeccable audit` and `impeccable polish` per surface; Vercel Web Design Guidelines for UI review; Vercel React Best Practices during implementation.

**Brand direction to explore (from the logo)**

- Navy wordmark as the anchor for text and primary actions, teal as the main accent, lime used sparingly for live and success states, white and near-white surfaces for the admin tool. The old black-and-yellow shell is retired for platform screens.
- Admin screens are **Operate** mode: dense, calm, highly scannable tables and grids.
- Public event pages are **Read** mode for spectators on phones: big legible times, courts and scores.

**Two theme layers (so organiser colours are never affected)**

| Layer | Where it applies | Source |
| --- | --- | --- |
| Brand tokens `--brand-*` | Home, login, admin, settings, iTala Connect chrome | DESIGN.md |
| Event tokens `--ev-primary`, `--ev-bg`, `--ev-text`, `--ev-text-sec`, `--ev-heading` | Everything inside `/events/[eventId]` | The event's five saved colours (E-19) |

Event pages set the event tokens on the page root and all event components read only `--ev-*`. A small "Powered by iTala Connect" footer is the only brand element inside an event page. A regression test renders an event with non-default colours and asserts the computed colours of header, tabs, table and chips match the event, not the brand.

## 7. Data model (Supabase Postgres)

All ids are UUIDs. Every migrated row keeps its old key in a `legacy_*` column so the import is repeatable and old links resolve.

| Table | Key columns | Notes |
| --- | --- | --- |
| `profiles` | `id` (= `auth.users.id`), `display_name`, `role` (`superadmin`, `admin`), `disabled_at` | Created by trigger on sign-up; role changes only by superadmin |
| `platform_settings` | singleton: `default_rules_html` | |
| `platform_sponsors` | `id`, `tier` (`primary`, `secondary`), `image_path`, `sort_order` | |
| `events` | `id`, `legacy_firebase_id` unique, `owner_id`, `legacy_created_by` text, `name`, `status` (`draft`, `published`), `schedule_days date[]`, `time_start time`, `time_end time`, `courts` 1-10, `court_names text[]`, `timezone` (default `Pacific/Auckland`), `logo_path`, `theme_primary`, `theme_bg`, `theme_text`, `theme_text_secondary`, `theme_heading`, `rules_html`, `published_at`, timestamps | Colours checked as `#RRGGBB` |
| `event_sponsors` | `id`, `event_id`, `tier` (`major`, `minor`), `image_path`, `sort_order` | At most one major per event |
| `divisions` | `id`, `event_id`, `legacy_key`, `name`, `color`, `bracket_count` 1-4, `custom_games_per_team`, `games_per_team` 0-20, `sort_order` | |
| `teams` | `id`, `division_id`, `legacy_code`, `name`, `coach`, `sort_order` | `sort_order` preserves insertion order, which the scheduler depends on |
| `players` | `id`, `team_id`, `name`, `number text`, `sort_order`, `mobile_player_id` text null | `mobile_player_id` is set by the mobile league import; groundwork for player stats |
| `games` | `id` (the stable game id), `event_id`, `division_id` nullable, `legacy_gid`, `legacy_index`, `legacy_team1`, `legacy_team2` (raw codes, kept when a team no longer exists), `day date` null, `start_time time` null, `court` int, `group_id` (A-D) null, `team1_id` null, `team2_id` null (null = TBD), `label`, `type` (`group`, `semi`, `final`), `is_playoff`, `bracket_game_id`, `team1_source jsonb`, `team2_source jsonb`, `playoff_round`, `position` | Unique (event, day, start_time, court) where scheduled; `team1_id <> team2_id`. `bracket_game_id` is **not** unique (a second playoff on a division reuses ids; first match wins, as today). |
| `game_scores` | `game_id` PK, `s1`, `s2` (nullable ints, 0 or more; the UI caps at 300 but imports keep any old value and report outliers), `updated_at`, `updated_by` | Separate from `games` so editor saves never touch scores. In the Realtime publication. |
| `score_sources` | `game_id` PK, `mobile_game_id`, `league_id`, `s1`, `s2`, `home_pts`, `away_pts`, `event_count`, `last_event_at`, `finished_at`, `approved_by` uuid null, `approved_by_legacy` text, `approved_at`, `method`, `dismissed_at` | Admin-only |
| `division_mobile_links` | `division_id` PK, `league_id`, `league_name`, `season`, `linked_at`, `linked_by` uuid null, `linked_by_legacy` text | Admin-only |
| `division_mobile_team_links` | `division_id`, `team_id`, `mobile_team_id` | Unique (division, team) and (division, mobile team): enforces one-to-one in the database |
| `audit_log` | `id`, `actor_id`, `action`, `event_id`, `detail jsonb`, `at` | No insert, update or delete policy for any role: rows are written only by the `security definer` functions and triggers, so admins cannot forge or erase entries |

**Postgres functions (atomic operations, `security invoker` so RLS still applies)**

- `publish_event(event_id, games jsonb, clear_scores bool)`: in one transaction, replace games, optionally clear scores and provenance, set status and `published_at`, write the audit row.
- `append_games(event_id, games jsonb)`: round robin and playoff additions.
- `swap_games(a, b)`, `move_game(id, day, time, court)`, `unschedule_game(id)`: drag and drop, with the slot uniqueness constraint as the final guard.
- `set_score(game_id, s1, s2)`: upsert score, delete provenance (manual edit), audit.
- `approve_mobile_result(game_id, s1, s2, source jsonb)`: score and provenance together.
- `is_event_editor(event_id)` and `is_superadmin()`: `security definer`, `set search_path = ''`, `stable`, and both return false for a profile with `disabled_at` set. Used by policies; defined so they do not recurse through RLS.
- `profiles.role` and `profiles.disabled_at` can only be changed by a superadmin (column-level check in a trigger). Disabling an admin also bans the user in Supabase Auth and revokes their sessions through the server-only admin API.

The scheduler itself stays in TypeScript (the ported pure function). The server computes games, then hands them to `publish_event` in one call, so a failure changes nothing (E-62).

## 8. Row Level Security

| Data | Anonymous visitor | Admin | Superadmin |
| --- | --- | --- | --- |
| Published events and their divisions, teams, players, games, scores, sponsors | Read | Read | Read |
| Draft events and children | None | Read and write own | All |
| Event writes (all child tables) | None | Own events (`is_event_editor`) | All |
| `score_sources`, mobile links | None | Own events | All |
| `platform_settings`, `platform_sponsors` | Read | Read | Read and write |
| `profiles` | None | Read own | Read and write all |
| `audit_log` | None | Read own events | Read all |
| Storage `images` bucket | Read (public URLs) | Write under `events/{own event id}/` | Write anywhere, including `platform/` |

Storage bucket settings enforce, on the server: allowed MIME types `image/png`, `image/jpeg`, `image/webp` (SVG blocked), and a 5 MB object limit. A new, unsaved event gets its id created on first upload or first save (draft row), so there is no shared `draft/` path. Draft images are reachable only by their unguessable URL; this matches today and is noted rather than solved.

Every policy gets a pgTAP test for allowed and denied cases (section 10). Realtime subscriptions respect RLS, so spectators only receive score changes for published events.

## 9. Application behaviour notes

- **Auth**: `proxy.ts` refreshes the Supabase session cookie. Server code uses `supabase.auth.getClaims()` to protect pages and actions, never `getSession()` (Supabase's documented warning). `admin/layout.tsx` gates the whole admin area; each action re-checks.
- **Server Actions**: every mutation is a Server Action that parses input with zod, checks the role and event ownership, calls Postgres through the user's session client (so RLS applies), and returns a typed result for toasts and inline errors.
- **Public page**: Server Component renders the event, then a client island subscribes to `game_scores` and `games` changes for that event over Realtime and updates the schedule and standings (P-07). Playoff resolution and standings run in `src/domain` on both server and client, so they always agree.
- **Autosave**: debounced (600 ms) for the E-05 triggers, with a visible "Saving... / Saved" status.
- **Legacy links**: old links look like `/#/event/{firebaseId}`. A small client component on `/` reads `location.hash`, calls a server lookup by `legacy_firebase_id`, and replaces the URL with `/events/{id}`.
- **Images**: the server issues a signed upload URL for a path under the event; the browser compresses and uploads directly; the server records the path and deletes the previous object.
- **Mobile integration**: `src/server/mobile/reader.ts` holds the only client for the mobile project, select-only. It reads as an **anonymous session created on the server and cached** (O-3), refreshed server-side, never one sign-in per request. Import actions (stage 1) and the Results page (stage 2) are server-rendered. Details: MOBILE_INTEGRATION.md.
- **Caching and CSP**: a nonce-based CSP makes pages dynamic. Public event pages are dynamic anyway (live data), and score updates arrive over Realtime, so the LCP target (X-06) is met through small server payloads and streaming rather than static caching. Home can use a strict hash-based CSP and short revalidation instead. Confirm with a measured LCP in phase 8.

## 10. Testing strategy (CLAUDE.md "Verification is required")

| Level | What | Tool | Gate |
| --- | --- | --- | --- |
| Golden parity | Run the **old** `scheduler.js`, standings, playoff resolution, matchup counting and `integration.js` matching over a fixture library (small, odd, large, multi-division, bracketCount 2-4, custom games, partial scores, ties, byes, time windows that do not fit), save outputs as JSON, and assert the new TypeScript produces **identical** output | Node script in `scripts/golden/` + Vitest | Required |
| Unit | `src/domain/*` plus zod schemas, time parsing (`h:mm AM` to `time`), colour maths, reconciliation counts | Vitest, fake timers, seeded data | 80% lines and branches minimum, domain aims for 100% |
| Component | Editor sections, game dialog validation messages, calendar keyboard use, players dialog keeps unsaved rows (E-24), filter chips, theme layering | React Testing Library | Required |
| Database | Every RLS row in section 8 allowed and denied; publish atomicity; slot uniqueness; one-to-one mobile links | pgTAP via `supabase test db` against local Supabase | Required |
| Integration | Server Actions against local Supabase with real auth users for each role; migration script against a fixture Firebase export | Vitest + Supabase CLI | Required once built |
| E2E journeys | (1) Admin creates event, adds divisions and teams, publishes, sees schedule. (2) Drag and drop swap, move, unschedule, keyboard move. (3) Enter score, second browser sees it live, standings update, playoff seed resolves. (4) Re-publish warning, decline changes nothing. (5) Mobile inbox approve with mocked mobile API. (6) Public filter, tabs in URL, legacy hash redirect. (7) Admin cannot open another admin's event. (8) Draft not visible publicly. (9) Import from iTala mobile (mocked): league list, preview, create event, teams and players present, division shown as linked, second import warns. | Playwright, isolated seeded data, traces on failure | Required for affected journeys |
| Accessibility | axe-core on home, event page (each tab), login, dashboard, editor, results | `@axe-core/playwright` | No serious or critical violations |
| Security | Secret scan of build output, gitleaks, security headers present, rules HTML sanitiser tests with XSS payloads | CI scripts | Required |
| Visual | Screenshots at 390 px and 1440 px for key screens, reviewed by a person, never auto-updated | Playwright | Reviewed on UI changes |

The old suites' claims are all carried over as new tests: `repro-index-bug` and `gid` (scores stay on their game after insert and delete), `integration` (every match state, orientation, zero writes to mobile), `review-fixes` cases 1 to 9, `regression` standings maths, `deploy` (replaced by the build and secret checks).

**Mobile integration in CI** is mocked (recorded fixture responses of leagues, teams, players and finals, including closed, archived, recreational, team-only, empty and unreachable cases). Every mobile test asserts that no insert, update, delete or RPC call reaches the mobile project. A separate manual check against the real mobile project is marked NOT RUN until done, per CLAUDE.md.

## 11. CI (GitHub Actions)

One workflow on pull requests and pushes to the default branch, `permissions: contents: read`, actions pinned to commit SHAs, `concurrency` cancels superseded runs, Node from `.nvmrc`, `npm ci`.

Jobs: `lint` (ESLint + Prettier check), `typecheck` (`tsc --noEmit`), `unit` (`vitest run --coverage` with thresholds), `db` (`supabase start` then `supabase test db`), `integration`, `build` (`next build` + `check:secrets`), `e2e` (Playwright against the built app and local Supabase, uploads traces and reports, 14-day retention), `gitleaks`. No secrets are exposed to fork PRs. Branch protection with required checks is set in GitHub settings (manual step, CLAUDE.md).

**npm scripts** (to be created at scaffold; none exist yet):

| Command | Contract |
| --- | --- |
| `npm ci` | Install from lockfile |
| `npm run dev` | `next dev` |
| `npm run lint` | ESLint + Prettier check |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test:unit` | `vitest run` |
| `npm run test:coverage` | `vitest run --coverage` with thresholds |
| `npm run test:db` | `supabase test db` |
| `npm run test:integration` | Vitest integration project against local Supabase |
| `npm run test:e2e` | Playwright |
| `npm run build` | `next build` |
| `npm run check:secrets` | Scan build output for server-only values |
| `npm run golden` | Regenerate golden fixtures from the old code (manual, reviewed) |
| `npm run migrate:firebase -- --dry-run` | Import preview and report |

## 12. Data migration and cutover

### 12.1 Import script (`scripts/migrate-firebase.ts`)

1. **Read** the old database with a Firebase service account (or a JSON export from the Firebase console). Read-only.
2. **Normalise** each event exactly as the old app's `migrateEventScores` does: assign gids to rows missing them or with duplicates, strip `_*` fields, take `scoresById[gid]`, fall back to positional `scores[i]` only if the event has no `scoresMigratedAt`.
3. **Map** fields, and **report** everything unusual rather than failing or silently dropping it: `h:mm AM` text to `time`; `""` or `"TBD"` day to unscheduled; `"TBD"` teams to null; team codes to team UUIDs; `divId` not found to `division_id` null (kept, flagged in the report); `createdBy` `superadmin` or `admin` to the owner chosen in O-1, keeping the raw value in `legacy_created_by`; `approvedBy` and `linkedBy` ("superadmin", "admin", "unknown") into the `*_legacy` text columns; team codes that no longer exist to null with the raw code kept in `legacy_team1/2`; duplicate slots (possible from the old playoff overflow) keep the first game and move the rest to Unscheduled; out-of-range values (`courts`, `games_per_team`, `bracket_count` NaN, negative or huge scores) imported as-is where the column allows, otherwise clamped, and always listed; any non-null `s1`/`s2` stored directly on schedule rows listed. Team `sort_order` comes from the key order the old app iterated (Firebase lexicographic key order), not creation time, so the golden parity check holds.
4. **Images**: URLs already in the old Supabase bucket are copied into the new bucket; base64 data URIs are decoded and uploaded; the event stores the new path.
5. **Upsert** by `legacy_*` keys so the script can run many times. `--dry-run` writes nothing and prints the report.
6. **Archive** the raw Firebase export (including positional `scores/{idx}`) as a dated, access-restricted file for at least one season, as the old decommission plan intended.
7. **Report and verify** per event: counts of divisions, teams, players, games, scored games, unscheduled, orphaned; and a **computed-output diff**: standings and resolved playoff teams from the old code on the old data versus the new code on the imported data must match.

### 12.2 Cutover runbook

1. Import to a staging Supabase project, fix every report issue, repeat until clean.
2. Run both sites side by side for one event weekend if possible (new app read-only on a staging URL).
3. Announce a freeze window. Make the old database read-only by **changing the Firebase rules** (`.write: false`). Hiding the admin screens is not enough, because the old database accepts writes from anyone.
4. Final import into production, verify the report.
5. Point connect.itala.fyi at the Netlify Next.js site. Keep the old site at a separate read-only URL for one season.
6. After a season, disable the Firebase database writes permanently and remove `FIREBASE_*` from every environment.

Rollback: until step 5 the old site is untouched and live. After step 5, DNS can be pointed back within minutes; any scores entered in the new app in that time are listed from `audit_log` for re-entry.

## 13. Phases and acceptance criteria

| Phase | Scope | Done when | Rough effort |
| --- | --- | --- | --- |
| 0. Now | Rotate the two old admin passwords (they are public in `config.js`); check the live Firebase rules | New passwords set; rules reviewed | 0.5 day |
| 1. Foundations | Scaffold Next.js, Tailwind, ESLint, Vitest, Playwright, CI, env validation, Supabase local, schema, RLS, pgTAP, auth (login, roles, proxy), admin shell | CI green with real tests; RLS tests pass; login works for each role; `check:secrets` passes | 4-6 days |
| 2. Domain port | `src/domain` modules and golden parity suite | Every golden fixture identical; coverage thresholds met | 3-4 days |
| 3. Design | impeccable init, shape, two "Today" directions, your choice, DESIGN.md, tokens and core components | You approve a direction; DESIGN.md committed | 3-4 days |
| **3b. First slice: mobile league import** | Server-only mobile reader; admin dashboard (list, new, delete); **Import from iTala mobile** (list, preview, create draft event with division, teams, players, link); editor Event details and Divisions sections so the imported event can be completed; stage 1b roster refresh if time allows | PRD MI-01 to MI-08 pass against mocked mobile fixtures; E2E journey 9 passes; zero writes to the mobile project asserted; then, on your go-ahead, one real league imported and checked by eye | 4-6 days |
| 4. Public pages | Home, event page tabs, filter, realtime scores, standings, teams, rules, legacy redirects, share previews | PRD H-*, P-* rows pass; E2E journeys 3 and 6 pass; axe clean | 4-5 days |
| 5. Admin | Rest of the dashboard and editor (all remaining E-* rows), settings, admins screen | PRD D-*, E-*, S-*, A-* rows pass; E2E journeys 1, 2, 4, 7, 8 pass | 8-12 days |
| 6. Mobile results inbox | Link wizard (for divisions created by hand), results inbox | PRD M-* rows pass with mocked API; one manual check against the real mobile project | 3-4 days |
| 7. Migration | Import script, staging import, verification diff, cutover | Report clean on a full copy of production; cutover runbook done | 3-5 days |
| 8. Hardening | impeccable audit and polish, performance budget, security headers review, PWA manifest, independent review | X-* rows met; review findings closed | 2-3 days |

Order matters: 1 and 2 can overlap; 3 must finish before 3b, 4 and 5 build real screens (CLAUDE.md: wait for the direction choice); **3b is the first feature slice**, so the mobile connection is proven early on real screens; 7 needs 4 to 6.

## 14. Risks

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Scheduler port changes schedules subtly | Medium | High | Golden parity tests against the old code, including tie-break and floating-point pick scores |
| Imported events render differently | Medium | High | Computed-output diff in the migration report; side-by-side weekend |
| Old shared links break | Medium | Medium | Legacy hash redirect plus `legacy_firebase_id` lookup |
| Supabase free project pauses after 7 idle days | Medium | High during an event | Keep-alive ping (as the mobile app does); check before each event |
| Organiser colours with poor contrast | High | Low | Warning in the editor, never a block |
| Per-person ownership changes who can edit what | Medium | Medium | O-1 decides owners at import; superadmin can reassign |
| Mobile project schema drift (`event_count`, `last_event_at` not in the documented view) | Medium | Medium | Confirm the live view first; integration tests pin the expected columns |
| Netlify free-tier function limits during a busy event | Low | Medium | Public pages cache for a short time and use Realtime for scores rather than polling |
| Supabase free plan allows a limited number of active projects per organisation (mobile app, old image storage, new Connect) | Medium | Medium | Check the organisation's project count now; move the old image project's objects into Connect and pause or delete it after cutover |
| No usable backups on the free plan | Medium | High | Scheduled `pg_dump` (GitHub Actions, weekly and before each event) to private encrypted storage, with a tested restore |
| Scope creep during rewrite | Medium | Medium | PRD parity codes; anything New needs a row and your sign-off |

## 15. Open decisions

| # | Decision | Options | Suggested |
| --- | --- | --- | --- |
| O-1 | Owner of events created by the shared `admin` login | One named admin account owns all; superadmin owns and reassigns later | Superadmin owns, reassign in the dashboard |
| O-2 | Admin screen for inviting admins (A-09) in this migration or later | Now; later (use Supabase dashboard meanwhile) | Now, it is small |
| O-3 | Mobile reader credentials | Anonymous session created and cached on the server; dedicated email account | **Anonymous, cached server-side** (decided 25/09/2026 after reading the mobile schema: a non-anonymous account can write to shared recreational leagues, an anonymous one cannot). Per-request sign-in is ruled out. |
| O-4 | Event time zone default | `Pacific/Auckland`; `Asia/Manila`; per event with no default | Per event, default from `DEFAULT_EVENT_TIMEZONE` |
| O-5 | Keep the old site after cutover | Read-only for one season; turn off at cutover | Read-only for one season |
| O-6 | Domain | Same connect.itala.fyi; new subdomain first | Staging subdomain, then move connect.itala.fyi |
| O-7 | Fix list in PRD (all rows marked Fix) | Accept all; review individually | Review in one sitting before phase 5 |

## 16. Mobile app direction

The long-term mobile plan is parked, unchanged, in [SCHEDULER_INTEGRATION_PLAN.md](SCHEDULER_INTEGRATION_PLAN.md) (copied from `iTala/docs` on 25/09/2026). It was written against the Firebase scheduler. iTala Connect already provides that plan's Phase 0 prerequisites (stable game UUIDs, time zone per event, scores keyed by game id, real auth), and the league import in phase 3b creates the league-to-division pairing and team map from day one, so no name matching is needed for imported leagues. The mobile "pull the schedule" feature becomes a small read-only endpoint on this database after cutover and should be planned then. Build decisions made now should not block it: keep game ids stable, keep `division_mobile_links` and the team map authoritative, and keep `mobile_player_id` on imported players. The full staged roadmap is in [MOBILE_INTEGRATION.md](MOBILE_INTEGRATION.md).

## 17. Sources checked

- [Supabase: Setting up Server-Side Auth for Next.js](https://supabase.com/docs/guides/auth/server-side/nextjs) (env names, `proxy.ts`, `getClaims`)
- [Supabase: API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [Netlify: Next.js on Netlify](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/) (automatic OpenNext adapter, App Router support)
- [Next.js blog](https://nextjs.org/blog) and [releases](https://github.com/vercel/next.js/releases) (confirm version at scaffold)
