# PRD: Connect side of mobile scheduled games

Status: Draft implementation brief, 29/09/2026. The scheduled-fixture and manual-approval decisions are confirmed; the Connect-admin linking path is the recommended choice.

This document specifies the Connect work required by [iTala mobile PR #50](https://github.com/heeaaa/iTala-official/pull/50) and its [cross-repository review](https://github.com/heeaaa/iTala-official/pull/50#issuecomment-5885782979). It is the implementation brief for a Claude session working in this repository. Read `CLAUDE.md`, `docs/PRD.md` section 10, `docs/MOBILE_INTEGRATION.md`, and the current code before editing. When commissioned for implementation, this brief supersedes the older instruction that stage 3 is parked.

## Decisions and ownership

1. A mobile league with a published linked Connect schedule must start a scheduled fixture. The mobile app will remove its freeform Start Game route for that state. Existing older freeform games remain readable in Connect.
2. Recommended linking path: linking remains an authenticated Connect admin task. The mobile app opens a Connect admin URL for the league. Connect supports either creating a draft event from that league or linking it to an existing editable event division. No mobile account is granted Connect edit rights by virtue of owning a mobile league.
3. Connect owns events, divisions, fixtures, published scores, and approval. Mobile owns stat events and its final score. Connect continues to read the mobile project only. A final never publishes itself in Connect: an admin approves it in Pending results.
4. A mobile game started for Connect fixture UUID `F` has mobile `game_id` equal to `cg_F`, using the canonical UUID string. This ID is a fixture claim, not proof that the game was started through the mobile Edge Function. Connect must validate it before proposing or approving a result.
5. The Connect implementation can ship before the mobile app update. It must preserve current matching for older mobile games whose IDs do not claim a Connect fixture.

The mobile repository owns the fixture picker, Start Game navigation, the live game action on a scored Schedule card, playoff display parity, and paginated schedule reads. Do not implement those in Connect. Coordinate the shared contract and the end-to-end check with the mobile PR.

## Problem

PR #50 starts a fixture by creating a mobile game with ID `cg_<Connect fixture UUID>`. Its Edge Function does not write to Connect. Connect's current `matchFinals` in `src/domain/mobile-matching.ts` finds only prior `score_sources` links, then guesses from mapped teams and the final's finish day. Two fixtures between the same teams on one day can be ambiguous. A moved fixture can be matched to the wrong game. The current Attach action can also put a claimed result on another fixture. `score_sources` has a primary key on `game_id`, but no uniqueness rule on `mobile_game_id`, so the same final can be approved on multiple Connect fixtures.

The existing Connect admin import and division link wizard provide the right permission boundary for initially unlinked leagues. The mobile empty state can open Connect admin, but the import preview currently leads only to creating a new event. An admin who already has an event needs a clear route from that league preview to the existing division link wizard.

## Goals

- An admin can follow a mobile league link into Connect, create a new draft event or select an existing editable event division, confirm team pairs, and see a published schedule on mobile after publication and refresh.
- A scheduled mobile final proposes only its exact Connect fixture, even if the game was moved to another day or the same teams meet more than once.
- A missing, changed, foreign, already scored, or incorrectly mapped fixture claim cannot silently fall back to another fixture or overwrite a Connect score.
- One mobile final can be approved for at most one Connect fixture, including under concurrent requests.
- The existing five-minute settling check, review checks, drift handling, manual approval, and legacy freeform matching remain intact.
- Connect makes no write to the mobile Supabase project and exposes no mobile or Connect secret to the browser.

## Out of scope

- Creating or linking a Connect event inside the mobile app.
- Automatic approval, live score push, `postFinalScore`, or a Connect write at mobile tip-off.
- Syncing Connect admin scores, defaults, or rosters back into mobile stats or standings.
- Rewriting the mobile Schedule tab or its Edge Function in this repository.
- Migrating old freeform mobile game IDs into `cg_` IDs.

## User journeys

### Link an unlinked league

The mobile app opens `${CONNECT_SITE_URL}/admin/import/${encodeURIComponent(leagueId)}`. The URL contains only the mobile league ID. Connect requires its normal admin sign-in and preserves the destination through sign-in. It re-reads the mobile league using the existing server-only reader and shows the current team preview and existing links.

The admin chooses one of two paths:

- **Create a new event:** use the existing import transaction, creating a draft event, division, and team map. The admin adds a schedule and publishes it.
- **Link to an existing event:** choose an event the admin may edit and one of its divisions, then open the existing division link wizard with this mobile league preselected. The admin reviews the one-to-one team pairs and saves. If the event is already published, the linked schedule becomes eligible for the mobile app on refresh. If it is a draft, it becomes eligible only after publication.

The page warns when the league is linked elsewhere. Replacing an existing division link requires an explicit confirmation that names the current and proposed league. No event, division, or team mapping is created or replaced merely by opening the deep link.

The mobile app should label its empty state "No published Connect schedule" because a draft event may already be linked. Connect admin copy should explain the publish requirement and that only mapped teams can be started from mobile.

### Approve a scheduled final

The mobile scorer starts a published fixture through the mobile Schedule flow. After the mobile game becomes final and has passed the existing settling window, the Connect admin opens Pending results. Connect reads the final as it does today. It decodes the claimed fixture UUID, validates the event, division, league link, mapped teams and score state, then shows that exact fixture under Ready to approve. A changed fixture date is informational; it does not change the match. The admin reviews the score and approves. The existing atomic approval writes `game_scores` and `score_sources`, and the public event then shows the approved score.

If the claim fails validation, the final appears once in Needs a look with a specific reason and no Approve or Attach control. Repairing a link, team map, or fixture and refreshing may make it approvable. Connect never publishes or reassigns it automatically.

## Functional requirements

| ID | Requirement | Acceptance |
| --- | --- | --- |
| CSI-01 | Support the mobile deep link to the existing league import preview. Add an existing-event choice that lists only divisions in events the signed-in admin may edit and leads to the existing link wizard with the league preselected. | New and existing event paths work after sign-in; an admin cannot select another admin's draft or change its link. |
| CSI-02 | Re-read league, event, division, and team data on every linking action. Preserve the existing one-to-one team map checks and warnings for links elsewhere. Require explicit confirmation before replacing a division's current league link. | A stale or forged browser choice changes nothing. Opening a link never writes. |
| CSI-03 | Parse only the full `cg_<UUID>` form as a scheduled fixture claim. Any `cg_` prefix that is malformed is a review case, not a legacy freeform ID. | There is no team/date fallback for any `cg_` result. |
| CSI-04 | Match a valid claim only to that UUID in the current event and the linked division for the final's mobile league. Require both mobile teams to map to the fixture's two Connect teams, allowing reversed orientation. Use the current resolved playoff teams. | Same-day repeats and moved dates propose only the claimed fixture. Wrong event, division, league, or teams cannot be proposed. |
| CSI-05 | Preserve prior approval and drift behaviour when `score_sources` already links the same final to the claimed fixture. If prior provenance points to another fixture, show a conflict and do not silently move the score. | Approved and drifted states still work; inconsistent existing provenance needs review. |
| CSI-06 | A claimed fixture with an existing partial or final Connect score from another source is a conflict. Neither Approve nor Attach may overwrite it. | A one-sided score, a zero score, and a complete score all block an initial scheduled approval. |
| CSI-07 | Show a claimed final at most once per event, assigned to its exact linked division. A claim outside the event or to a removed fixture may be shown once as Needs a look, without exposing another event's private details and without approval controls. | Linking one mobile league to multiple divisions or events does not create multiple approvable cards. |
| CSI-08 | Keep the existing team/date matching and explicit Attach workflow for non-`cg_` legacy finals. A claimed final cannot use generic Attach to a different fixture. | Old recorded fixtures and current inbox journeys continue to pass. |
| CSI-09 | Re-read all relevant data in `approveResult`; the browser submits IDs only. Enforce the claimed fixture binding and one-mobile-final-to-one-fixture rule in the approval transaction as well, not only in the UI. | A stale request, direct RPC call, or concurrent approval cannot attach a claimed final elsewhere or approve the same mobile game twice. |
| CSI-10 | Add a database uniqueness guarantee for non-null `score_sources.mobile_game_id`. Audit existing duplicates before applying it; report and resolve any duplicates deliberately, without silently deleting published scores. | The migration is safe for existing data and concurrent writes cannot bypass the rule. |
| CSI-11 | Keep the mobile reader select-only and the existing admin ownership and RLS boundaries. | Tests observe no insert, update, delete, or RPC sent to mobile; unauthorised Connect users cannot link or approve. |

### Matching order and conflict handling

For each final, check prior approved provenance first. An existing approval to the same claimed fixture remains Approved or Changed since you approved it. An existing approval to a different fixture is a conflict, not a rematch. For finals without prior approval, apply the current review rules and settling window before proposing any fixture. Then:

1. If the ID starts with `cg_`, parse and validate the claim. Require the final's `league_id` to agree with the division's link. The claimed game must be part of the current event and division; current team pairs must match the fixture in either orientation; the target must be unscored for an initial approval. Use the UUID, never the final's date, to select the fixture.
2. An invalid claim goes to Needs a look with a reason such as "Scheduled fixture is not in this event", "Team links changed", or "Connect already has a score for this fixture". It has no Approve or Attach action. Do not reveal another organiser's event name or fixture details.
3. Only a game ID without the `cg_` prefix uses the existing team/date candidate logic and manual Attach behavior.

The `cg_` string is untrusted user-controlled input. It is a precise lookup key after validation, not automatic score authority. A Connect admin still decides whether to publish the final.

## Data and permission design

- Keep the existing `division_mobile_links` and `division_mobile_team_links` as the authority for league and team mapping. Do not match leagues or teams by name during result approval.
- Keep `score_sources` as approved provenance. Add a migration for the non-null mobile game ID uniqueness rule, with a preflight query or documented deployment check for duplicates. Do not silently change existing approvals. Where a scheduled claim is present, the approval RPC must reject a `p_game_id` different from the claimed UUID and verify the linked league before writing. Preserve existing rules for older non-`cg_` sources.
- Retain the `approveResult` server action's fresh inbox read, ownership check, orientation by team, and atomic score plus provenance write. The database rule is the final concurrency boundary.
- The existing mobile reader remains a server-only anonymous session using `MOBILE_SUPABASE_URL` and `MOBILE_SUPABASE_PUBLISHABLE_KEY`. The browser receives only data already permitted by the admin's Connect session. The deep link carries no token or secret.
- Do not add a direct mobile-to-Connect write endpoint or expose `CONNECT_SUPABASE_SERVICE_ROLE_KEY` to Connect browser code.

## Likely implementation areas

- `src/domain/mobile-matching.ts`: parse claims, exact selection and conflict state while retaining legacy matching.
- `src/server/mobile/results.ts`: route finals to the correct linked division, avoid duplicate cards and pass the data needed for exact validation.
- `src/server/actions/mobile-results.ts` and the approval SQL function: fresh approval checks, claimed fixture binding and uniqueness handling.
- `src/app/admin/events/[eventId]/results/results-view.tsx` and `src/lib/mobile-results.ts`: exact fixture explanation, conflict reason and action visibility.
- `src/app/admin/import/[leagueId]/page.tsx` and the existing division link wizard: existing-event path, preselection, permission checks and replacement confirmation.
- A new `supabase/migrations` file and relevant pgTAP tests for the database invariant. Update generated Supabase types if the schema or function signature changes.

These are pointers, not permission to bypass the repository's current architecture. Inspect the current code and tests first; keep the pure matcher independent of Next.js and database I/O.

## Verification and release

Follow `CLAUDE.md`'s reproduce, fail, fix, pass workflow. Use recorded mobile responses and the local Connect database. Required cases include same teams twice on one day, a fixture moved after tip-off, reversed team orientation, playoffs after resolution, a changed team map, a missing or foreign fixture, partial and final existing scores, malformed `cg_` IDs, prior approval and drift, concurrent approvals, and one mobile league linked to multiple events or divisions. Verify that legacy freeform matching still works.

Cover the deep link through sign-in, new event import, existing event selection, team pairing, draft publication, a published event, replacement confirmation, and unauthorised access. Assert zero writes to the mobile project. Run the affected unit, component, pgTAP, integration and E2E tests, then the repository's lint, typecheck, build, coverage and secret checks. Record exact results and distinguish mocked/local verification from a deployed cross-project check.

Deploy the Connect matching and database guard before depending on fixture IDs from the mobile build. Apply and verify the Connect migration with a duplicate preflight; then coordinate the mobile migration, Edge Function secrets and deployment, and mobile build. A real mobile project connection or production migration must follow the repository's existing release approval process. Update `docs/PRD.md`, `docs/MOBILE_INTEGRATION.md`, and `docs/work-status.md` when implementation changes the documented behavior.

The feature is done on Connect's side when an admin can link an unlinked league through Connect, a scheduled mobile final can only be approved for its validated exact fixture, conflicting claims remain unapproved, and all required verification is recorded. Manual approval remains required.
