# iTala Connect - Product Requirements (feature parity spec)

Status: draft for review, 25/09/2026. Owner: Aeron.

iTala Connect replaces the iTala Platform scheduler (connect.itala.fyi, vanilla JS + Firebase). **Every feature and behaviour listed here must exist in the new app unless its row says Fix, Improve or Retire.** The migration plan ([MIGRATION_PLAN.md](MIGRATION_PLAN.md)) says how and in what order.

Source of truth for "current behaviour": the `iTala-platform` folder as read on 25/09/2026 (`src/app.js`, `db.js`, `auth.js`, `scheduler.js`, `integration.js`, `mobile-ui.js`, `defaults.js`, `styles.css`, `tests/`). Line numbers refer to that snapshot.

## 1. Product summary

Organisers create basketball events (tournaments or leagues), define divisions and teams, generate a round-robin schedule and seeded knockout brackets, then publish a public page where scores, standings, rosters and rules update live on every device. Results can also be pulled from the iTala mobile scorekeeper app and approved by an admin.

**People**

| Who | Situation | Primary job |
| --- | --- | --- |
| Spectators, players, families | Phone at the venue or at home, no login | Find a game time and court, follow live scores, check standings |
| Event organiser (admin) | Laptop before the event, phone or tablet courtside on game day | Build the event, fix the schedule, enter or approve scores |
| Platform owner (superadmin) | Occasional | Manage every event, admins and platform-wide sponsors |

**Parity codes used below**

- **Keep**: same behaviour and copy (copy may be tightened for NZ English).
- **Fix**: same feature, but a defect found in the old code is corrected. The old behaviour is recorded so reviewers can see what changed.
- **Improve**: same feature, better implementation where the old one was insecure, inaccessible or fragile. No change to what the user can do.
- **Retire**: deliberately not carried over, with the reason.
- **New**: needed only because of the new architecture (for example per-person accounts).

## 2. Roles and access

| ID | Requirement | Old reference | Parity |
| --- | --- | --- | --- |
| A-01 | Three roles: public (no login), admin, superadmin. | `auth.js` | Keep |
| A-02 | Admins sign in with their **own** account (Supabase Auth, email + password, optional magic link). Session is an HttpOnly cookie, refreshed by `proxy.ts`. | Shared passwords compared in the browser, session in `sessionStorage` | Improve |
| A-03 | Superadmin sees and edits every event. Admin sees and edits only events they own. | `canEditEvent`: all admins shared the id `admin`, so any admin could edit any admin-created event | Fix (per-person ownership) |
| A-04 | Every write is checked on the server (Server Action auth check) **and** by Postgres Row Level Security. | Client-side checks only, open database | Improve |
| A-05 | The editor route checks ownership, not only the dashboard list. | `#/admin/edit/:id` had no `canEditEvent` check | Fix |
| A-06 | Draft events are not visible to the public. Owners and superadmins can preview a draft. | `#/event/:id` rendered drafts for anyone with the id | Fix |
| A-07 | Wrong credentials show "Incorrect email or password." (was "Incorrect password"). Logged-in users visiting login go to the dashboard. | `viewLogin` | Improve |
| A-08 | Logout returns to the home page. | Logout called an undefined `Router.go` | Fix |
| A-09 | Superadmin can invite an admin, set role, and disable an account (small Admins screen). Until built, done in the Supabase dashboard with a documented script. | None (accounts were two env passwords) | New |
| A-10 | Brute-force protection on sign-in (Supabase Auth rate limits, generic error message). | None | Improve |

## 3. Routes

