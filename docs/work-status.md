# Work status

Last updated: 26/09/2026 (Claude, work laptop)

## Current handoff (27/09/2026, Claude on the work laptop)

**Where things are:** Phase 3b is code complete. Phase 5 is done (5a to 5e, its journeys and the 5e finish review), and so is Google sign-in (A-11). **Phase 6 is code complete against the recorded mobile fixtures:** 6a (read-only inbox, dashboard Results), 6b (approve, re-approve, keep, attach) and 6c (link wizard for divisions made by hand), all pushed on branch `handoff/codex`. Its one manual check against the real mobile project stays **NOT RUN** until you say go. **Phase 7 is IN PROGRESS:** 7a (the dry-run planner and verification report) and 7b (the writer, `--apply`) are done; next is 7c (images). **The old site runs the older build** (scores by position); the import follows it (7b section). **Migrations to push to the hosted project after CI passes, in order:** `20260927000100_platform_sponsor_paths.sql`, `20260927000200_admin_accounts.sql`, `20260927000300_keep_published_score.sql`, `20260927000400_division_mobile_link.sql` and `20260927000500_legacy_import.sql` (and 5d's `20260926000700_rules_and_images.sql` if that is not pushed yet).

**Old app down (27/09/2026):** connect.itala.fyi shows `permission_denied at /events` because the old Firebase database's "test mode" rules expired at 00:00 today (Auckland). Nothing in this project changed them; the data is still there. The fix is yours in the Firebase console (Realtime Database, Rules): move the expiry date forward and Publish, knowing the rules stay open to anyone with the address. For Phase 7, the importer should read with proper credentials rather than rely on open rules.

**CI now runs the Docker suites.** Draft PR https://github.com/heeaaa/iTala-connect-webapp/pull/1 (`handoff/codex` into `main`, not for merging yet) runs the full workflow on every push. **Run 36214770961 on `cd75ff2` was fully green:**
- 60/60 E2E (390 and 1440 px), 154/154 pgTAP and 22/22 integration.
- Lint, typecheck, unit coverage, build, `check:secrets` and gitleaks.
- This is the first real-Supabase proof of the Phase 3b guard (signed-in Sign out and Back), publish and published editing.
- The first run failed only on my new publish E2E: `getByRole('alert')` also matched Next's route announcer. That was fixed by scoping to `main`.

Latest green run: **36289258765 on `aee70e4` (6c, Phase 6 complete): 80/80 E2E, 257/257 pgTAP, 29/29 integration, 800 unit and component tests**, with lint, typecheck, build, `check:secrets` and gitleaks passing. Before that: 36277814542 on `cd13f54` (6b plus the fixture fix): 78/78 E2E, 246/246 pgTAP. Earlier: **36275201647 on `3a46ce9` (5e done, journey 4 added): 76/76 E2E with no retries, 238/238 pgTAP**, with integration, unit coverage, lint, typecheck, build, `check:secrets` and gitleaks all passing. Earlier: 36246633926 on `562592f` (5e-1): 72/72 E2E, 220/220 pgTAP. Before that: 36240866715 on `b2315e2` (5d): 70/70 E2E, 207/207 pgTAP, 22/22 integration. The run before that (36239532684 on `8919912`) had one flaky retry in the Phase 3b guard test, a timing bug in the test that `b2315e2` fixed (see the 5d section). Before 5d: 36234713687 on `167c8e7` (5c-3) was 68/68 E2E with 180 pgTAP. Check the PR's latest run after each push (`gh pr checks 1`). The Docker PC is no longer required for routine verification.

**Important for the Docker PC:** 5b adds migration `20260926000500_event_editor.sql` (replaces `save_draft_editor` with `save_event_editor`). Apply it (`npm run db:reset` on the local stack), then run `npm run db:types`. `src/lib/supabase/database.types.ts` was hand-edited for the new function and must come out with **no diff**; if it differs, keep the generated file.

**Laptop split.** The work laptop has no Docker, so pgTAP, integration and E2E are **NOT RUN** there. It proves UI in real Chromium through a local-only harness route (`src/app/prototype/zz-*`, excluded in `.git/info/exclude`, never committed). On the Docker PC, after `git pull`, run:

```bash
npm ci && npm run db:start && npm run env:local
npm run test:db && npm run test:integration
npm run lint && npm run typecheck && npm run test:coverage
npm run build && npm run check:secrets && npm run test:e2e
```

- Expected: **80 E2E tests**, **290 pgTAP assertions** (257 green in CI plus 33 in `014_legacy_import.sql`) and **35 integration tests** (29 plus 6 in `legacy-import.test.ts`). Run `npm run db:reset` for the new migrations; `npm run db:types` must show no diff.
- Expected: **29 integration tests** (22 plus 7 in `admin-accounts.test.ts`).
- Record the results here. If `admin-publish.spec.ts` or the guard test fails, follow reproduce, fail, fix, pass.

### Phase 3b close-out (26/09/2026)

- **Back guard fixed.**
  - Root cause: Next 16's own popstate listener always routes and cannot be cancelled, so the earlier attempts raced it.
  - Fix: `src/app/admin/_components/use-unsaved-guard.ts` keeps a same-URL history entry on top while there are unsaved edits. Back lands on the page itself, and the accessible dialog asks. Continue goes back two entries. After a save the entry is skipped silently, and a link Continue replaces it.
  - Also fixed: Done in the players dialog falsely asked "Discard unsaved changes?". Forms that stay on the page now use `data-keeps-page`.
- **Evidence (harness, Chromium, 390 and 1440 px):**
  - The HEAD code failed the new guard spec at the players dialog, and with that step skipped failed at the Back prompt on both viewports.
  - The fixed code passed 10/10 (5 repeats) and later 18/18, including a real server-action Sign out.
  - The Codex GUARD diagnostics were removed from `tests/e2e/mobile-import.spec.ts`, and the guard E2E was extended.
- **Finish review (fresh reviewer, verdict pass):** 44 px targets resolved; guard resolved after a recapture round with Sign out continue frames and video. Disposition **ship**, scoped to those two findings.
- **Documenter:** DESIGN.md and `.impeccable/design.json` extended with the admin patterns: action rows, danger text, confirmation dialog, players dialog, calendar, editor sections and workspace notices. Existing system preserved.
- **Design drift reported, not repaired (for the Phase 8 Impeccable audit):**
  - Plain-text secondary actions (Cancel, Expand all, Collapse all).
  - "+" used as an icon.
  - Dialogs and league rows missing the corner cut.
  - Two notice styles.
  - Editor section heading weight and case.
  - Admin forms 65rem wide against the documented 26rem.
  - The Lime Is Air Time rule text is out of date for the Dashboard.
- **Still NOT RUN:** the real signed-in E2E for the guard, the import preview recapture, and the real mobile league import (needs your explicit go-ahead).

### Phase 5a: publish and matchup report (26/09/2026)

- **E-60:** `src/domain/publish.ts` holds the old messages in the old order. Fix: every division needs 2 teams, and the short ones are named.
- **E-61:** `src/lib/schedule-rows.ts` maps stored rows to the scheduler input exactly as the golden suite does (teams by `sort_order`, games per team only when ticked with a value above 0) and maps games back to insert rows.
- **Action:** `src/server/actions/publish.ts` re-reads the saved event (never client state), validates, generates, counts recorded scores, then calls the atomic `publish_event`.
- **E-62:** it asks with the count, or says it could not count, and clears only on Continue. A `scores_exist` race asks again.
- **E-02 editor:** drafts show Save draft (teal) and Publish (the one lime action). Publish saves unsaved edits first. The toast reads "Published with N game(s).", then the page refreshes into the published view.
- **E-30, E-31:** Team matchup report section.
  - Per division, an N x N grid with sticky headers, horizontal scroll, and repeats outlined in red with a tooltip.
  - Chips: total games, repeated matchups, pairings not scheduled. The heading meta shows the repeated count.
  - Hints: no divisions, and fewer than 2 teams.
  - It uses the editor's current divisions, so unsaved team edits show at once.
- Refactor: `gamesFromRows` extracted from `toEventModel` (`src/lib/public-event/model.ts`), with no behaviour change; public model tests pass.
- **Evidence (work laptop):**
  - Lint and typecheck pass. `test:coverage`: 26 files, **564 tests pass**, 96.34% lines and 93.61% branches, `src/domain` 100%.
  - A clean `next build` without the harness passes, and `check:secrets` passes.
  - Harness: axe finds no serious or critical issues on the editor with the matchup report. Capture: `.impeccable/review/phase5a/{mobile,desktop}/editor.png`.
  - **Correction (found in 5c-1):** the "no sideways scroll" check was blind on mobile emulation. It compared against `innerWidth`, which mobile Chrome widens to fit overflowing content, and the editor was in fact 418 px wide at 390. Fixed in 5c-1 (see below).
- **NOT RUN (Docker):** `tests/e2e/admin-publish.spec.ts` (journey 1). It covers create, the refused publish without dates, the refused publish with one team, then a publish that saves first, "Published with 1 game.", one game row in the database, and the public page.

### Phase 5b: published-event editing (26/09/2026)

- **Migration `20260926000500_event_editor.sql`:** `save_event_editor(event, version, details, divisions, unschedule[])` replaces `save_draft_editor`. It works for drafts and published events in one transaction and never writes scores, provenance or mobile links itself (E-06). On a published event:
  - It unschedules the listed games (E-14).
  - Removing a division removes its games, and so their scores (E-22).
  - Removing a team leaves its games TBD (E-23, through the teams foreign key).
- **Action:** `saveEvent` (was `saveDraft`, `src/server/actions/events.ts`) runs the ported `reconcileSchedule` over the stored games to find the ones that no longer fit, passes their ids, and returns `{ version, moved }`.
- **Editor:** `draft-editor.tsx` was renamed to `event-editor.tsx` (`EventEditor`).
  - Published events get Save (the lime action) and a note that days, hours and courts save automatically.
  - Changes to days, hours or courts autosave after 600 ms (E-05). Other edits need Save.
  - After a save the page shows "Saved. N game(s) moved to Unscheduled because..." (E-14).
  - Saves run one after another on the latest version, so an autosave and a manual Save cannot race.
  - The form no longer disables while saving, so focus is kept.
  - The removal confirmations state game counts and warn about scores (E-22, E-23).
- **Bug fixed before it could ship:** publishing changes `events.updated_at` (the edit token), so the next save after publishing would have failed "changed in another window". `publishEvent` now returns the new version and the editor adopts it; a regression component test covers this.
- **Evidence (work laptop):**
  - Lint and typecheck pass. `test:coverage`: 27 files, **572 tests pass**.
  - A clean build passes (after deleting stale `.next/dev/types` harness types).
  - `check:secrets` passes against the real `.env` server values (not printed).
  - Harness in Chromium, 390 and 1440 px: in published mode the autosave fires exactly once after a start-time change, the field stays focused and enabled, and axe finds no serious or critical issues.
- **NOT RUN (Docker):** pgTAP `007_event_editor.sql`, `tests/integration/event-editor.test.ts`, and the extended `admin-publish.spec.ts`.
- **For the 5b finish review:** an autosave error shows in the alert at the top of the form, which can be off-screen while editing lower down. A toast or a sticky status would fix it (E-07).
- **Found on this laptop:** a git-ignored `.env` holds the hosted Supabase URL, secret key, mobile credentials and a Firebase URL. Next auto-loads it, so `npm run dev` would talk to the hosted project. CLAUDE.md keeps real values in `.env.local` (local stack) and Netlify only. Harness runs here override all server values with blanks, and nothing contacted the hosted or mobile projects.

### Phase 5c-1: schedule grid and game dialog (26/09/2026)

- **Schedule section** (published events only, after the matchup report; E-40 to E-44): `schedule-editor.tsx`.
  - One table per day: hourly slots with end minutes honoured (E-41), plus off-grid times, days and courts that games already use. Pure model in `src/lib/schedule-grid.ts`.
  - Court-name columns, a sticky time column, and horizontal scroll inside the card.
  - Cards: division colour, or `playoffColour` for semis and finals (E-43, valid hex). Label, "Team vs Team" with playoff teams resolved from standings (E-42), and Edit.
  - The Unscheduled row, with its count and empty hint.
  - The grid reads the saved event, not unsaved edits.
- **Game dialog** (E-46 to E-50): Day (or Unscheduled), a typed time, Court, Division, Label, Team 1 and 2 ("Team (Division)" or TBD) and Type.
  - Messages: "A team can't play itself..." and "That slot (DD/MM/YYYY 9:00 am Court) is already taken." (checked in the client, with the slot index as the final guard on the server).
  - Delete asks "Delete this game?"; its score goes with it.
  - Bracket games explain that bracket results replace hand-picked teams, and offer "Detach from the bracket".
  - The dialog renders in a portal (no nested forms) with `data-keeps-page`.
- **Actions** `src/server/actions/games.ts`: `saveGame` and `deleteGame`. Each does auth, zod and ownership checks, then writes through the session client (RLS plus the `games_validate_refs` trigger), and never writes scores. Every change saves at once (E-05).
- **Layout bug fixed** (X-05): `.stack` grid children could not shrink below their content, so wide tables widened the page on mobile (418 px editor, 457 px with the schedule, at a 390 px viewport). The fix is `grid-template-columns: minmax(0, 1fr)`.
  - Red on the old CSS and green on the new, in the harness at 390 px.
  - The E2E overflow checks in `mobile-import.spec.ts` and `today-prototype.spec.ts` now compare with `page.viewportSize()`. The Today prototype passes 8/8 under the stronger check.
- **Evidence (work laptop):** lint and typecheck pass; 30 files, **594 unit and component tests pass**; clean build passes; `check:secrets` passes against the real server values. Harness at 390 and 1440 px: the grid and dialog pass axe with no overflow. Captures: `.impeccable/review/phase5c/{mobile,desktop}/{schedule,game-dialog}.png`.
- **Passed in CI (run 36221904647):** the new E2E "adds, validates, edits and deletes games on the published schedule", plus the strengthened overflow checks.

### Google sign-in (A-11, 26/09/2026)

User decision: add Google sign-in (the same Google account as the iTala mobile app); no Apple. Accounts stay invite-only.

- `/auth/google` (GET link, so the CSP `form-action` rule never meets the Google redirect) starts the PKCE flow with the callback on `NEXT_PUBLIC_SITE_URL`.
- `/auth/callback` exchanges the code, then applies the same `resolveAccess` role checks as password sign-in; anyone without admin rights is signed out.
  - Failures, including Supabase's "Signups not allowed" for uninvited accounts, show one fixed notice. Provider text is never echoed, and `next` stays on-site.
- The login page shows "Continue with Google" only when `/auth/v1/settings` reports Google on (`src/server/auth-providers.ts`, cached 5 minutes). It is a plain `<a>`, because a prefetching `Link` would start the flow.
- `supabase/config.toml` has a disabled `[auth.external.google]` block (env-substituted id and secret) plus local callback redirect URLs.
- **Evidence:**
  - 10 unit tests: provider check, notices, both routes, open-redirect and no-role cases.
  - 604 unit and component tests in total, lint, typecheck, clean build and `check:secrets` all pass.
  - Harness with a local settings stub at 390 and 1440 px: the button is at least 44 px, axe is clean and there is no overflow. Capture `.impeccable/review/google/{mobile,desktop}/login.png`.
  - New E2E `google-sign-in.spec.ts` (provider off) runs in CI.
- **Setup (you, done in the dashboards):**
  - Google Cloud: a "Web application" OAuth client in the mobile app's Google Cloud project. JavaScript origins: `http://localhost:3000` and the production URL. Redirect URIs: `https://ephhjzrkbjrhcjrwtknn.supabase.co/auth/v1/callback` and `http://127.0.0.1:54321/auth/v1/callback`.
  - Supabase: Google provider with that Client ID and secret; Redirect URLs `http://localhost:3000/auth/callback` and the production `/auth/callback`. Keep sign-ups off.
- **Manual check PASSED (26/09/2026, reported by Aeron, hosted project, `npm run dev` on localhost:3000):**
  - Google sign-in with an invited account reached the dashboard, so Supabase does link the Google identity to an admin-created account while sign-ups are off.
  - Password sign-in still works.
  - A Google account that is not an admin got the fixed "Google sign-in didn't work..." notice.
  - Hosted state confirmed by read-only checks: Google provider on, **sign-ups disabled**, and the 26/09 migrations applied (`event_image_cleanup` now exists).
- **For design review:** Google's brand guidelines prefer their "G" mark on the button (it is text-only now).

### Phase 5c-2: schedule drag and drop (26/09/2026)

- **Dependencies:** `@dnd-kit/react` and `@dnd-kit/dom`, both pinned at 0.5.0 (MIT).
  - `@dnd-kit/dom` is imported directly for the plugin classes. It is the same version `@dnd-kit/react` depends on, so there is one copy.
  - This laptop's npm 11.6 dropped the two `@emnapi` lockfile entries again. They were restored from HEAD, so the lockfile diff is additions only, and `npm ci --dry-run` accepts it.
- **E-45 behaviour** (`schedule-editor.tsx`), matching the old `schedDrop`, `schedDropSlot` and `schedDropUnscheduled`:
  - Drop on a game swaps slots. Drop on an empty cell moves. Drop on the Unscheduled row clears the slot. An unscheduled game dropped on a scheduled one swaps them, and so does a scheduled game dropped on an unscheduled card.
  - Every card has a **Move** handle (grip plus the word, at least 44 px). A mouse drags at once; touch needs a 250 ms press, so swiping a card still scrolls the table.
  - Keyboard: Space or Enter picks up, arrows step one cell at a time (`nextTarget`: across courts, through the times, into the next or previous day, and up into the Unscheduled row and its games), Space or Enter drops, and Escape or Tab cancels (dnd-kit's default would drop on Tab).
  - The card shows in its new place at once (`useOptimistic`) and settles when the save returns. A refused or failed save (including an unreachable server) puts it back. Dragging and Edit are locked while a save runs.
  - A pinned notice at the foot of the schedule names the move. It adds a non-blocking "Rest warning:" line for each team left with two games under 2 hours apart that day (`restBreaks`, new pairs only). It has a Dismiss action and clears when the next drag starts.
  - NZ English screen-reader instructions and announcements (picked up, over which slot, swap or move, dropped, cancelled).
- **Pure logic:** `planDrop`, `applyDrop`, `ownTarget` and `nextTarget` are in `src/lib/schedule-grid.ts`; `restBreaks` is in `src/domain/schedule-edit.ts`.
- **Action** `dropGame` (`src/server/actions/games.ts`):
  - Checks, in order: auth, a zod discriminated union, ownership, and that the games belong to the event (a court range check too for moves).
  - Then one database function (`move_game`, `swap_games` or `unschedule_game`) through the session client, so RLS, the editor check and the slot index apply.
  - A swap carries the two slots the organiser saw and is refused as stale if either game has moved since (another window).
  - A slot conflict (23505) names the slot. Any refusal revalidates, so the grid shows what is stored.
  - It never writes scores.
- **CSP:** dnd-kit injects `<style>` elements. They carry the nonce of the page's own policy, read from the document's scripts. A nonce passed down in props would go stale: the proxy mints one per request, including client-side navigations and Server Action refreshes.
- **Found and fixed in Chromium:** dnd-kit 0.5.0 restores focus only after a drop animation, and the design allows none. After Escape, focus fell to the page.
  - The fix: the Move button takes focus back once dnd-kit is idle.
  - The harness keyboard spec failed at the Escape step before the fix and passes after. A component test fails with the restore removed.
- **Bug fixed (X-05 class):** the absolutely positioned screen-reader text in the matchup report and schedule cells escaped the tables' scroll boxes. That widened the editor to 457 px at a 390 px viewport once a division had 3 teams.
  - Red: the harness 3-team sample measured `scrollWidth` 457. The 2-team 5c-1 sample measured 390, which is why 5c-1 missed it.
  - Fix: `.matchupScroll { position: relative }`.
  - Green: 390. The new E2E journey (3 teams) now also checks for sideways scroll.
- **Baseline, not fixed (not from this slice):** the editor's client-side zod v4 probes `Function("")` once on load to detect eval support. The CSP reports this as a `script-src eval` violation.
  - It is harmless (zod falls back) and also happens on the draft editor, which has no drag and drop.
  - Possible fix: `z.config({ jitless: true })` in the client bundle.
- **Independent review** (fresh read-only reviewer): security found nothing material, and the old semantics and the rest rule were confirmed. Findings and what happened:
  - High, fixed (reproduce, fail, fix, pass): the stale CSP nonce. After a client-side navigation (Create event uses `router.push`), or after any successful drop, dnd-kit's styles were blocked, and the lifted card did not follow the pointer. The first fix passed the request nonce down in props, which goes stale.
    - Red: a harness regression that opens the editor through a client-side link failed, because `translate` stayed `none` mid-drag.
    - Green after reading the nonce from the document.
    - A component test and a mid-drag check in the CI E2E guard it. `position: fixed` alone proves nothing, because a popover is fixed by default.
  - Fixed: Tab dropped and saved. It now cancels. The harness regression was red, then green; the CI E2E covers it too.
  - Fixed: the refocus could pull focus back from a field the organiser moved to while a save ran. Focus now returns only when it was lost to the page. Covered by a component test (red when the guard is removed).
  - Fixed: a swap used the other game's current slot, not the one the organiser saw. Covered by an action test (red without the check).
  - Fixed: Edit during a save opened the optimistic copy. It is now locked while saving.
  - Fixed: Dismiss dropped focus; it now goes to the game the notice is about. A dialog save clears an old drop notice.
  - Not fixed (low): the extra court columns the grid shows for out-of-range games still accept drops. The server refuses them with "Choose a court from 1 to N", and the card goes back. This is rare, because E-14 unschedules such games.
- **CI run 36221272993 on `506ac42`:** everything passed except the new drag and drop E2E, at both viewports and on retry.
  - The failure screenshot: the keyboard half had passed, then the first mouse drag pressed on the third game's Move button while the pinned notice (with its rest warning) covered it. The press selected the notice's text instead of starting a drag.
  - Reproduced in the harness: the card near the foot of the viewport, and a check that its Move button is covered. A blind press hits the notice.
  - Fix, product: the notice clears as soon as the next drag starts, so it never sits over drop targets during a drag. A component test is red without it.
  - Fix, test: the E2E drag helper uses `hover()`, which scrolls the handle clear of the notice before pressing, as a person would.
  - The harness regression passes at 390 and 1440 px.
  - **Green:** CI run 36221904647 on `ffedad2`: 66/66 E2E, and the drag and drop journey passed first time at both viewports.
- **Test changes:** `admin-publish.spec.ts` status checks are scoped to `main`, because dnd-kit adds its own `role="status"` live region to `<body>`. The component test setup gains a no-op `ResizeObserver`, which jsdom lacks and dnd-kit needs when it loads.
- **Evidence (work laptop):**
  - Lint and typecheck pass.
  - `test:coverage`: 33 files, **638 tests pass**. `src/domain` and `schedule-grid.ts` are at 100%.
  - Mutation checks: removing the focus restore, the refocus, the rest warning, the focus guard, the Edit lock, the Dismiss focus, the document nonce, the stale-swap check or clearing the notice on the next drag each failed its test.
  - A clean build without the harness passes, and `check:secrets` passes against the real server values (not printed).
  - Harness in Chromium at 390 and 1440 px, **18/18** (after the review and CI fixes; 2 touch cases run on the phone project only):
    - mouse move, swap, unschedule and an unscheduled game swapping in;
    - keyboard pick-up, arrows, drop, cancel with focus kept, into day two, and into Unscheduled;
    - touch press and hold (Chromium touch emulation at 390 only), and a quick swipe that scrolls instead of dragging;
    - a refused save putting the card back, with the exact action payloads checked;
    - the success path, with the real action response rewritten to `ok`, showing the notice and rest warning while it stays in view;
    - axe with no serious or critical issues, no sideways scroll, and no CSP violations from dragging;
    - the two review regressions (drag styles after a client-side navigation, Tab cancelling) and the CI regression (dragging a card from under the pinned notice).
  - Captures: `.impeccable/review/phase5c2/{mobile,desktop}/` (grid, mouse and keyboard dragging, refused, rest warning, touch dragging).
- **Runs in CI on push:** the new E2E "moves, swaps and unschedules games by drag and drop, warning about short rest" (keyboard with a Tab cancel, and mouse with a mid-drag style check; stored results checked, no scores written).
- **NOT RUN:**
  - Real-device touch: emulation only. Check on a phone.
  - A screen reader listening test: the announcements are checked in code and tests but not heard.
- **For the finish review:**
  - `.impeccable/design.json` is not updated; DESIGN.md is ("Schedule drag and drop").
  - dnd-kit sets `aria-pressed` and `aria-grabbed` on the Move button (library default), so screen readers may announce it as a toggle.

### Phase 5c-3: round robin and playoff dialogs (26/09/2026)

- **E-21:** once published, a division's action row shows **+ Round robin** and **+ Playoff**. The pre-publish **Custom games/team** setting leaves the card and lives in the round robin dialog, as in the old `renderDivCard`.
- **E-63, "+ Round robin"** (`schedule-additions.tsx`):
  - The old sentence ("{n} teams. A full round robin is {games} games ({max} per team)..."), the Custom games/team check and a Games per team field (1 to max). The field starts at the division's saved number, else min(3, max).
  - The same messages: at least 2 teams, a date first, how many games, and "at most N games without a repeat matchup".
  - It adds the missing matchups into free slots only. The result reads "{n} games added." plus how many went to Unscheduled, or "No new games to add. Every matchup for this division is already on the schedule."
- **E-64, "+ Playoff":** "How many teams advance to the playoff bracket? (max N)", starting at min(N, 4), from 2 to N; "Need at least 2 teams." for smaller divisions.
  - It adds a seeded bracket from 1 hour after the latest game, in 60-minute steps on court 1, rolling to the next day.
  - Games that do not fit go to Unscheduled (the old code overflowed onto the last day), and the result says how many.
  - A second playoff reuses bracket ids, as before (the first match wins).
- **Both dialogs** save unsaved edits first (as Publish does), then show the outcome in place with **Done**, the old editor's alert. A division with too few teams, or an event with no dates, gets the reason and only Close.
- **Actions** (`src/server/actions/schedule-additions.ts`): auth, zod and ownership checks, then they re-read the saved event. The shared text and checks are in `src/lib/schedule-additions.ts`, so the dialog and the action agree.
  - **Parity (Phase 2 handover):** games go to the scheduler with their **stored** teams, as the old editor loaded them straight from the database. A playoff game counts with whatever teams are saved on it (usually TBD), never the teams its bracket would resolve to now.
  - **Parity:** the dialog's choice is applied to the division **before** generating, as the old code did, so a full round robin never falls back to an earlier custom number. A mutation check proves the test catches this.
  - The round robin writes through the new `add_round_robin` function. It keeps the choice on the division, adds the games and re-sorts the schedule (the old `sortSchedule(schedule.concat(added))`) in one transaction. The playoff appends through the new `add_playoff` without a re-sort, as the old code pushed.
  - The editor adopts the stored choice into its saved snapshot, so a later Save does not overwrite it.
- **Migration `20260926000600_schedule_additions.sql`:**
  - `add_round_robin` and `add_playoff` (security invoker; editor check, published event locked, the division must belong to the event), sharing `begin_schedule_addition`.
  - The distinct-days rule from the Phase 2 review: `dates_are_distinct` plus a CHECK on `events.schedule_days`, after normalising any existing duplicates.
  - pgTAP test `supabase/tests/008_schedule_additions.sql` (12 assertions).
  - `database.types.ts` is hand-edited for both functions. The Docker PC's `npm run db:types` must show **no diff**; if it differs, keep the generated file.
- **Bug fixed (accessibility, pre-existing):** closing any admin dialog (confirmation, players, game, and the new ones) dropped keyboard focus to the page body.
  - Root cause: each dialog is removed from the page while still open, so the browser never hands focus back.
  - Fix: a shared `useModal` hook records the opener and gives it focus back on close. The control to start on is marked `data-autofocus` instead of React's `autoFocus`, which moved focus before the opener was known.
  - Red, then green: `tests/component/dialog-focus.test.tsx` failed for both shared dialogs before the fix. A harness regression checks all four dialogs in Chromium.
- The other Phase 2 handovers were already done: the one-to-one team map (primary key plus unique mobile team per division), integer games per team, and the time zone check.
- **Independent review** (fresh read-only reviewer). Security found nothing material. The stored-teams parity, the SQL order against `sortSchedule(concat)`, the playoff append, the defaults and messages, and the editor integration were all confirmed. Findings and what happened:
  - Medium, fixed (parity): the old `collectEditorFields` ran `reconcileSchedule` before either addition, so games outside the event's days, hours or courts went to Unscheduled first. For example, a game added at 20:30 in a 20:00 event would otherwise push a whole playoff to Unscheduled.
    - Both actions now reconcile first and unschedule those games in the same transaction (`begin_schedule_addition`). The result says how many moved, as E-14 does on Save.
    - Action tests cover both paths, and are red with the reconcile removed.
  - Medium, fixed (accessibility): the result appeared as a new status just as focus moved to Done, which screen readers announce unreliably. Done is now described by the result, as the component and harness tests check.
  - Low, fixed: both functions now lock the event row and refuse a draft event, like `publish_event`, and the playoff has its own `add_playoff` instead of `append_games`.
  - Low, fixed: no re-sort when nothing was added, as the old code returned before sorting. Null day elements are dropped when the migration normalises existing days. The custom number is capped at the stored limit of 20 for divisions of 22 or more teams, with its own message.
  - Low, fixed (accessibility): a confirmation that removes its own opener (Remove team or division, Continue) now focuses the first control of the nearest part of the page still there. After a server refusal, focus goes back to the go-ahead button that was disabled while it ran.
  - Deliberate differences, recorded here: "2.5" teams or games is refused with the dialog's message, where the old `parseInt` quietly read 2.
  - The review's test gaps were closed:
    - pgTAP now covers two days (so ordering by day is really tested), atomicity (a slot clash rolls back the division change and the unscheduling), no re-sort on an empty add, the playoff append, a draft event, and anon's missing EXECUTE rights; 26 assertions in all.
    - The component tests unmount properly, and check focus back to "+ Round robin" and that a full round robin after a saved custom number stores 0.
    - The CI E2E checks axe with the dialog open, focus return, and that positions follow day and time after the re-sort.
- **Evidence (work laptop):**
  - Lint and typecheck pass. `test:coverage`: 36 files, **667 tests pass**. `src/lib/schedule-additions.ts` is at 100%; `src/domain` is unchanged and still 100%.
  - Mutation checks each failed their test:
    - the stale custom value;
    - the reconcile (both actions);
    - saving first;
    - keeping the stored choice;
    - Done's description;
    - the focus fallback;
    - the refocus after a refusal. jsdom keeps focus on a disabled button, so that test moves focus to the page the way a browser does.
  - A clean build without the harness passes, and `check:secrets` passes against the real server values (not printed).
  - Harness in Chromium at 390 and 1440 px, **26/26** (with the 5c-2 drag specs):
    - the division actions at 44 px;
    - both dialogs: text, defaults, range checks, the exact action payload, the refusal with focus back on the go-ahead, and the success view with Done focused and described;
    - the stored choice as the next starting point, with nothing unsaved;
    - focus back to the opener for all four dialog kinds, and into the division after Remove team;
    - axe with no serious or critical issues, and no sideways scroll.
  - Captures: `.impeccable/review/phase5c3/{mobile,desktop}/` (division actions, both dialogs, both results).
- **CI run 36234344462 on `cc1a035`:**
  - The migration applied cleanly, and **pgTAP passed 180/180** (154 plus the 26 in `008_schedule_additions.sql`).
  - Integration and every other E2E passed.
  - The new additions E2E failed at both viewports on a **test bug**. Its "unscheduled games come last" check used `findIndex`, which is -1 when every game fits, as it did here. The stronger check just before it (stored order follows day and time) passed.
  - The check now compares the scheduled and unscheduled pattern with its sorted form, which holds with or without unscheduled games. It was checked on none unscheduled, some at the end, and one out of place.
  - **Green:** CI run 36234713687 on `167c8e7`: 68/68 E2E, with the additions journey passing at both viewports, and 180/180 pgTAP.
- **You, after CI passes:** push migration `20260926000600_schedule_additions.sql` to the hosted project (`supabase db push`), as with the earlier migrations.
- **For the finish review:** `.impeccable/design.json` is not updated; DESIGN.md is ("Round robin and playoff dialogs", and the dialog focus rule).

### Phase 5d: rules editor and event images (26/09/2026)

- **E-70, rules editor** (`rules-editor.tsx`, Tiptap 3.31.3 pinned, loaded only in the browser): the old toolbar and nothing more, Bold, Italic, Underline, Heading 2, Heading 3, Bullet list and Numbered list.
  - A WAI-ARIA toolbar: one tab stop, with arrow keys, Home and End moving between tools. Toggle buttons use `aria-pressed`, and `aria-keyshortcuts` lists both Control and Command.
  - The text box is labelled "Event rules", and clicking the label focuses it.
  - Rules save with the rest of the event (Save or Save draft). `saveEvent` sanitises them first, and rules with no text are stored as empty, so the page says "No rules."
- **E-71, sanitising:** `sanitizeRulesHtml` is used on save, when the editor loads (so legacy HTML is cleaned before it is re-sent) and on the public page. A numbered list keeps a plain `start` number (1 to 9999), so "3. " numbering matches on the page; no other attribute survives.
- **E-15 to E-18, images** (`event-images.tsx`): Event logo, Major sponsor and Minor sponsors (several at once), each with Upload or Replace and Remove.
  - The browser checks the file (any image except SVG, up to 5 MB) and resizes it on a canvas to at most 1600 px, as WebP (PNG or JPEG fallback). It refuses anything still over 4 MB, which leaves room for the upload's own overhead. No dependency was added.
  - `uploadEventImage` (Server Action): auth, ownership and zod checks, then it works out the type from the bytes (PNG, JPEG or WebP only) and stores the file at `events/{eventId}/{kind}-{uuid}.{ext}` with the user's session, so storage RLS applies. It records the file, then deletes the file it replaced. If recording fails, the new file is removed.
  - `removeEventImage` removes the record, then the file. Afterwards focus moves to that slot's upload control.
  - Image changes join the editor's save queue, so they never run on a stale version. A logo change moves the edit version on only when this window was current (see the review, High 1). Unsaved edits stay unsaved.
  - `next.config.ts` raises the Server Action body limit to 5 MB.
- **Migration `20260926000700_rules_and_images.sql`:**
  - `save_event_editor` again (an exact copy of 0500 plus `rules_html`, unchanged when absent).
  - `set_event_logo(p_event_id, p_path, p_version)` returns the old path, and the new version only if `p_version` was current. `set_major_sponsor` keeps one major sponsor and returns the old path. Both are security invoker with `assert_event_editor`, lock the event row, and have no EXECUTE for anon.
  - CHECK constraints keep every `logo_path` and sponsor `image_path` inside that event's own folder, as a single plain file name ending in `.png`, `.jpg` or `.webp`, so `..`, other folders and SVG are refused.
  - pgTAP `supabase/tests/009_rules_and_images.sql` (27 assertions). `002_functions.sql` sponsor paths now follow the folder rule.
  - `database.types.ts` is hand-edited for both functions. The Docker PC's `npm run db:types` must show **no diff**; if it differs, keep the generated file.
- **Independent review** (fresh read-only reviewer). Findings and what happened:
  - High 1, fixed: a logo change adopted the latest version, even when another window had saved since, so this window's next Save could overwrite that window's changes without the E-22 warning.
    - The image task now receives the version current when it runs. `set_event_logo` returns a new version only when that one was current, and returns none otherwise, so the next Save still reports the conflict.
    - Tests: pgTAP (current, then stale), component tests (adopting, waiting for a save in flight, and a stale or refused change not adopting), and a mutation check of the queue.
  - High 2, fixed: the new CHECK broke `002_functions.sql`, whose sponsor rows used a bare path.
  - Low 3, fixed (security): the first CHECK allowed `..` segments. The folder rule is now a single plain file name, with pgTAP cases for `..`, another event, `platform/` and `.svg`.
  - Low 5, fixed: the client limit is now 4 MB, below the 5 MB body limit, and `docs/MIGRATION_PLAN.md` now describes canvas resizing and the Server Action upload.
  - Low 6, fixed: numbered lists keep `start`; the editor loads sanitised rules; the Rules note no longer claims rules save only on Save (a published event's autosave sends them too).
  - Low 7, fixed (accessibility): the roving toolbar, Command in `aria-keyshortcuts`, the clickable label, and focus after Remove.
  - Low 8, fixed (pre-existing): one save that could not reach the server left the queue rejected, so every later save and image change failed. Red first: the new component test failed on the old code (no alert, and an unhandled `TypeError`), then passed.
  - Test gaps closed: the version assertion uses an event last saved in 2020 (`now()` is fixed inside a transaction); refused callers now include a role-null account and a disabled owner; the E2E collects CSP violations from every page it visits (`page.exposeFunction`), not only the last one.
  - Accepted, not fixed (Low 4): the 1600 px limit is enforced only in the browser, and there is no cap on minor sponsors. An organiser who calls the action directly can store a 5 MB picture of any size, and one who writes straight to storage also skips the byte check. Such files are served from the Supabase origin, so the app gets no XSS; the cost is page weight on that organiser's own event.
  - Pre-existing, still open: `publishEvent` followed by `accept()` adopts the latest version the same way the logo did. Fix it the same way (return a version only if the caller's was current) in a later slice.
- **For the Firebase importer (Phase 7):** write images under `events/{new event id}/` with plain file names, and convert legacy images that are not PNG, JPEG or WebP (the old app accepted any `image/*`), or the CHECKs will refuse them.
- **Evidence (work laptop):**
  - Lint and typecheck pass. `test:coverage`: 41 files, **702 tests pass**. `src/lib/event-images.ts`, `compress-image.ts` and `rules-html.ts` are at 100%; `src/domain` is unchanged and still 100%. The actions and components are outside coverage by the existing config, and have their own unit and component tests (`image-actions`, `save-event`, `event-images`, `rules-editor`, `compress-image`, `event-editor`).
  - Mutation checks failed their tests: the `start` pattern, the label click, the queue order for image changes, and the save-queue catch.
  - A clean build without the harness passes, and `check:secrets` passes against the real server values (not printed). The two font warnings are the known ones for the event fonts.
  - Harness in Chromium at 390 and 1440 px, **48/48** (every harness spec, including the 5d ones). The 5d specs cover a 2000 by 1000 PNG sent as a 1600 by 800 WebP (checked from the bytes), no enlarging, SVG, over 5 MB and unreadable files refused before anything is sent, the rules toolbar and shortcuts with the exact HTML sent, the roving toolbar and label, axe with no serious or critical issues, no sideways scroll and no CSP violations beyond zod's known eval probe.
  - Captures (gitignored): `.impeccable/review/phase5d/{mobile,desktop}/` (images, rules).
  - Not run on the laptop (no Docker): pgTAP, integration and the new E2E `admin-images-rules.spec.ts` (logo resize and replace with the old file deleted, sponsors, remove, rules save, the public page, CSP). CI ran them, below.
- **CI:**
  - Run on `e3838e2`: every job failed at `npm ci`. The laptop's npm 11.6.2 left `@floating-ui/dom` (a dependency of Tiptap's optional bubble menu) out of the lockfile, and `npm ci --dry-run` had not caught it. Fixed in `68d5ba9` by regenerating the lockfile with CI's npm 11.19.0 (`npx -y npm@11.19.0 install --package-lock-only`), checked with a real `npm ci` using that npm in a scratch copy.
  - Run 36239302816 on `68d5ba9`: the migration applied; pgTAP failed on two test bugs of mine in `009`. A patch script had used `String.replace`, which turned the new cases' `$$` into `$` (a syntax error after 24 of 27). And "a caller on the current version gets the new version back" compared the result with a subquery in the same statement, which still sees the row from before the call. It now compares with `now()`, which the update trigger stamps. Fixed in `8919912`.
  - Run 36239532684 on `8919912`: **207/207 pgTAP, 22/22 integration**, the new images and rules journey passed at both viewports, and all other checks passed. One existing test was **flaky**: `mobile-import.spec.ts` "guards unsaved edits on sign out and browser Back…" failed once at 390 px (after Continue on Back, then Forward, the name still read "Unsaved navigation"), then passed on retry. It was the first flaky retry in the last eight green runs.
- **Flaky guard test: cause and fix (test timing, not a 5d regression):**
  - Cause: creating the event is a Server Action that revalidates, which evicts Next's back/forward cache. So after Continue, Next fetches `/admin/events/new` again, and until that data arrives the URL has changed but the editor is still on screen. The test pressed Forward as soon as the URL changed; when it won that race, Next restored the editor onto the one still mounted, keeping its unsaved state.
  - Reproduced in the harness (`test-results/guard/forward-race2.spec.ts`, not committed): a Save rewritten to succeed with the revalidated header, and page data slowed by 1.5 s. Pressing Forward straight away returned the unsaved name **5/5**; waiting until the previous page showed returned the saved name **5/5**. Without the eviction it never happened: 0 of 30 rounds that pressed Forward straight away, with and without slowed page data (`forward-race.spec.ts`).
  - Fix: the test now waits for the New event page (its Create event button) before Forward, in both places, as the harness version of this test already did. **CI run 36240866715 on `b2315e2`: 70/70 E2E with no retries.** One clean run does not prove a race is gone; the harness diagnostic is the stronger evidence. The race cannot be run as a CI red test, because CI needs the real backend, so the harness diagnostic is the before and after evidence.
  - Product impact, accepted: a user who presses Forward within that moment after choosing Discard sees the edits they discarded, no longer guarded. Nothing is saved or lost that they did not choose.
  - NOT RUN: Safari and Firefox (the canvas WebP fallback), and an upload through Netlify's function payload limit (6 MB, unverified for multipart). Check both on the first deploy.
- **You, now that CI has passed:** push migration `20260926000700_rules_and_images.sql` to the hosted project (`npx supabase db push`).
- **Docker PC:** `npm run db:types` must show no diff for `database.types.ts` (hand-edited for `set_event_logo` and `set_major_sponsor`); CI has no such step.
- **For the finish review:** `.impeccable/design.json` is not updated; DESIGN.md is ("Rules editor", "Event images").

### Phase 5e-1: platform settings (27/09/2026)

- **Decisions (user, 27/09/2026):** 5e is built in two slices: 5e-1 Settings (S-01, S-02), then 5e-2 Admins (A-09). New admins get into their account through a **set-up link** the superadmin copies and sends (Supabase's built-in email only reaches the project's own team, at 2 an hour, so invite emails are not used). The dashboard's **Results** action (D-02) opens the Phase 6 results inbox, so it arrives with Phase 6; View was already done.
- **S-01, platform sponsors** (`/admin/settings`, `platform-sponsors.tsx`): Primary sponsors ("Full size on every event page.") and Secondary sponsors ("Half size…"), each with several uploads at once, thumbnails and Remove.
  - The browser resizes as for event images (5d). `uploadPlatformSponsor` checks the superadmin, works out the type from the bytes, stores `platform/{tier}-{uuid}.{ext}` with the user's session (storage RLS), and adds one row per sponsor after the last of its tier. So two uploads at once never lose each other, unlike the old shared list. If the row cannot be added, the file is removed again.
  - `removePlatformSponsor` removes the row, then the file (the old app left files behind). Focus moves to that tier's Add control. Every event page is revalidated (`/(public)/events/[eventId]`, page).
- **S-02, default rules** (`default-rules.tsx`): the rules editor, starting from the stored template or, when it is empty, the built-in iTala rules. `saveDefaultRules` cleans to the rules allow-list; no text is stored empty, which means the built-in rules (`create_draft_event` already read the template). Unsaved changes are shown, and leaving asks first. Save stays focusable while it runs.
- **Shared:** `authorizeSuperadmin()` in `src/server/auth.ts`; the file picker is now `src/app/admin/_components/image-pick.tsx`, used by event images and settings.
- **Migration `20260927000100_platform_sponsor_paths.sql`:** a CHECK keeps platform sponsor paths to one plain file name in `platform/` (.png, .jpg or .webp). pgTAP `010_platform_sponsors.sql` (13 assertions): the path rule (including the old nested `platform/sponsors/` layout), anyone reads, an admin or a disabled superadmin cannot add, change or remove, a superadmin can. No new functions, so `database.types.ts` is unchanged.
- **Bug fixed (rules toolbar, from 5d):** clicking a tool moved focus to the button, and the editor only took it back a frame later, so a key pressed straight after (End, Enter) went to the toolbar: End jumped to Numbered list and Enter turned it on. Found by the harness on desktop. Red first: a new component test ("clicking a tool leaves the cursor in the text") failed on the old code, then passed once the tools stopped taking focus on mouse down. The harness rules tests then passed 30/30 over five repeats. Keyboard users still reach the tools with Tab.
- **Checked and ruled out:** in one coverage run, four event editor Publish tests timed out at 1 s. I tested whether the lazily loaded rules editor could hold up Publish (a 3 s delay on its chunk): Publish still showed its result in 41 ms, so there is no product issue. Two reruns passed 723/723. One of those tests read the always-present alert before publish finished; it now waits for the message.
- **For the Firebase importer (Phase 7):** platform sponsors were stored under `platform/sponsors/…` in the old app; the importer must write them as single files in `platform/`, or the new CHECK refuses them.
- **Evidence (work laptop):**
  - Lint and typecheck pass. `test:coverage`: 45 files, **723 tests pass** (two consecutive runs), thresholds met. New: `platform-actions` (9), `auth-helpers` (2), `platform-sponsors` (4), `default-rules` (5), and the toolbar focus test.
  - A clean build without the harness passes; `check:secrets` passes (values not printed).
  - Harness in Chromium at 390 and 1440 px, **54/54** (every harness spec), including Settings: a 2000 by 1000 PNG sent as a 1600 by 800 WebP with its tier, SVG refused before sending, success and refusal messages, named Remove buttons at least 44 px, focus after Remove with a visible ring, the default rules edit, guard, save payload and focus, axe with no serious or critical issues, no sideways scroll, no CSP violations beyond zod's probe.
  - Captures (gitignored): `.impeccable/review/phase5e/{mobile,desktop}/` (settings-empty, settings-sample, settings-rules).
  - Not run on the laptop (no Docker): pgTAP `010` and the new E2E `admin-settings.spec.ts` (sponsors to storage and back, removal deletes the file, default rules saved, a new event starts with them, its page shows the platform sponsors, axe, CSP; it restores the sponsors and template it changed). CI runs them.
- **CI run 36246633926 on `562592f`: green**, 220/220 pgTAP (including `010`), 72/72 E2E with no retries (including the settings journey at both viewports).
- **You, after CI passes:** push migration `20260927000100_platform_sponsor_paths.sql` to the hosted project (`npx supabase db push`).

### Phase 5e-2: Admins screen with set-up links (27/09/2026)

- **A-09** (`/admin/admins`, superadmin only):
  - **New account:** Name, Email, Role. `createAdminAccount` refuses an email already on the list, then asks Auth (secret key, server only) for an invite token with no email sent, sets the role and name through the superadmin's session (RLS and `profiles_guard` apply), records the link, and shows it: `/auth/confirm?token_hash=…&type=invite` built from `NEXT_PUBLIC_SITE_URL`. If the role cannot be set, the user it just created is removed.
  - **Set-up link panel:** takes focus, Copy link, Done (focus back to where it was opened). It says the link works once and expires in 1 hour, and that Google sign-in also works when it is on.
  - **Accounts:** `list_admin_accounts()` (security definer, superadmin only) gives name, email, role, status and whether they have signed in. Role changes ask first (the select alone changed at once on arrow keys on Windows); Disable asks first; Enable does not. **New set-up link** gives the invite again to someone who never finished, otherwise a password link. Your own row only offers Change password. Phones get stacked cards.
- **`/auth/confirm`:** opening the link does nothing; **Continue** calls `verifyOtp` (so email and chat link scanners cannot use it up), then the same access rules as sign-in apply (disabled, role-less or profile-less accounts are signed out with the reason). Only Auth's 56-character hex token is accepted. The page sends no referrer and is not indexed.
- **`/admin/password`:** choose or change your own password (at least 10 characters, typed twice). Auth's refusals are explained in plain words.
- **Audit (X-09):** a new `audit_profiles` trigger records role changes, disabling and enabling with who did it, and `record_account_link` records every link made (who, for whom, invite or password). A link is only handed over once it is on record.
- **Migration `20260927000200_admin_accounts.sql`:** `list_admin_accounts`, `audit_profiles` and its trigger, `record_account_link`. pgTAP `011_admin_accounts.sql` (18 assertions): who may list and record links, anonymous users never listed, the audit rows, a name change not audited, the functions' definer settings and grants. `database.types.ts` is hand-edited for both callable functions (the Docker PC's `db:types` must show no diff; keep the generated file if it differs).
- **Integration test `tests/integration/admin-accounts.test.ts` (7, CI only):** pins the Auth behaviour the code relies on: an invite makes the user and a 56-character token with no email, the profile takes the name, the link signs in once, then a password works; an address already set up is refused; a new invite replaces an unused token; a password link works; the list and role changes through the API follow RLS.
- **Independent review** (fresh read-only reviewer, both 5e slices). No High findings. What happened:
  - Medium, fixed: Create account reused an account that was never set up (Auth hands back an unconfirmed user with a new token), could change its role and name, and on a failed role update could delete it. Now refused up front; a mutation check proves the test catches it.
  - Medium, fixed: the role select saved on every change, with no question. It now asks, says what the role can do, and restores the stored role on Cancel or refusal (the component test was strengthened after a mutation survived the first version).
  - Medium, fixed: no audit of account changes, and a password link lets a superadmin sign in as that account. Both are now audited as above.
  - Low, accepted: two superadmins demoting or disabling each other at the same moment could leave none, since the guard only blocks changing your own row. It needs two requests racing; recovery is `npm run admin:create`. Not fixed, as it cannot be tested here and the guard sits on every profile update.
  - Low, partly fixed: junk requests to `/auth/confirm` share Auth's per-IP limit for link checks (the server's IP). Tokens not in Auth's format are now refused before Auth is asked; an app-level throttle is not added (sign-in has the same exposure). The "1 hour" text must match the hosted Email OTP expiry (README says where).
  - Low, fixed (accessibility): phone card labels are visible only (`content: attr(data-label) / ''`), the two new alerts drop the conflicting `aria-live`, and the New account error is tied to its fields.
  - Test gaps closed: existing email, record failure, no-role and no-profile links, the token format, pgTAP definer checks, and axe and CSP on the person's own pages in the E2E.
- **Evidence (work laptop):**
  - Lint and typecheck pass. `test:coverage`: 48 files, **747 tests pass**, thresholds met. New: `admin-actions` (12), `account-actions` (6), `admins-view` (8).
  - A clean build without the harness passes; `check:secrets` passes (values not printed).
  - Harness in Chromium at 390 and 1440 px: **62/62** earlier in the slice, and the Admins specs again after the review fixes (8/8): the link panel focused, copy to the clipboard, Done focus, the role question (Cancel restores and refocuses, arrow keys only ask), disable asks, enable, the confirm page (no action until Continue, no-referrer, a bad token refused), the password form's description and saved view, axe with no serious or critical issues, no sideways scroll.
  - Captures (gitignored): `.impeccable/review/phase5e/{mobile,desktop}/` (admins, admins-link, confirm, password).
  - Not run on the laptop (no Docker): pgTAP `011`, the integration test and the E2E `admin-accounts.spec.ts` (create, the person's own browser sets a password and signs in, the link works once, role changes, disabled loses access, re-enabled gets a password link). CI runs them.
- **You, after CI passes:**
  - Push migrations `20260927000100_platform_sponsor_paths.sql` and `20260927000200_admin_accounts.sql` to the hosted project (`npx supabase db push`).
  - On the hosted project, check that sign-ups stay off (Authentication settings) and that the Email OTP expiry is 1 hour, or update the text in `admins-view.tsx`. Netlify needs `SUPABASE_SECRET_KEY` set for Create account to work (it says so when it is missing).
- **Follow-up:** admins who are not superadmins have no link to `/admin/password` yet (a superadmin can send them a set-up link). Consider a small "Password" link in the header in the Phase 8 polish.

### Phase 5 journeys and the 5e-2 CI follow-up (27/09/2026)

- **CI run 36274414845 on `6c627e6` (5e-2):** 238/238 pgTAP and the Docker job passed, but two things needed work:
  - **gitleaks failed on two false positives:** made-up 56-character test tokens in `account-actions.test.ts` and `admin-actions.test.ts` matched `generic-api-key`. They are not credentials. The tests now build low-randomness tokens (`'ab12'.repeat(14)`), and `.gitleaksignore` lists exactly those two findings (commit `6c627e6`), because the scan covers every commit in the PR and rewriting history was not authorised.
  - **Two desktop E2E retries**, investigated:
    - The round robin test stored `games_per_team` 0 instead of null. **A real race, fixed:** the published editor autosaves days, hours and courts, but it only remembered the saved window from when the page opened. So a date picked on a draft set off a stray autosave about 600 ms after publishing, which could land after a round robin and rewrite the division (0 here; in the other order it could restore the old custom number). Red first: a new component test (a draft window change, then published) saw the stray save; fixed by keeping the saved window current while the event is a draft.
    - The drag and drop test pressed ArrowDown before the keyboard pick-up had registered. A test timing issue: it now waits for the pick-up (the game's own cell marked as the target), as the harness spec already did.
- **Bug fixed (accessibility, from 5a):** Save, Save draft and Publish were disabled while they ran. Chromium moves focus from a disabled button to the page, so after declining the re-publish warning, focus was left on the page instead of Publish. Red first in the Chromium harness (`republish-focus.spec.ts`, both viewports), green after: the buttons stay focusable (`aria-disabled`, styled as busy) and ignore repeat presses. jsdom cannot show this, so the harness is the evidence.
- **Journey 4 added** (`tests/e2e/admin-republish.spec.ts`): an event published before comes back as a draft with a recorded score (as an imported event can). Publish warns that 1 score will be cleared; Cancel changes nothing (same status, games and score) and focus returns to Publish; Continue rebuilds the schedule (3 new games), clears the score and writes an `event.republish` audit row.
- **Journeys now covered in E2E:** 1 (`admin-publish`), 2 including the keyboard move (`admin-publish`), 3 and 6 (`public-event`), 4 (`admin-republish`, new), 7 (`mobile-import`, another organiser's editor), 8 (`public-event`), 9 (`mobile-import`). Journey 5 is Phase 6.
- **Evidence (work laptop):** lint and typecheck pass; `test:coverage` 48 files, **748 tests pass**; a clean build and `check:secrets` pass; harness **64/64** at 390 and 1440 px. Not run here: the new and changed E2E (CI runs them).

### Phase 5e finish review: Impeccable audit (27/09/2026)

- **Scope:** Settings, Admins, `/auth/confirm` and `/admin/password`, rendered in the Chromium harness at 390 and 1440 px, with the bundled detector and a code read.
- **Score 18/20 (Excellent):** accessibility 3, performance 4, responsive 4, theming 4, implementation integrity 3. The detector found 0 anti-patterns, with 2 advisory notes on older font sizes off the DESIGN.md ramp (the matchup report heading 1.2rem, the rules editor heading 1.25rem).
- **Measured:** no control under 44 px on any of the four pages; no sideways scroll at 390 px or with text at 200%; every control reached by Tab shows a focus ring; axe clean; the site's CSP blocked even injected test styles.
- **Findings:**
  - P2, fixed: after a refused Continue or Save password, focus dropped to the page (the submit was disabled while it ran). Confirmed in Chromium at both viewports, then fixed on those two forms and the sign-in form: the button stays focusable (`aria-disabled`, styled busy) and a second submit is stopped in `onSubmit`. The harness now shows focus back on the button; a new component test (`confirm-form.test.tsx`) proves the one-time token is sent once, and failed with the guard removed.
  - P3, fixed: the Actions column wrapped and the phone cards had extra space, both from the form button row's margin applied inside table cells (now none there, and one line on wider screens); the Settings thumbnails now lazy-load; the New account note says both fields are needed. The harness audit measurements then showed no findings on any of the four pages, and the Admins and Settings specs passed (22/22 with the measurements).
- **CI run 36275201647 on `3a46ce9`: green.** 76/76 E2E with no retries (including the accounts journey and journey 4, and the drag test without a retry), 238/238 pgTAP, integration, and gitleaks "no leaks found".
- **Evidence for the fix (work laptop):** lint and typecheck pass; `test:coverage` 49 files, **750 tests pass**; a clean build and `check:secrets` pass; harness **74/74**.

### Phase 6a: results inbox, read only (27/09/2026)

- **Plan for Phase 6** (mobile results inbox, PRD M-01 to M-09 and D-02), in slices: **6a** the read-only inbox and the dashboard Results action (done); **6b** Approve, Re-approve, Keep published score and Attach to a fixture; **6c** the link wizard for divisions made by hand (M-03). Built against recorded fixtures; the real mobile connection stays **NOT RUN** until you say go.
- **D-02:** the dashboard shows **Results** on every event while the mobile integration is on, as the old app did.
- **`/admin/events/[eventId]/results`** (owner or superadmin; a 404 when the integration is off, M-01): "Pending results" with Refresh and Back to event, the linked divisions, and the finished games in the old groups and order (Ready to approve, Changed since you approved them, More than one fixture matches, Still settling, Needs a look, Team not linked, No fixture matches, Approved), each with its count.
  - Card (M-05): "Harbour Hawks 58 - 51 Night Owls", "{league} · finished DD/MM/YYYY h:mm am · N stats" in the event's time zone, the proposed fixture ("Fixture: Hawks vs Owls · Sun 27/09/2026 7:00 pm · Court 1", plus "Note: a different day"), the drift ("Published 58-51, the mobile app now says 60-51 (48 to 52 stats)") and the reason.
  - Empty: "Nothing waiting" / "No finished games in the linked leagues." Not linked: "No division in this event is linked to a mobile app league yet."
- **Loader `src/server/mobile/results.ts`:** Connect data through the organiser's session (RLS); games through the public page's helpers, so a playoff game carries its resolved teams (M-09); the ported `matchFinals` per linked division, one mobile request per division in turn. Safety refusals kept (M-07): if the existing scores or approvals cannot be read, nothing is offered and the page says why; a division the mobile app does not answer for is reported on its own. The old "game ids could not be prepared" refusal is not needed: games have stable ids.
- **Reader:** `finals(leagueId)` reads `final_game_scores` (GET only, paged, newest first); numeric strings from PostgREST are read as numbers.
- **Fixtures:** `final_game_scores` rows for Harbour League (a result ready to approve, a 0-0 with no stats, one still settling, one against an unlinked team), with times the fixture server fills in relative to now.
- **Found for 6b (parity bug from Phase 1):** `dismiss_mobile_result` (Keep published score) only stamps `dismissed_at`. The old app also recorded the mobile app's current points, stat count and last stat time, so the same change was not raised again; without that the Changed card would come back on every refresh. 6b fixes it with a test.
- **Evidence (work laptop):** lint and typecheck pass; `test:coverage` 52 files, **767 tests pass** (new: `mobile-results` 11 with the reader and loader, `results-view` 4, `dashboard-view` 2); `mobile-results.ts` 97% lines and 82% branches, the loader 100% and 84%; a clean build and `check:secrets` pass. Harness (sample inbox, every group) at 390 and 1440 px: axe clean, no sideways scroll; capture `.impeccable/review/phase6/{mobile,desktop}/results.png`.
- Not run on the laptop: the new E2E `mobile-results.spec.ts` (import, publish, Results from the dashboard, the four groups from the fixtures, the unreachable case, zero mobile writes and no browser calls to mobile). CI runs it.

### Phase 6b: approving mobile results (27/09/2026)

- **CI run 36276672558 on `8b9e1d2` (6a): green**, 78/78 E2E with no retries (the inbox journey at both viewports), 238/238 pgTAP, gitleaks clean.
- **M-06 actions** (`src/server/actions/mobile-results.ts`): **Approve** (the proposed fixture), **Re-approve** and **Keep published score** (a changed result), and **Attach to a fixture** (any unscored fixture in the division, for proposed, ambiguous and unmatched results only, never review or settling, after "Attach this result to the chosen fixture?"). No auto-approve.
  - The browser sends ids only. Each action reads the inbox again on the server (the mobile app and Connect as they are now), checks that the fixture is still the right one for that result, needs both teams linked ("Link both teams for this division before approving this result."), and decides the orientation by team with the ported `orient`, never position. The score and its provenance are written together by `approve_mobile_result`; the version approved (points, stats, times) comes from the mobile app now.
  - The status line reports the outcome ("Approved: Hawks 58 - 51 Owls on Hawks vs Owls · …") and takes focus, because the card moves to another group; a refusal is shown and focus stays on the button.
- **Bug fixed (parity, from Phase 1):** Keep published score only stamped `dismissed_at`, so the change came back on every refresh. Migration `20260927000300_keep_published_score.sql` now records the mobile app's points, stat count and last stat time (as the old `mobileDismissDrift` did), keeping the published score and who approved it. pgTAP `012_keep_published_score.sql` (8 assertions): approve, keep (version recorded, score and approver kept, game score untouched), re-approve clears the dismissal, another admin refused. The journey 5 E2E proves it end to end (changed, kept, back to Approved).
- **Bug fixed (port, found writing 6b):** the ported drift check compares the last stat time as it comes. The approval stores it as `timestamptz`, which PostgREST returns as "2026-09-27T07:05:00+00:00" while the mobile app sends "...07:05:00.000Z", so every approved result would have shown as changed straight away. The loader now passes both as epoch milliseconds (the domain module stays identical to the old code). Red first: a new loader test saw "drifted" for an unchanged result, then passed.
- **Tests:** `mobile-result-actions` (9: orientation by team, stale or wrong fixtures refused, attach limits, unlinked teams, sign-in, integration and ownership checks, failed saves, keep), `results-view` (9, with the controls, the attach question, Cancel, no controls for review or settling, a refusal with focus kept), `mobile-results` (12). The fixture server gains a `changed` mode. E2E `mobile-results.spec.ts` is now journey 5: import, publish, Results, the groups, unreachable, approve (score stored by team), changed, kept, zero mobile writes.
- **Evidence (work laptop):** lint and typecheck pass; `test:coverage` 53 files, **782 tests pass**; a clean build and `check:secrets` pass; harness **78/78** at 390 and 1440 px (the inbox with every group and control: 44 px targets, the attach question and Cancel, a refusal with focus kept, axe clean, no sideways scroll). The attach picker is capped at 16rem on wider screens so the result text keeps its room.
- Not run on the laptop: pgTAP `012` and the extended E2E. CI runs them.
- **You, after CI passes:** push migration `20260927000300_keep_published_score.sql` to the hosted project with the other 27/09 migrations.

### Phase 6c: link wizard for divisions made by hand (27/09/2026)

- **CI fix first (`cd13f54`):** run 36277353312 on `aa9c2c0` (6b) failed journey 5 at "Approved (1)" at both viewports. Cause: the fixture server worked out "2 hours ago" on every request, so an approved result's last stat time moved and read as changed. A diagnostic against the old and new fixture server (the same row fetched twice, 1.5 s apart) showed `DRIFTS` before and `STABLE` after. Games that finished hours ago now take their time from server start; only the still-settling game follows each request. **CI run 36277814542 on `cd13f54`: green**, 78/78 E2E, 246/246 pgTAP, 29/29 integration, 782 unit and component tests, gitleaks clean.
- **M-03, `/admin/events/[eventId]/divisions/[divisionId]/mobile-link`** (owner or superadmin; a 404 when the integration is off): pick a mobile league ("Name (season)", tagged archived or closed) and **Show its teams**, then pair each division team with a mobile team or "Not in the mobile app". Pairs start from names (the ported `proposeTeamPairs`), and a pair already saved for that league wins, as the old wizard did. The old messages are kept: the "already linked to this same league" note, the unpaired count, the duplicate refusal, and "Linked. Results for this division will now appear in Pending results." (now shown on the Results page, where it takes focus). The editor shows **Link to mobile app** or **Mobile: {league}** on saved divisions.
  - Changed from the old wizard: the league loads its teams on a button, not on selection (no change of context on input); the "not in the mobile app" option loses its long dashes; the clashing selects are marked invalid as well as the alert.
- **Server:** `saveMobileLink` checks sign-in, the integration, input and ownership, refuses duplicates before any read, reads the league and its teams from the mobile app again (the league name and season come from there, never the browser), and checks every team belongs to the division and every mobile team to the league. Migration `20260927000400_division_mobile_link.sql` adds `set_division_mobile_link` (security invoker, editor check, link and team map replaced together) and records a wizard link or re-link in the audit log as `division.mobile_link` (imports keep `event.mobile_import`). pgTAP `013_division_mobile_link.sql` (11 assertions).
- **Tests:** `mobile-link` unit (7: starting pairs, duplicates, wording, labels, and the action's checks), `link-view` component (8), `results-view` (+1, the Linked confirmation and focus, red with the focus removed), `event-editor` (+2, the button). New E2E `mobile-link.spec.ts`: a hand-made division linked from the editor, the duplicate refusal, save, the Linked line with focus, the result ready on the fixture, the stored link, team map and audit entry, the wizard reopening on the saved pairs, and zero mobile writes.
- **Evidence (work laptop):** lint and typecheck pass; `test:coverage` 55 files, **800 tests pass**; a clean build and `check:secrets` pass. Harness (link wizard, sample data) at 390 and 1440 px: axe clean, no sideways scroll, 44 px targets, duplicate marked and refused with focus kept, a server refusal with focus kept, the clash note and the unreachable state; the results inbox specs still pass (6/6). Captures `.impeccable/review/phase6/{mobile,desktop}/link-*.png`.
- **CI run 36289258765 on `aee70e4`: green.** 80/80 E2E (the new link journey at both viewports), 257/257 pgTAP (with `013`), 29/29 integration, 800 unit and component tests, gitleaks clean.
- **You, now that CI has passed:** push `20260927000400_division_mobile_link.sql` with the other 27/09 migrations (`npx supabase migration list`, then `npx supabase db push --dry-run`, then `npx supabase db push`).

### Phase 7b: the writer, and the 7a review (27/09/2026)

- **CI run 36290669825 on `c3a6511` (7a): green**, 832 unit and component tests, 257/257 pgTAP, 29/29 integration, 80/80 E2E.
- **Independent review of 7a** (read-only agent, probes run outside the repository): 1 high, 3 medium, 4 low findings, all fixed here.
  - **High:** a game on a day that was not an event day disappeared from the new page (it shows only event days) while the check said READY. Such days are now added to the event (warning `event.day_added`), as the old page showed every day with games.
  - The check now also compares **where each game appears** (slot, Unscheduled or hidden), and reports games missing or extra.
  - **Values Postgres would refuse** are kept in range: courts, scores and counts, the time zone's exact name (`pacific/auckland` passed the old check), characters cut whole (an emoji is not split), and a broken character repaired.
  - **Images** other than PNG, JPEG or WebP (SVG, GIF) are left out with a warning.
  - **Court names** are read by position.
  - **A repeated gid** no longer copies a mobile approval.
  - **Key order** now follows what JavaScript's `Object.keys` gave the old code.
  - **Display fallbacks** as the old page: a team without a name is named by its code, and a division without a colour is grey.
  - **Seeding messages** now say when a deleted or same-team game can change seeding.
  - **Playoff winners** that point at a later game get a warning.
- **Which old build is live (found in the review):** connect.itala.fyi serves `deploy/src/app.js` (its `/src/app.js` has hash `08a5396751b31f74`, the same as the local deploy folder), not `src/app.js`. That build shows scores **by position**, and keeps the rows' own `s1`/`s2` when an event has no score store. The import and the check follow it: `scripts/golden/legacy/live-extract.js` holds its `applyScoresToSchedule` verbatim, and the standings, playoff and schedule code is identical in both builds (compared function by function). The newer build's gid store is reported (`event.newer_build`, `score.stores_disagree`) and not used. The check models a fresh load of the live page: playoffs are resolved on the event as read, then again after the scores arrive. A game hidden behind a later one in the same slot, as the old page drew it, is now in Unscheduled (`game.slot_hidden`); MIGRATION_PLAN.md 12.1 is corrected to match.
- **Writer:** migration `20260927000500_legacy_import.sql`.
  - **`import_legacy_event(owner, payload)`:** one transaction per event, and only the migration import can run it (security invoker, refuses any other role, granted to `service_role` only).
    - It upserts on the `legacy_*` keys, so a second import keeps every id, and removes rows no longer in the export.
    - It frees all slots first, so games can trade slots; replaces player lists; and keeps an owner a superadmin reassigned.
    - Images are not touched (7c).
  - **Audit:** during the import the per-row audit triggers stay quiet (a transaction-local setting only this function sets; clients cannot call `set_config`) and one `event.legacy_import` row records it with its counts.
  - **`import_legacy_platform`** fills the default rules template only when Connect has none.
  - **pgTAP `014_legacy_import.sql` (33 assertions)** covers the role refusals, the owner check, every mapped column, one audit row, a second import (ids kept, slots traded, removals, owner kept), a clash refused with nothing changed, and ordinary audits afterwards.
- **`--apply --owner <email> [--env <file>] [--accept-differences]`:** prints the report first, then the target's address (never the key), then writes.
  - Events with errors are never written; events with differences only when accepted.
  - Every written event is read back from the database and compared with the old page again.
  - Exit 1 if an event fails or the stored rows differ from the plan.
  - The O-1 owner is chosen at run time.
- **Tests:** `migrate-firebase` (45: every review finding has its own case; red check: three of the fixes undone, each case failed, file restored), `migrate-apply` (8, with a fake database: skips, failures, read-back diffs, rows the import did not make), integration `legacy-import.test.ts` (6: write, read back with no differences, re-import with the same ids and two audit rows, apply rules, the default rules, refusals, the CLI end to end).
- **Evidence (work laptop):** lint and typecheck pass; `test:coverage` 57 files, **853 tests pass**; `src/migration` 99% lines, 96% branches (`read-back.ts` 95%); a clean build and `check:secrets` pass.
- Not run on the laptop: pgTAP `014` and the integration test. CI runs them.
- **For you:**
  - After CI passes, push `20260927000500_legacy_import.sql` with the other 27/09 migrations.
  - Then export the old database (see 7a) and run the **dry run** first; send me the summary lines.
  - Two things to decide once we see real data: (1) if any event shows `event.newer_build` with `score.stores_disagree`, which score store to trust for it; (2) a playoff that takes the winner of a game listed after it shows TBD on a fresh load on both sites, but the old page filled it in after a later refresh or filter click. I recommend the new page resolve playoffs until nothing changes (a small Fix to PRD P-06), which needs your OK.

### Phase 7a: Firebase import, dry run and verification report (27/09/2026)

- **Plan for Phase 7** (MIGRATION_PLAN.md 12.1): **7a** read a Firebase console JSON export, map it to Connect rows and print the verification report, writing nothing (done); **7b** the writer: one Postgres function per event, atomic and idempotent on the `legacy_*` keys, run with the secret key, with `--owner <email>` required (O-1 decided at run time), pgTAP and integration tests; **7c** images: copy URLs from the old bucket and decode embedded images into the new one.
- **Survey of the old data** (read-only, the old repository's credential files not opened): two builds wrote the data, so events can have scores by position only (older build), gids with the migration marker, or gids without it. The importer reproduces the old page's rule exactly (`applyScoresToSchedule`: the gid entry wins, positions only when never migrated) before assigning any id. Firebase drops nulls and returns lists as arrays or objects; keys are read in Firebase order, which decided group splits, pairings and standings ties. There is no admin record, no created or published date, and the mobile link data may never have been written.
- **`npm run migrate:firebase -- --file <export.json> [--event=<id>] [--timezone] [--report <out.json>]`**: `src/migration` (pure: `firebase-tree`, `map-event`, `import-plan`, `verify`, `report`) plus `scripts/migrate-firebase.ts`. `--apply` is refused until 7b. Exit 1 while any event has an error or a difference. Event ids start with "-", so they are given as `--event=<id>` (found in testing; a space gave a stack trace, now a plain message).
  - Mapping: "h:mm AM" and hand-typed times to `HH:MM` (typed ones noted); "" or "TBD" to unscheduled; a clashing slot unscheduled (first kept); "TBD" teams to null; a deleted team to null with its code kept in `legacy_team1/2`; a missing division to none; a repeated or missing gid given a repeatable `import-{position}` id; negative scores to 0 and not-numbers to empty (listed); courts, brackets, games per team and colours kept in range (listed); court names made one per court; rules cleaned by the same allow-list as every save; long dashes out of labels; the creation time from the push id; `published_at` left empty (unknown).
  - **Computed-output diff:** the verbatim old code (`scripts/golden/legacy`, now also `ensureGameIds`, `normScore`, `cleanScheduleRow` and `applyScoresToSchedule`, copied from the same `app.js`, hash `4a47d4b61c3c3570`) runs on the raw event; the new public page's own functions (`toEventModel`, `scoredGames`, `computeStandings`) run on the mapped rows. Scores per game, standings per division and resolved playoff teams must match. Expected differences: a clamped negative score, and a game against a deleted team (the old code counted it as a group game still to play).
- **Tests:** `migrate-firebase.test.ts` (32) on a synthetic export (`tests/fixtures/firebase-export.json`, no production data): key order, arrays and objects, push id times, time reading, images; a migrated event (every field, zero differences), an old-build event (positions, typed times, a clash, a deleted team, the negative score as exactly two differences), gids without the marker (a repeated gid, a gap, a reused team code as an error), edge cases, the whole export, the diff catching a changed score, a changed seed and a changed team order, the report, and the CLI (exit codes, `--apply` refused).
- **Evidence (work laptop):** lint and typecheck pass; `test:coverage` 56 files, **832 tests pass**; `src/migration` 99% lines, 97% branches.
- **You, before the first real dry run:** export the old database from the Firebase console (Realtime Database, the three-dot menu, Export JSON) to a folder outside the repository, then run `npm run migrate:firebase -- --file <that file> --report <outside the repo>` and send me the summary lines (not the file). The console works with your owner access, so the expired test-mode rules (27/09/2026) should not block the export; if it is refused, tell me the message.

### Phase 5 plan (remaining slices)

1. Done: 5b. The Phase 2 handovers still open move to 5c: pass stored resolved playoff teams to round robin; add a distinct-days rule on `events.schedule_days` in the database (zod and the save RPC already de-duplicate).
2. **5c, schedule editor.** Done: 5c-1, 5c-2 (drag and drop, E-45) and 5c-3: "+ Round robin" and "+ Playoff" dialogs (E-63, E-64), with stored resolved playoff teams passed to round robin (Phase 2 handover).
3. Done: **5d, rules and images.** Tiptap rules editor (E-70, E-71), logo and sponsor uploads with resizing and removal (E-15 to E-18).
4. Done: **5e, platform admin.** 5e-1 Settings sponsors and the default rules template (S-01, S-02), and 5e-2 the Admins screen (A-09) with set-up links. The dashboard Results action (D-02) moves to Phase 6 with the results inbox; View was already done.
5. Done: E2E journeys 2, 4, 7 and 8 (4 added 27/09/2026; the others were already covered), and the 5e finish review (audit 18/20, its P2 fixed). **Next:** the same audit for the earlier Phase 5 editor surfaces if wanted, then Phase 6 (mobile results inbox).

## Objective

Rebuild the iTala Platform scheduler as iTala Connect (Next.js + Supabase) with full feature parity, real security, tests and a rebranded UI, then migrate existing Firebase data and switch connect.itala.fyi over.

## Decisions

- Next.js App Router replaces Vite; TypeScript strict; Tailwind; shadcn/ui where useful.
- New dedicated Supabase project; individual admin accounts with superadmin and admin roles.
- Platform UI uses the iTala logo palette; organiser-chosen event colours stay in full control of public event pages.
- Migrate existing Firebase data with a repeatable import, verify, then switch over.
- Repository https://github.com/heeaaa/iTala-connect-webapp and Supabase project https://ephhjzrkbjrhcjrwtknn.supabase.co are created (25/09/2026).
  - 26/09/2026: branch `handoff/codex` pushed with draft PR #1.
  - Aeron applied all migrations to the hosted project (`supabase db push`, through `20260926000500_event_editor`) and configured Google sign-in (A-11) with public sign-ups off.
  - Each new migration must be pushed to hosted the same way, after CI passes.
- `.env` on the work laptop points at the hosted project (Aeron's choice for local runs; git-ignored). Keep the `MOBILE_*` values blank until the real mobile import is authorised; they must be the mobile project's URL and **publishable** key, never a secret key.
- 26/09/2026 (Aeron): the Firebase importer (Phase 7, `scripts/migrate-firebase.ts`) is built **after Phase 5**, as planned. Its first real import goes into the **hosted Connect project**: not live yet, it serves as staging, and the import re-runs for the final cutover copy (no separate staging project, which keeps within the free-plan project limit). Dry runs first. The input is a Firebase JSON export kept outside git, and O-1 (the owner of events from the shared login) is still to confirm when it starts.
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
