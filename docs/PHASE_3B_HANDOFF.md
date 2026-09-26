# Phase 3b handoff to Claude

Updated 26/09/2026, 13:00 NZ time. User authorised implementing Phase 3b and thorough local Docker testing. User requests continuous written checkpoints; latest budget reported 29% remaining.

## Resume here

Live update13:08: Runtime trace proves Back handler DOES run and restores URL, but Next's earlier popstate handler has already queued a route transition. Added history.replaceState(null, '', currentURL) after restoring saved entry to invoke Next's public History integration and restore route state too. Rebuilding/testing now. Current diagnostic instrumentation exists temporarily in the new E2E test (GUARD console/add/remove listener trace); remove before finish. Lint and secret scan passed before this latest change. No final pass yet.

Live update13:04: Back's native confirm proved timing-dependent (one diagnostic run passed, others missed prompts). Replaced it with the existing accessible confirmation dialog: capture popstate, restore current history entry before Next listener, ask, then remove guard and traverse on Continue. Rebuilt successfully; running the focused Back/Sign out test twice per viewport to resolve the timing risk. Temporary CDP/debug logging removed. Prettier auth.spec.ts fixed. No final pass claimed yet.

Implementation exists and is uncommitted. Do not restart. Current active defect: unsaved browser Back protection in `src/app/admin/events/[eventId]/draft-editor.tsx`. Sign out guard now works, but the new E2E `guards unsaved edits on sign out and browser Back` fails on both viewports: expected native confirmation after `history.back()`, received no prompt and navigated to New event. Listener is registered on window popstate with capture=true while dirty; investigate why it does not fire before routing. Sign out cancel reaches this assertion successfully. Next app-router source has its own non-capture popstate listener. No production/mobile connection allowed yet.

## Exact current evidence

- Local Docker: all four new migrations applied, generated types current.
- `npm run test:db`: 6 files, 145 assertions PASS.
- `npm run test:integration`: 2 files, 21 tests PASS, includes simultaneous duplicate import serialization.
- `npm run test:coverage`: 24 files, 546 tests PASS, 96.27% lines / 93.36% branches; domain thresholds remain100%.
- Latest production build PASS, includes TypeScript. Existing Big Shoulders fallback-font warnings.
- `node --env-file=.env.local --import tsx scripts/check-secrets.ts`: PASS after latest build (requires elevation due Windows sandbox Node userInfo failure; no secrets printed).
- Full browser suite before review fixes: 56/56 PASS. Earlier4 failures were strict matching against new Edit/Delete accessible names; fixed exact cell selectors in tests/e2e/auth.spec.ts.
- Latest focused browser suite after review fixes:6 passed,2 failed (new Back test described above). Do not claim latest tree fully passes.
- Latest lint: ESLint passed, Prettier flagged tests/e2e/auth.spec.ts; run Prettier on that file.

## Implemented

- Server-only mobile anonymous auth with cached session/refresh and select-only DB transport; paginated reads, validation, timeout, safe errors. No production mock switch.
- League list/filter/error/retry, ordered preview/team-only/small league, duplicate warning, atomic import transaction creates draft/division/teams/players/mobile links/maps/audit; preserves mobile player ids.
- Dashboard new/delete/list/division count, draft editor dates/courts/timezone/colours/contrast warning/divisions/teams/players, optimistic atomic save. Remembered collapse state tested.
- Durable image cleanup: deleting event queues a job in same DB transaction, then service cleanup removes ONLY deleted event prefix. Failure retains queue; authorised dashboard retry. Unit failure tests, pgTAP queue RLS, and actual nested Storage upload/delete E2E pass. Never delete images before DB commit.
- Four migrations:20260926000100_mobile_import;00200_draft_editor;00300_event_insert_visibility (fixes stable owner helper failing INSERT RETURNING);00400_image_cleanup.
- Browser mock server127.0.0.1:3211, app3100; synthetic fixtures documented in tests/fixtures. Per-test organiser accounts isolate imports. Real mobile NOT RUN.

## Review checkpoint

Impeccable skill and React best-practices read; context run ONCE. Existing Broadcast Package preserved. Detector run ONCE over changed UI: `.impeccable/review/phase3b/detector.json` =[]. No detector rerun.

Independent reviewer `/root/impeccable_finish_reviewer` returned FIX with exactly two findings:
1. Plain action links/buttons below44px. Fixed `.actions a,.actions button` min-height2.75rem + inline-flex alignment.
2. Unsaved guard misses Sign out and browser Back. Sign out capture submit guard implemented, Cancel/Continue regression added. Back capture popstate + native confirm attempted but regression still fails.

After correcting Back: build, run focused tests, recapture same screenshots, send reviewer followup for verdict on those two fixes. Required screenshot paths `.impeccable/review/phase3b/{desktop,mobile}/{preview,editor}.png`; current captures already reflect44px fix. Mobile screenshot device scale is1024px image for390CSS viewport. All four captures opened twice before reviewer; no additional self-polish hunts. Finish reviewer skill explicitly authorizes this subagent. After final reviewer verdict, spawn mandated documenter fresh, preserve DESIGN.md and .impeccable/design.json (pre-existing drift must not be repaired unasked). No agents for general development.

## Remaining finish steps

1. Fix/verify browser Back cancellation and acceptance, Sign out cancel/confirm; do not weaken assertions. Reproduce evidence exists for Sign out before fix (missing confirmation) and Back after attempted fix (no native prompt).
2. Format auth.spec.ts. Build then full58 browser tests (two new cases, one per viewport); check lint and final secret scan. Unit546/DB145/integration21 already pass; only rerun if changed relevant code.
3. Finish reviewer verdict, documenter; update this handoff, work-status, MOBILE_INTEGRATION and CLAUDE status consistently. Do not claim real-mobile validation.
4. Phase5 next: complete publish/schedule editor, rules/logo/sponsors/media editing and published editing. Phase6 results inbox. Optional stage1b roster refresh later. MI07 currently stable link/map readiness only, inbox not built.

## Transfer and safety

Everything is uncommitted including many new/untracked files. No push, PR, deployment or hosted migration. Other laptop needs all tracked and untracked implementation files; a plain pull will not include them. Do not transfer.env.local, credentials,node_modules,.next,test-results,Docker data. Regenerate local env via npm run env:local. Node24.19/npm11.17, Docker Desktop4.92, Supabase CLI2.117. Local stack running.

Preserve earlier Docker fixes:.prettierrc endOfLine auto; package-lock missing@emnapi entries; scripts/local-env.ts Windows spawn fix; tests/e2e/seed-public-event.ts row handling and tests/e2e/public-event.spec.ts404/viewport score reset.

Duplicate warnings show only RLS-visible events; never disclose another organiser's private draft. Server action input is validated and mobile data reread; SQL uses session RLS. Cleanup service client is limited to queued deleted-event images. Mock mobile DB writes asserted zero; Auth signup/refresh POST are intentionally allowed. Real mobile connection/import needs user's explicit go-ahead and configuration, not part of current authorization.