| Old hash route | New route | Access | Parity |
| --- | --- | --- | --- |
| `#/` | `/` | Public | Keep |
| `#/login` | `/login` | Public | Improve (real auth) |
| `#/admin` | `/admin` | Admin, superadmin | Keep |
| `#/admin/new` | `/admin/events/new` | Admin, superadmin | Keep |
| `#/admin/edit/:id` | `/admin/events/[eventId]` | Owner or superadmin | Fix (A-05) |
| `#/admin/settings` | `/admin/settings` | Superadmin | Keep |
| `#/event/:id` | `/events/[eventId]` with `?tab=schedule\|standings\|teams\|rules` | Public (published), owner (draft) | Improve (tab in URL) |
| `#/admin/link/:id/:div` | `/admin/events/[eventId]/divisions/[divisionId]/mobile-link` | Owner or superadmin, integration configured | Keep |
| `#/admin/results/:id` | `/admin/events/[eventId]/results` | Owner or superadmin, integration configured | Keep |
| (none) | `/admin/admins` | Superadmin | New (A-09) |
| (none) | `/admin/import-mobile` | Admin, superadmin, integration configured | New (MI-01) |
| Legacy links `https://connect.itala.fyi/#/event/{firebaseId}` | Client redirect on `/` reads the hash, looks up `events.legacy_firebase_id`, redirects to `/events/[eventId]` | Public | New (keeps shared links working) |

## 4. Navigation and shell

| ID | Requirement | Old reference | Parity |
| --- | --- | --- | --- |
| N-01 | Top bar with iTala logo, "Events", and (admin) "Dashboard", (superadmin) "Settings", then "Log out" or "Admin login". Sticky. | `renderNav` app.js:66 | Keep |
| N-02 | "Local Mode" badge. | Shown when Firebase was not configured | Retire (no local-storage mode, see M-10) |
| N-03 | Leaving a public event page removes that event's theme and live subscriptions. | `clearEventTheme` app.js:83 | Keep (automatic with route scoping) |
| N-04 | Not-found and loading states: "Event not found" (editor and public page), loading placeholders on every data screen, mobile screens "Not your event." and "Could not load this event". Real 404 status for unknown events. | app.js:176, 1440; mobile-ui.js:70-84 | Keep + Improve (skeletons, 404) |

## 5. Home (public event list)

| ID | Requirement | Old reference | Parity |
| --- | --- | --- | --- |
| H-01 | Grid of published events: logo (or placeholder), name, "N division(s)", date range first to last event day. | `viewHome` app.js:86 | Keep |
| H-02 | Empty state "No events yet. Published tournaments will appear here." | same | Keep |
| H-03 | Only published events are fetched (the server query filters, not the browser). | Downloaded every event then filtered client-side | Improve |
| H-04 | Order: upcoming and current events first, by first day. | Firebase key order | Improve (was undefined order) |
| H-05 | Dates display as DD/MM/YYYY. | Raw `YYYY-MM-DD` | Improve (organisation standard) |

## 6. Admin dashboard

| ID | Requirement | Old reference | Parity |
| --- | --- | --- | --- |
| D-01 | "My events" table: Name, Status badge (Published / Draft), Divisions count, first date, Actions. Superadmin sees all events; admin sees own. | `viewAdmin` app.js:133 | Keep |
| D-02 | Actions: Edit, View (published only), Results (only when the mobile integration is configured), Delete. | same | Keep |
| D-05 | "Import from iTala mobile" button beside "+ New event", only when the integration is configured (MI-01). | None | New |
| D-03 | "+ New event" button. Empty state "No events yet. Create your first tournament or league." | same | Keep |
| D-04 | Delete asks for confirmation ("Delete "{name}"? This can't be undone.") in an accessible dialog, then deletes the event, its children and its stored images. | `editorDeleteEvent` app.js:161 left images orphaned | Fix |

## 7. Event editor

### 7.1 Structure and saving

