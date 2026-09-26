# Work status

Last updated: 26/09/2026 (Claude, work laptop)

## Current handoff (26/09/2026, Claude on the work laptop)

**Where things are:** Phase 3b is code complete. Phase 5 slices 5a (publish, matchup report), 5b (published-event editing), 5c-1 (schedule grid and game dialog), 5c-2 (drag and drop) and 5c-3 (round robin and playoff dialogs) are done and pushed on branch `handoff/codex`, and so is Google sign-in (A-11, user decision 26/09/2026). Next: **5d** (rules editor and images). **5c-3 adds a migration** (see its section); push it to the hosted project after CI passes.

**CI now runs the Docker suites.** Draft PR https://github.com/heeaaa/iTala-connect-webapp/pull/1 (`handoff/codex` into `main`, not for merging yet) runs the full workflow on every push. **Run 36214770961 on `cd75ff2` was fully green:**
- 60/60 E2E (390 and 1440 px), 154/154 pgTAP and 22/22 integration.
- Lint, typecheck, unit coverage, build, `check:secrets` and gitleaks.
- This is the first real-Supabase proof of the Phase 3b guard (signed-in Sign out and Back), publish and published editing.
- The first run failed only on my new publish E2E: `getByRole('alert')` also matched Next's route announcer. That was fixed by scoping to `main`.

Latest green run: **36221904647 on `ffedad2` (5c-2 drag and drop): 66/66 E2E**, 154/154 pgTAP, 22/22 integration, 638 unit and component tests, plus lint, typecheck, build, `check:secrets` and gitleaks. The run before it, 36216176809 on `68abdaf` (Google sign-in), was 64/64. Check the PR's latest run after each push (`gh pr checks 1`). The Docker PC is no longer required for routine verification.

**Important for the Docker PC:** 5b adds migration `20260926000500_event_editor.sql` (replaces `save_draft_editor` with `save_event_editor`). Apply it (`npm run db:reset` on the local stack), then run `npm run db:types`. `src/lib/supabase/database.types.ts` was hand-edited for the new function and must come out with **no diff**; if it differs, keep the generated file.

**Laptop split.** The work laptop has no Docker, so pgTAP, integration and E2E are **NOT RUN** there. It proves UI in real Chromium through a local-only harness route (`src/app/prototype/zz-*`, excluded in `.git/info/exclude`, never committed). On the Docker PC, after `git pull`, run:

```bash
npm ci && npm run db:start && npm run env:local
npm run test:db && npm run test:integration
npm run lint && npm run typecheck && npm run test:coverage
npm run build && npm run check:secrets && npm run test:e2e
```

- Expected: **68 E2E tests** (66 green at `ffedad2` plus the 5c-3 additions journey at two viewports) and **180 pgTAP assertions** (154 plus 26 in `008_schedule_additions.sql`). Run `npm run db:reset` for the new migration; `npm run db:types` must show no diff.
- Expected: **22 integration tests**, unchanged since 5b.
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
- **Runs in CI on push, NOT RUN here (Docker):**
  - pgTAP `008_schedule_additions.sql` (26).
  - The E2E "adds a round robin and a playoff to a published schedule", at two viewports.
- **You, after CI passes:** push migration `20260926000600_schedule_additions.sql` to the hosted project (`supabase db push`), as with the earlier migrations.
- **For the finish review:** `.impeccable/design.json` is not updated; DESIGN.md is ("Round robin and playoff dialogs", and the dialog focus rule).

### Phase 5 plan (remaining slices)

1. Done: 5b. The Phase 2 handovers still open move to 5c: pass stored resolved playoff teams to round robin; add a distinct-days rule on `events.schedule_days` in the database (zod and the save RPC already de-duplicate).
2. **5c, schedule editor.** Done: 5c-1, 5c-2 (drag and drop, E-45) and 5c-3: "+ Round robin" and "+ Playoff" dialogs (E-63, E-64), with stored resolved playoff teams passed to round robin (Phase 2 handover).
3. **5d, rules and images.** Tiptap rules editor (E-70, E-71), logo and sponsor uploads with compression and removal (E-15 to E-18).
4. **5e, platform admin.** Settings sponsors and the default rules template (S-01, S-02), the Admins screen (A-09), dashboard View and Results actions (D-02).
5. **Then** E2E journeys 2, 4, 7 and 8, and a finish review per new surface.

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
