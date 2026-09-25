---
version: 1
slug: "src-app-public-events-eventid-page-tsx"
primary_target: "src/app/(public)/events/[eventId]/page.tsx"
related_targets: ["src/app/prototype/today/page.tsx"]
---

# Today screen (public event page, Schedule tab on a game day)

## Scope and mode

Operate. Public event page `/events/[eventId]?tab=schedule` on a game day; prototype at `/prototype/today` with mock data until phase 4 wires real data. Header, sponsor rows, other tabs and the "Powered by iTala Connect" footer are unchanged in scope.

## Audience and job

Spectators, players and families at a league night (typically 1-2 courts, up to 10), phone in hand, no login. Job: when and where does my team play, and what is the score. Owners also enter scores here (P-08).

## Constraints

Colour only from the five `--ev-*` organiser tokens plus division colours. State never by colour alone. No game clock, period or quarter (mobile app owns stats). On court = scheduled slot in progress in the event time zone; Final = slot passed and both scores in; otherwise "Awaiting score".

## Open decisions

PRD rows needed: remembered team per device (P-04 Improve), time-proportional rows (P-05 Improve). Copy locale (NZ vs Canadian English) unresolved.

## Direction contract

THESIS: The event page is the organiser's gym floor. Their colours are the paint, and each court is drawn as a court carrying its live game. Refuses the category's vertical feed of same-size score cards where the court is a small grey label.

OWN-WORLD: The organiser's background is the floor, and flat accent paint lines at crisp 2 px court weight carry every structure. Court outlines have a centre line, centre circle and keys filled with a division-colour tint. Court numbers are stencilled in Big Shoulders Stencil. Numerals and headings use Big Shoulders, team names and body text use Archivo. Space separates the sections, not boxes. There's no glow, no gradient and no wood-grain costume. State is carried by stroke: solid is on court, dashed is up next, a closed baseline tick is final.

STORY: A parent opens the link, sees Court 1 and Court 2 as courts with the live score on the centre circle, finds their team outlined in paint, and knows the next time and court without asking anyone.

FIRST VIEWPORT: Phone, 390 px:
- the event name
- the day strip ("Tonight" plus other days)
- a "Your team" chip
- then Court 1 as a painted full court about 360 x 190 px, with team names and big score numerals on each half and "On court 7:00 pm" in the centre circle. Adaptation (finish review 25/09/2026): "On court, started 7:00 pm" sits in the court header, and the centre circle carries a painted dot. At 390 px the circle is about 48 px across and cannot hold the words without competing with the numerals. The circle keeps the start time only while a court waits for its next game.
- Final and Up next rows under the baseline, and Court 2 starting below the fold

Desktop: the courts side by side, with the grid in full view below. The primary action is the team chip.

FORM: Painted Lines, candidate 7 of 7 on the ordered list, seed key b7ecb8d8. Signature interaction: a single accent "now" line crossing tonight's court x time grid at the current time, with the hour in progress banded. It is the only moving mark apart from a brief paint-in when a score changes. Raises kept: now / next is the grid's current row folded out; one moving mark; time-proportional rows; physical paint; fixed stations Final, On court, Up next.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