| ID | Requirement | Old reference | Parity |
| --- | --- | --- | --- |
| E-01 | New event defaults: status draft, owner = signed-in user, no days, 09:00 to 20:00, 1 court, court names "Court N", theme `#FFCC00 / #0D0D0D / #E0E0E0 / #888888 / #FFFFFF`, no divisions, no sponsors, rules from the platform default template, falling back to the built-in FIBA-style template. | app.js:184-199, `defaults.js` | Keep |
| E-02 | Header buttons: "Save draft" (draft) or "Save" (published), "Publish" (draft only), "Cancel". | app.js:439 | Keep |
| E-03 | Cancel or navigating away with unsaved changes asks "Discard unsaved changes?". | No warning | Improve |
| E-04 | Collapsible sections: Event details, Divisions, Team matchup report, Schedule (published only), Rules. "Expand all" and "Collapse all". Collapse state kept during the session. Headers work with Enter and Space. | `accSection` app.js:317, `editorToggleSection`, `editorSetAllSections`, no keyboard handler | Keep + Fix (keyboard) |
| E-05 | Autosave while published after: drag and drop, game save or delete, round robin, playoff, change of days, hours or courts. Division, team, player, theme, logo edits need Save, as today. | `editorAutoSave` app.js:1376, `editorWindowChanged` app.js:729 | Keep |
| E-06 | Saving the editor never writes scores, score provenance or mobile links. Those have their own tables and actions. | Whole-event merge overwrote newer scores and links (latent) | Fix |
| E-07 | Success feedback as a toast ("Saved", "Created"), errors inline or as a toast with the reason. No `alert()`. | `alert()` everywhere | Improve |
| E-08 | Form state held in React state with typed fields. | Regex parsing of `onchange` attributes | Improve (internal) |

### 7.2 Event details

| ID | Requirement | Old reference | Parity |
| --- | --- | --- | --- |
| E-10 | Event name. | `edName` | Keep |
| E-11 | Courts 1 to 10, with one name per court (default "Court N"). | `editorUpdateCourtNames`, `editorSetCourtName` | Keep |
| E-12 | Daily start and end time (24h input, stored as time). | `edTimeS`, `edTimeE` app.js:470-471 | Keep |
| E-13 | Multi-date calendar picker: month header with previous and next, Sunday to Saturday grid, toggle days, selected days listed and counted "(N selected)", opens on the first selected month or today. Keyboard operable. | `initCalendar`, `renderCalendar`, `calPrev`, `calNext`, `calToggle` | Keep + Improve (keyboard) |
| E-14 | Changing days, hours or courts moves games that no longer fit to Unscheduled, **and tells the user how many moved**. | `reconcileSchedule` app.js:219 (count never shown) | Keep + Fix |
| E-15 | Event logo upload with preview, **and a Remove control**. | `edLogo`, no remove | Keep + Improve |
| E-16 | Major sponsor logo upload with preview and Remove. | `edSponsorMajor`, no remove | Keep + Improve |
| E-17 | Minor sponsor logos, multiple, thumbnails with remove. | `edSponsorMinor`, `editorRemoveMinor` | Keep |
| E-18 | Uploads: image types only, size limit (5 MB before compression), compressed in the browser to max 1600 px, stored in Supabase Storage, replaced or removed objects deleted. Upload failure shows "Upload failed: {reason}". | `DB.uploadImage`, base64 fallback, no limits, orphans | Improve |
| E-19 | **Event page colours chosen by the organiser**: Accent, Background, Text, Muted text, Headings. These drive the public event page exactly as today and are independent of the iTala Connect brand. Editor shows a live preview swatch and a contrast warning (not a block) when text on background is below WCAG AA. | `edColor`, `edBg`, `edTextPri`, `edTextSec`, `edHeading` | Keep + Improve (warning only) |

### 7.3 Divisions, teams, players

| ID | Requirement | Old reference | Parity |
| --- | --- | --- | --- |
| E-20 | Add division: default colour from the six-colour cycle `#6C63FF, #2BBF8A, #E06040, #D4A017, #E06098, #3BACDF`, bracket count 1. | `editorAddDiv` app.js:739 | Keep |
| E-21 | Division card: colour, name, "Brackets" 1 to 4 (splits teams into groups in insertion order), pre-publish "Custom games/team" with 0 to 20, post-publish "+ Round robin" and "+ Playoff", mobile link button, Remove. | `renderDivCard` app.js:630, `editorUpdateDiv`, `editorToggleCustomGames` | Keep |
| E-22 | Removing a division asks for confirmation and states how many games will be removed with it. | `editorRemoveDiv` app.js:740: no confirm, left orphan games | Fix |
| E-23 | Teams: "+ Add team", name, coach, "Players (N)", remove (with confirm if the team has games). | `editorAddTeam`, `editorUpdateTeam`, `editorRemoveTeam` | Keep + Fix (confirm) |
| E-24 | Players dialog: rows of name and jersey number (text), add, remove, Done. Typed-but-unsaved rows are kept when adding or removing a row. | `editorEditPlayers`, `editorAddPlayer`, `editorRemovePlayer`, `editorSavePlayers` (lost unsaved rows) | Keep + Fix |
| E-25 | Unused division flags `playoff` and `seedBracket`. | Written, never read | Retire |

### 7.4 Team matchup report

| ID | Requirement | Old reference | Parity |
| --- | --- | --- | --- |
| E-30 | Per division, an N x N grid of how many group games each pair plays (unscheduled count, playoff and TBD excluded). Self "-", none "-", one "1", repeats highlighted with a tooltip. Sticky headers, horizontal scroll. | `renderMatchupReport` app.js:376, `buildMatchupCounts` app.js:360 | Keep |
| E-31 | Section meta "N repeated matchup(s)" or "No repeated matchups". Summary chips: total games, repeated matchups, pairings not scheduled. Hints for no divisions and fewer than 2 teams. | same | Keep |

### 7.5 Schedule editor (published events)

| ID | Requirement | Old reference | Parity |
| --- | --- | --- | --- |
| E-40 | One grid per day: time column plus one column per court (court names). Rows for every hourly slot in the window plus any off-grid times in use. | `renderScheduleGrid(evt,true)` app.js:1206 | Keep |
| E-41 | End time minutes respected consistently in grid and reconciliation. | Grid ignored end minutes | Fix |
| E-42 | Game card: division colour border and tint, label, "Team 1 vs Team 2", Edit. Playoff cards show resolved team names where known. | Editor always showed "TBD vs TBD" for playoffs | Keep + Improve |
| E-43 | Semi and final cards use a valid playoff colour. | `getPlayoffColor` returned `rgb()` into hex maths, giving `NaN` | Fix |
| E-44 | Unscheduled row: "Unscheduled {count}", "Drop a game here to clear its time slot." | app.js:1206 | Keep |
| E-45 | Drag and drop: drop on a game swaps day, time and court; drop on an empty slot moves; drop on Unscheduled unschedules; unscheduled onto scheduled swaps. Autosaves. **Works with mouse, touch and keyboard** (dnd-kit). No rest-gap check on manual moves (unchanged), but a non-blocking warning when a move breaks the 120-minute rest rule. | `schedDragStart`, `schedDragOver`, `schedDrop`, `schedDropSlot`, `schedDropUnscheduled` | Keep + Improve |
| E-46 | "+ Add game" and "Edit" open a dialog: Day ("Unscheduled" or a day), Time, Court (court names), Division, Label, Team 1, Team 2 (TBD or any team across divisions as "Team (Division)"), Type (Group, Semi, Final), Delete (existing games), Cancel, Save. | `editorAddGame`, `editorEditGame` app.js:960-966 | Keep |
| E-47 | Validation: "A team can't play itself. Pick two different teams."; time must be a valid time (a time picker replaces free text, so "9:00 am" case mismatches cannot happen); slot collision "That slot ({day} {time} {court}) is already taken."; blank day or time means unscheduled. | `editorSaveGame` app.js:1017 | Keep + Improve (typed time) |
| E-48 | Court choices loop to the event's court count (fallback 3 only if unset). | `e.courts||3` | Keep |
| E-49 | Delete game: confirm "Delete this game?", removes the game **and its score**. | `editorDeleteGame` app.js:1072 (left the gid score orphaned and shifted positional scores) | Fix |
| E-50 | Editing a playoff game keeps its bracket sources. If the admin picks teams by hand, the dialog explains that bracket resolution will replace them, with an option to detach the game from the bracket. | Silent overwrite | Improve |

### 7.6 Schedule generation

| ID | Requirement | Old reference | Parity |
| --- | --- | --- | --- |
| E-60 | Publish validation, same messages: at least one date; at least one division; **every** division with teams needs at least 2 teams (a division with 0 or 1 team is named in the message); custom games per team must be above 0 when ticked; scheduler error; "Could not generate any games..." | `editorPublish` app.js:1091 (only checked that one division had 2 teams) | Keep + Fix |
| E-61 | Publish generates the whole schedule with the exact same algorithm (section 12). | `Scheduler.generateSchedule` | Keep |
| E-62 | Re-publish rebuilds from scratch. If scores exist it warns "Re-publishing rebuilds the whole schedule from scratch. N recorded score(s) will be cleared. Continue?"; if the count cannot be read it asks "Could not check whether this event has recorded scores..." before continuing. Runs atomically (a failure changes nothing). | app.js:1091, app.js:1171, `countRecordedScores` app.js:1187 | Keep + Improve (atomic) |
| E-63 | "+ Round robin" dialog: "{n} teams. A full round robin is {games} games ({max} per team). Matchups already on the schedule are skipped...", "Custom games/team" with 1 to max (default: the division's saved value, else min(3, max)), same validation messages, saves the chosen value back to the division, skips existing pairings, fills free slots only, reports "{n} game(s) added" and how many went to Unscheduled. | `editorAddRoundRobin`, `editorRRToggle`, `editorGenerateRoundRobin` app.js:848-888 | Keep |
| E-64 | Needs at least 2 teams ("Need at least 2 teams."). "+ Playoff" dialog: "How many teams advance? (max N)", default min(N, 4), range 2 to N; success "N playoff game(s) added!". A second playoff on the same division reuses bracket ids exactly as today (first match wins). Generates a seeded single-elimination bracket and places games starting 1 hour after the latest game, 60-minute steps, court 1, rolling to the next day. Games that cannot fit go to Unscheduled rather than an invalid time. | `editorAddPlayoff`, `editorGeneratePlayoff` app.js:744-759 (overflowed onto last day with no collision check) | Keep + Fix |

### 7.7 Rules

| ID | Requirement | Old reference | Parity |
| --- | --- | --- | --- |
| E-70 | Rich text editor with Bold, Italic, Underline, Heading 2, Heading 3, bullet list, numbered list (Tiptap). | `rteCmd`, `rteBlock` (`document.execCommand`) | Keep + Improve |
| E-71 | Stored HTML is sanitised on save and on render to an allow-list of those tags. | Raw HTML injection | Fix (XSS) |

## 8. Platform settings (superadmin)

| ID | Requirement | Old reference | Parity |
| --- | --- | --- | --- |
| S-01 | Primary sponsors (every event, full size) and secondary sponsors (every event, half size): multi-upload, thumbnails, remove. Concurrent uploads never lose entries. | `viewSettings` app.js:1386, `platform/sponsors`, `gsRemove` (read-modify-write race) | Keep + Fix |
| S-02 | Default rules template used for new events. The old app read it but had no editor; the new Settings page adds a simple editor for it. | `platform/defaultRulesHtml` read only | Improve (the read path already existed) |
| S-03 | Dead helpers `platform/globalSponsors`, `platform/ruleTemplate`. | Never called | Retire |

## 9. Public event page

| ID | Requirement | Old reference | Parity |
| --- | --- | --- | --- |
| P-01 | Header: event name, date range, sponsor rows (global secondary + event minor small; global primary + event major large), event logo; empty blocks hidden; on mobile the order is logo, major, minor. | `renderPublicEvent` app.js:1467 | Keep |
| P-02 | **Organiser theme**: the five event colours apply to the whole page (nav, tabs, tables, chips, legend, rules). iTala Connect brand tokens apply outside event pages and never override event colours inside. | `--ev-*` vars, `body.pub-themed` | Keep |
| P-03 | Tabs: Schedule, Standings, Teams, Rules. Selected tab is in the URL (shareable, survives reload). | `pubSwitchTab`, module variable | Keep + Improve |
| P-04 | Schedule: legend of division colours plus "Semis / Finals"; team filter chips grouped by division with active chip in the division colour and "Clear"; non-matching games dimmed, matching highlighted, non-matching unscheduled games hidden. The chosen team is remembered on this device per event (confirmed 25/09/2026). | `renderPublicScheduleBody` app.js:1782, `pubSetFilter` (filter reset on reload) | Keep + Improve |
| P-05 | Per-day tables with rows sized to time from the first game to the last (an empty hour shows as a gap; confirmed 25/09/2026), court columns up to the highest used court; card shows label, teams, score row once both teams are known; "Unscheduled" table; "No schedule yet." | same | Keep + Improve |
| P-06 | Playoff teams resolve from standings and bracket results using the exact same rules (section 12.5). | `resolveAllPlayoffs` app.js:1736 | Keep |
| P-07 | Live scores: every device updates within a few seconds of a score change without reload (Supabase Realtime). Schedule edits also refresh live. | Firebase listener on scores only | Keep + Improve |
| P-08 | Owners and superadmins see score inputs (number, min 0) on the public page; blank clears; writes on change; editing a score by hand removes its mobile provenance. | `pubScoreChange` app.js:1926 | Keep |
| P-09 | Standings per division: #, Team, W, L, PF, PA, +/-; top three rank colours; diff colour; "No standings data." Same maths (section 12.4). | `renderPublicStandings` app.js:1940 | Keep |
| P-10 | Teams: per division, expandable team cards with name, "Coach: X", "N players", and a player list (index, #number, name). "No teams." | `renderPublicTeams` app.js:1963 | Keep |
| P-11 | Rules: sanitised rules HTML. "No rules." | `renderPublicRules` app.js:1979 | Keep + Fix |
| P-12 | Page is server-rendered (fast first load, shareable link previews with event name and logo). | Client-rendered | Improve |
| P-13 | Game day ("Today" screen): when the chosen day is today in the event time zone, each court shows Final, On court and Up next above the grid, with a "now" line across the grid. On court = the 60-minute slot is in progress; Final = the slot has passed and both scores are in; otherwise "Awaiting score". Opens on today, else the next event day, else the last. Design: Today surface brief (Painted Lines). | None | New |

## 10. Mobile scorekeeper integration

| ID | Requirement | Old reference | Parity |
| --- | --- | --- | --- |
| M-01 | Integration is off unless the mobile app's Supabase URL and key are configured (server-side env). When off, no Link or Results UI appears. | `Integration.init` | Keep |
| M-02 | Reads mobile leagues, teams and the `final_game_scores` view. **Never writes** to the mobile database. Runs on the server only; the browser never talks to the mobile project. | `integration.js` (browser, anonymous sign-in) | Keep + Improve |
| M-03 | Link wizard per division: pick a mobile league ("name (season)", tagged archived or closed), map every division team to a mobile team (one-to-one, "not in the mobile app" allowed), pre-filled by name normalisation, warning if another division links the same league, save to go to Results. Same messages. | `mobile-ui.js` 65-209, `mobileWizPickLeague`, `mobileWizSave`, `proposeTeamPairs`, `norm` | Keep |
| M-04 | Pending results inbox with groups in order: Ready to approve, Changed since you approved them, More than one fixture matches, Still settling, Needs a look, Team not linked, No fixture matches, Approved. Refresh and Back. | `mobile-ui.js` 215-472, `mobileResultsRefresh` | Keep |
| M-05 | Card: "Home pts - pts Away", league, finish time, stat count, fixture label, "a different day" note, drift text "Published a-b, the mobile app now says c-d". | same | Keep |
| M-06 | Actions: Approve, Re-approve, Keep published score, Attach to a fixture (unscored fixtures in the division, with confirm; offered for proposed, ambiguous and unmatched only, never for review or settling). Approval needs both teams linked ("Link both teams for this division before approving this result."). Orientation by team, never position. No auto-approve. | `mobileApprove`, `mobileDismissDrift`, `mobileAttach`, `orient`, mobile-ui.js:380-387, 435 | Keep |
| M-07 | Matching rules identical to `matchFinals`, `reviewReason`, settling window 5 minutes, `scoredGidSet` (0 is a score, one-sided score counts). Safety refusals kept: if existing scores cannot be read, or game ids cannot be prepared, nothing can be approved and the inbox says why. | `integration.js`, mobile-ui.js:233-243, 287-290 | Keep |
| M-08 | "Same day" is decided in the **event's time zone** (new event setting, default `Pacific/Auckland`, editable). | Admin browser's local time zone | Improve (server has no browser zone) |
| M-09 | Playoff games can be approved once their teams are resolved. | Impossible: stored playoff teams were always TBD | Improve |
| M-10 | Local Mode (whole app in browser localStorage when Firebase was blank). Developers use the local Supabase stack instead. | `db.js` localStorage engine | Retire |

## 10A. Mobile league import (first slice)

Full design: [MOBILE_INTEGRATION.md](MOBILE_INTEGRATION.md) stage 1. This is new functionality, built first, and read only towards the mobile app.

| ID | Requirement | Parity |
| --- | --- | --- |
| MI-01 | Dashboard button "Import from iTala mobile" opens a league list fetched on the server. Hidden when the integration is not configured. | New |
| MI-02 | League list: name, season, team count, Closed and Archived tags, "Linked to {event}" when a Connect division already links the league. Drop-in (recreational) spaces hidden unless "Show drop-in spaces" is ticked. Loading, empty ("No leagues found in the iTala mobile app.") and unreachable ("Can't reach the iTala mobile app right now. Try again.") states. | New |
| MI-03 | Preview: teams (name, coach, player count, Team only tag) and players (number, name) in mobile roster order. Editable event name and division name, both defaulting to the league name. | New |
| MI-04 | Create event: one transaction creates a draft event (E-01 defaults, owned by the admin), one division, its teams and players, the division link and the one-to-one team map, and an audit row. Redirects to the editor with "Event created from {league}. Add dates and courts, then publish." | New |
| MI-05 | Already-linked warning with "Open existing event" and "Create anyway". Fewer than 2 teams allowed with the note "You'll need at least 2 teams before you can publish." | New |
| MI-06 | Imported players keep their mobile player id. Team colours, logos, games and stats are not imported. | New |
| MI-07 | Linked divisions skip the link wizard: the results inbox (M-04) works for them straight away. | New |
| MI-08 | Nothing is ever written to the mobile project, and nothing is deleted in either app by an import. | New |
| MI-09 | Roster refresh on a linked division: list mobile teams and players not yet in Connect and name differences, add on request, never remove (stage 1b). | New |

## 11. Non-functional requirements

| ID | Requirement |
| --- | --- |
| X-01 | No secret reaches the browser. Only `NEXT_PUBLIC_*` values are public, and those are publishable by design. A CI check fails the build if a server-only value appears in `.next/static`. |
| X-02 | All env values validated at startup (zod). Missing or placeholder values fail fast with the variable name, never the value. |
| X-03 | Security headers: CSP (nonce-based), HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `frame-ancestors 'none'`. |
| X-04 | WCAG 2.2 AA for iTala Connect screens. Event pages meet AA with default event colours; organiser colours get a warning, not a block (E-19). axe-core checks in E2E. |
| X-05 | Works at 360 px wide and up. Touch targets at least 44 px. Tables scroll horizontally inside their card, never the page. |
| X-06 | Public event page: Largest Contentful Paint under 2.5 s on a mid-range phone over 4G for a 100-game event. |
| X-07 | NZ English copy, dates DD/MM/YYYY, times "9:00 am" style, time zone Pacific/Auckland unless the event says otherwise. No long dashes in UI copy. |
| X-08 | Free tiers only: Netlify free, Supabase free (watch the 7-day pause rule, 500 MB database, 1 GB storage). |
| X-09 | Every data change that matters (publish, re-publish, score entry, approval, delete) is recorded in an audit table with who and when. |
| X-10 | Installable PWA manifest and icons. No offline score entry and no push notifications in scope. |

## 12. Business rules to port exactly

These are pure functions. They are ported to TypeScript in `src/domain/` and proven identical to the old JavaScript with golden-file tests (see MIGRATION_PLAN.md, testing).

### 12.1 Time slot grid (`Scheduler.buildSlotGrid`)

- Days sorted ascending. Rows from start time in 60-minute steps while `start < end` (end exclusive, minutes honoured). Courts 1 to N.
- Slot key is day + time + court.

### 12.2 Round robin (`circleRounds`, `divisionRounds`, `buildRounds`)

- Circle method, first team fixed, others rotate. Odd team counts get a bye.
- Odd team counts are padded with a bye first, so with m = the padded count (n if even, n + 1 if odd) rounds wanted = min(games per team, m - 1) when custom, otherwise m - 1. A full round robin is n - 1 rounds for even n and n rounds for odd n, matching `maxRoundsFor(n)`. (Checked by running the old code: 4 teams give 3 rounds and 6 games; 5 teams give 5 rounds and 10 games.)
- `bracketCount > 1` splits teams in insertion order into chunks of ceil(n / count). Chunks under 2 teams are dropped (teams in them get no games; the editor now shows a warning, E-60).
- Group label "{division} - Group {A..D}".
- Rounds are merged across groups, then across divisions, index by index (divisions interleave).

### 12.3 Placement (`placeGames`)

- Walk day, then time row, then court. Existing games occupy slots and count toward rest.
- A team must rest 120 minutes between its own games on the same day (`MIN_GAP`).
- Pick score: `round * 1000 + (gamesToday(t1) + gamesToday(t2)) * 10 + index * 0.001`, lowest wins.
- Pass 1 (strict): while any pending team has not played that day, skip games where both teams have already played that day. Pass 2 fills the rest.
- Leftovers are parked Unscheduled, never dropped.
- `sortSchedule`: scheduled first by day, time, court; unscheduled last, stable.
- Post-publish round robin skips existing pairings in that division and only fills free slots.

### 12.4 Standings

- Counted: games in the division that are not playoff, semi or final, have both scores, and both teams belong to the division.
- W or L only when scores differ. A level game adds PF and PA but no W or L.
- Sort: W desc, point difference desc, PF desc, then insertion order.
- `regression.js` hand-checked cases (winner 1/0/61/58/+3, level 0/0/74/74/0, unplayed zeros) become unit tests.

### 12.5 Playoffs (`generateBracket`, `resolvePlayoffTeams`, `resolveAllPlayoffs`)

- Bracket size p = next power of two. Round 1 pairs seed i + 1 with p - i; missing opponents are byes.
- Round 1 labels: up to 4 teams "Semi n", up to 8 "Quarter n", else "R1 n", all type semi. Later rounds: 2 sources "Finals" (type final), 4 sources "Semi n", else "R{round} n". Label "{division} - {round label}".
- Seeds use whole-division standings (groups ignored) and only resolve when the division has **at least one** group game and **every** group game has both scores (app.js:1728-1734). Winner sources resolve as soon as the referenced game has both scores; higher score wins; a tie stays TBD.

### 12.6 Mobile matching

- State order: prior provenance (approved, or drifted if points, event count or last event time changed), review, settling, unlinked, then candidates (one same-day or one overall is proposed, more is ambiguous, none is unmatched).
- Review reasons in order: no stats, same team both sides, no finish time, level score.
- Settling: 0 <= now - last event < 5 minutes.

## 13. Data to carry across

Every event, division, team, player, game (including unscheduled and orphaned games), score (by stable game id, falling back to positional score for unmigrated events), score provenance, mobile link, event and platform sponsor image, theme, court names, rules, and the platform default rules template. See MIGRATION_PLAN.md section 8.

## 14. Out of scope for the migration

- Mobile app pulling the schedule from iTala Connect (stage 3 in [MOBILE_INTEGRATION.md](MOBILE_INTEGRATION.md); parked plan in [SCHEDULER_INTEGRATION_PLAN.md](SCHEDULER_INTEGRATION_PLAN.md); the schema is designed so that becomes a read-only endpoint later).
- Player stats and leaderboards from the mobile app.
- Payments, registrations, notifications.
