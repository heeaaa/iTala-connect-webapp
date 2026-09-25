---
name: iTala Connect
description: Basketball tournament and league scheduler. Public event pages are painted in the organiser's own colours.
colors:
  ev-accent: "#FFCC00"
  ev-on-accent: "#000000"
  ev-bg: "#0D0D0D"
  ev-text: "#E0E0E0"
  ev-muted: "#888888"
  ev-heading: "#FFFFFF"
  rule: "color-mix(in srgb, #888888 38%, #0D0D0D)"
  floor-tint: "color-mix(in srgb, #FFCC00 5%, #0D0D0D)"
  paint-band: "color-mix(in srgb, #FFCC00 13%, #0D0D0D)"
  paint-faded: "color-mix(in srgb, #FFCC00 55%, #0D0D0D)"
typography:
  display:
    fontFamily: "Big Shoulders, system-ui, sans-serif"
    fontSize: "clamp(2.5rem, 9vw, 5rem)"
    fontWeight: 800
    lineHeight: 0.92
    letterSpacing: "-0.005em"
  score:
    fontFamily: "Big Shoulders, system-ui, sans-serif"
    fontSize: "min(15cqi, 5.5rem)"
    fontWeight: 800
    lineHeight: 1
    fontFeature: "tnum"
  headline:
    fontFamily: "Big Shoulders, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "0.01em"
  court-name:
    fontFamily: "Big Shoulders Stencil, Big Shoulders, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "0.04em"
  title:
    fontFamily: "Big Shoulders, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    letterSpacing: "0.03em"
  body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  team-name:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 500
    lineHeight: 1.25
  label:
    fontFamily: "Big Shoulders, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 700
    letterSpacing: "0.05em"
  small:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
    letterSpacing: "0.02em"
rounded:
  paint: "2px"
  dot: "50%"
spacing:
  line: "2px"
  xs: "0.25rem"
  sm: "0.5rem"
  md: "1rem"
  lg: "2rem"
  xl: "2.5rem"
  xxl: "3rem"
  gutter-phone: "1rem"
  gutter-wide: "2rem"
  measure: "85rem"
  touch: "2.75rem"
components:
  tab:
    textColor: "{colors.ev-muted}"
    typography: "{typography.title}"
    height: "2.75rem"
    padding: "0 0.875rem"
  tab-active:
    textColor: "{colors.ev-heading}"
  chip:
    backgroundColor: "transparent"
    textColor: "{colors.ev-text}"
    rounded: "{rounded.paint}"
    height: "2.75rem"
    padding: "0 0.875rem"
  finder-toggle:
    backgroundColor: "transparent"
    textColor: "{colors.ev-heading}"
    rounded: "{rounded.paint}"
    height: "3rem"
    padding: "0 1rem"
  text-button:
    backgroundColor: "transparent"
    textColor: "{colors.ev-text}"
    height: "2.75rem"
    padding: "0"
  grid-cell:
    backgroundColor: "{colors.ev-bg}"
    textColor: "{colors.ev-text}"
    rounded: "{rounded.paint}"
    padding: "0.5rem 0.625rem 0.75rem"
  grid-cell-on-court:
    backgroundColor: "{colors.paint-band}"
  status-tag-on-court:
    backgroundColor: "{colors.ev-accent}"
    textColor: "{colors.ev-on-accent}"
    padding: "0 0.375rem"
  score-input:
    backgroundColor: "{colors.ev-bg}"
    textColor: "{colors.ev-heading}"
    rounded: "{rounded.paint}"
    width: "3.75rem"
    height: "2.75rem"
    padding: "0 0.375rem"
---

# Design System: iTala Connect

## Overview

**Creative North Star: "Painted Lines"**

The public event page is the organiser's gym floor. The organiser's background colour is the floor, and their accent colour is the line paint. Every structure on the page is a flat painted line at court weight (2 px), and each court is drawn as a real court (FIBA proportions, centre line, centre circle, keys filled with a division-colour tint) carrying its live game: team names on each half, big score numerals, the court number stencilled above it. Space separates sections, not boxes. There is no glow, no gradient, no shadow and no wood-grain costume.

This document governs **public event pages only** (`/events/[eventId]`). Inside that route every colour comes from the organiser's five event colours (`--ev-accent`, `--ev-bg`, `--ev-text`, `--ev-muted`, `--ev-heading`), the derived `--ev-on-accent`, and per-element division colours (`--div`, `--on-div`). The hex values in the frontmatter are the **default event theme** a new event starts with, not a brand palette; another organiser's page will carry completely different values through the same tokens, including light floors (see `.impeccable/review/mobile-light-4courts.png` and `desktop-light-owner.png`). The only iTala element on an event page is the small "Powered by iTala Connect" footer.

**iTala Connect platform screens (home, login, admin): not yet decided.** They will use the iTala logo palette (navy, teal, lime) in a later design round. The `--brand-*` values currently in `src/app/globals.css` are Phase 1 placeholders and are not part of this system. Do not derive platform tokens from this document.

The page is dense but calm: answer first (time, court, teams, score), readable at a glance in a bright gym on a mid-range phone, working from 360 px wide with 44 px touch targets. Copy is NZ English, dates DD/MM/YYYY ("Fri 25/09/2026"), times "7:00 pm", in the event's time zone.

**Key Characteristics:**
- Organiser colours only, applied as paint on the organiser's floor.
- Constant 2 px paint lines; quiet 1 px rules for secondary separation.
- State carried by stroke and by words: solid is on court, dashed is up next, a closed baseline tick is final.
- Tall condensed athletic lettering (Big Shoulders) for numerals and headings, stencil cut for court numbers, Archivo for names and body.
- One moving mark (the "now" line) plus a brief paint-in when a score changes.

## Colors

The palette is whatever the organiser chose; the system defines roles and the derived mixes, never fixed hues.

### Primary
- **Line Paint** (`--ev-accent`, default Court Yellow, see `ev-accent`): court lines, the active tab and day over-paint, the "your team" underline, the on-court dot, the now line and its tag, the final baseline tick, focus outlines, text selection. Also exposed locally as `--paint`.
- **Paint Contrast** (`--ev-on-accent`, see `ev-on-accent`): text sitting on solid paint (the on-court status tag, the now tag, selected text). Computed by `readableOn()` as black or white, whichever has the higher WCAG contrast against the accent; never chosen by hand.

### Neutral
- **Floor** (`--ev-bg`, default Night Floor): the page ground and the fill of every grid cell and input.
- **Body Ink** (`--ev-text`, default Chalk Grey): body copy, team names in cells, chip labels.
- **Muted Ink** (`--ev-muted`, default Bench Grey): dates, statuses, legends, grid hours, station terms, filtered-out games.
- **Heading Ink** (`--ev-heading`, default White): event name, section titles, court names, team names on the court, score numerals, times in stations.

### Derived paint (computed from the live tokens with `color-mix` in sRGB)
- **Quiet Rule** (`rule`, `--ev-muted` 38% into `--ev-bg`): 1 px station and grid-hour rules, the tab sideline, the footer rule, final and awaiting-score cell borders, filtered-out cells.
- **Floor Tint** (`floor-tint`, `--ev-accent` 5% into `--ev-bg`): the court's playing surface and the lettering patches that stop lines crossing names and scores.
- **Paint Band** (`paint-band`, `--ev-accent` 13% into `--ev-bg`): the hour in progress across the day grid, and the fill of on-court cells.
- **Faded Paint** (`paint-faded`, `--ev-accent` 55% into `--ev-bg`): dashed up-next cell borders, court lines once a court is final or empty, the scrollbar thumb.
- **Filter Tint** (`--ev-accent` 9% into `--ev-bg`): fill of cells matching the chosen team.

### Division colours
Each division carries an organiser-chosen `--div` with a computed `--on-div`, set per element by `divisionVars()`. Used for the court keys (`--div` 34% into `--ev-bg`), square swatches beside division names, chip borders (`--div` 70% into `--ev-bg`), chip hover (16%) and the selected chip fill (solid `--div` with `--on-div` text). Semis and finals use Line Paint as their swatch. An invalid colour falls back to the default accent.

### Named Rules
**The Organiser's Paint Rule.** Inside `/events/[eventId]` every colour is an `--ev-*` token, a division token, or a `color-mix` of them. No hex literals, no Tailwind colour utilities, and no `--brand-*` token ever applies there.

**The Never Colour Alone Rule.** Every state that has a colour also has words and a stroke pattern ("On court", "Final", "Awaiting score", "Up next"). A division is named next to its swatch. An organiser palette with poor contrast must still read.

## Typography

**Display Font:** Big Shoulders (with system-ui, sans-serif)
**Stencil Font:** Big Shoulders Stencil (with Big Shoulders, system-ui)
**Body Font:** Archivo (with system-ui, sans-serif)

All three are self-hosted through `next/font` (`src/app/event-fonts.ts`) as `--font-ev-display`, `--font-ev-stencil` and `--font-ev-body`, so the CSP's `font-src 'self'` holds.

**Character:** Tall, condensed athletic signage for numbers and headings, like scoreboard and gym-wall lettering, against a plain, sturdy grotesque that keeps long team names legible at small sizes.

### Hierarchy
- **Display** (800, clamp(2.5rem, 9vw, 5rem), 0.92, uppercase, balanced): the event name, once per page.
- **Score** (800, min(15cqi, 5.5rem), 1, tabular): the numerals on each half of a drawn court. Container-query sized so the court scales as one piece.
- **Court name** (stencil 800, 1.75rem, 0.04em, uppercase): "Court 1" above each drawn court; 1.125rem and 0.05em in the day grid header.
- **Headline** (800, 1.5rem, 1.1, 0.01em, uppercase): section titles such as "Tonight's games". The team-finder answer uses 2rem at line-height 1.
- **Title** (700, 1.125rem, 0.03em, uppercase): event tabs. The finder toggle uses 800 at 1.25rem.
- **Body** (Archivo 400, 1rem, 1.5): running text, empty states (1.0625rem, muted).
- **Team name** (Archivo 500, 0.9375rem, 1.25): grid cells and stations, hyphenating only when one word cannot fit; 700 with the paint underline for the spectator's team. On the drawn court, 700 at clamp(0.875rem, 4.3cqi, 1.3rem), centred and balanced.
- **Label** (Big Shoulders 700, 0.875rem, 0.05em, uppercase): station terms ("Final", "Up next").
- **Small** (Archivo 600, 0.8125rem): legends, grid hours, footer; cell labels and statuses at 0.75rem.

### Named Rules
**The Tabular Numerals Rule.** Every score, time and date uses `font-variant-numeric: tabular-nums` so live changes never shift the layout.

**The Stencil Is For Courts Rule.** Big Shoulders Stencil marks court numbers only, like a floor stencil. It is never used for headings, scores or body.

## Layout

A single centred column capped at 85rem, with a 1rem side gutter on phones and 2rem from 48rem up. The event name, tabs and content share that measure. Sections stack with space (2.5rem between main sections, 2rem between courts, 1.5rem above the layout), never inside cards.

- **Phones (below 40rem):** courts stack one per row; with three or more courts they become a horizontal snap rail at 88% width each so the page stays short. The day grid keeps two courts in view without sideways scroll (3.5rem hour gutter, 8.25rem minimum columns) and scrolls inside itself beyond that, never the page. Below 24rem cell padding and names tighten. The team finder collapses behind a full-width outlined toggle.
- **40rem and up:** courts sit side by side (auto-fit, minimum 20rem each).
- **68rem and up:** a 19rem sticky sidebar holds the team finder beside the main column (3rem gap).
- **Day grid:** time-proportional rows in 5-minute steps (an hour is 6.75rem tall), a sticky hour gutter, one column per court (minimum 10.5rem). Rows grow when names wrap, so nothing is cut off.
- **Touch:** every interactive element is at least 2.75rem (44 px) tall.

## Elevation & Depth

Flat. There are no shadows anywhere in this world. Depth is expressed as paint on a floor: tonal tints of the accent mixed into the floor (Floor Tint, Paint Band) and stroke weight. Layering exists only where sticky or overlapping elements need an opaque floor behind them (the sticky hour gutter, lettering patches on the court).

### Named Rules
**The Flat Paint Rule.** No box-shadow, no glow, no gradient, no texture. If something needs emphasis, give it heavier paint or a tint, not a lift.

**The Floor Patch Rule.** Lettering that sits on a drawn court sits on a patch of Floor Tint, so painted lines never cross a name or a score.

## Shapes

Lines, not surfaces. Structure is drawn with strokes at a constant weight: 2 px paint (`--line`) for court lines, tab and day over-paint, chip and toggle outlines, active cells and the now line; 1 px Quiet Rule for secondary separation. Heavier strokes are reserved: 3 px for the chosen team's cells and the focus outline, 4 px for the active tab and the final tick on grid cells, 6 px for the final baseline tick on a drawn court. Court SVG lines use non-scaling strokes so the weight holds at any size.

Corners are nearly square (2px) on every outlined element. Circles appear only where the court has them: the centre circle, the on-court dot, the feed mark. Swatches are hard squares. The drawn court keeps FIBA proportions (28 by 15).

### Named Rules
**The Two Pixel Rule.** Paint is 2 px. Anything thicker is a deliberate state signal from the list above, never decoration.

**The Stroke Carries State Rule.** Solid paint is on court. Dashed paint (7 on, 5 off on the court; CSS dashed on cells) is up next. A closed baseline tick is final. Faded paint is a court that has finished or has no more games. Awaiting score is a quiet 1 px outline with no tick.

## Components

Components are painted outlines on the floor: confident, legible from arm's length, and quiet until something is live.

### Buttons
- **Outlined toggle** (the phone "Find your team" control): full width, 3rem tall, 2 px paint outline, 2px corners, transparent fill, heading-ink Big Shoulders 800 uppercase. A drawn chevron (two paint strokes, not a glyph) turns up over 200ms while open.
- **Text button** ("Change team" and similar): no box, body ink at 600, a 2 px paint underline offset 0.3em; heading ink on hover.
- There is no filled primary button on the public page.

### Chips
- **Team chip:** 2.75rem tall, 2px corners, transparent fill, 2 px outline in the division colour (70% into the floor), Archivo 500.
- **Hover:** a 16% division tint fill.
- **Selected** (`aria-pressed`): solid division colour with `--on-div` text at 700.
- Chips are grouped by division under a legend with the division's square swatch.

### Navigation
- **Event tabs:** Big Shoulders 700 uppercase in muted ink over a 2 px Quiet Rule sideline. Hover lifts to body ink; the current tab is heading ink with a 4 px paint over-paint on the sideline. Tabs live in the URL.
- **Day strip:** dates in muted small type with a 2 px transparent underline; the chosen day is heading ink with a 2 px paint underline. "Tonight" sits above today's date in paint-coloured Big Shoulders as part of the date label.

### Inputs / Fields
- **Score input** (event owners only): 3.75rem wide, 2.75rem tall, 1 px muted outline, 2px corners, floor fill, right-aligned Big Shoulders 700 numerals.
- **Invalid:** outline switches to body ink and dashed, so the error does not rely on colour.
- **Focus:** the shared focus outline (3 px solid paint, 3 px offset).

### Drawn court (signature)
The court panel: stencil court name on the left, status words on the right ("On court, started 7:00 pm" with a paint dot, or the next start time), then an SVG court with Floor Tint surface, paint lines and division-tinted keys. Team names sit near the top of each half, big score numerals between the key and the half-court line, and the spectator's team is underlined in 3 px paint. The centre circle carries a paint dot while on court, and the start time while the court waits. Below the baseline, stations list Final (or Awaiting score), Up next or Then as term and game rows on 1 px rules.

### Day grid cell
An outlined game on the time grid: floor fill, 2px corners, division swatch and label, then two team rows with Big Shoulders numerals. Up next is dashed Faded Paint; on court is solid paint over Paint Band with an "On court" tag in solid paint; final and awaiting score are 1 px Quiet Rule, and final adds a 2.25rem, 4 px paint tick at the bottom left. With a team filter, matching cells take 3 px paint in their own pattern and the rest fall back to Quiet Rule and muted ink.

### Now line
The one moving mark: a 2 px paint line across the day grid at the current time, running under the cells, with a solid paint tag in the hour gutter showing "Now" and the time. It eases to its new position over 900ms. The hour in progress is banded in Paint Band.

### Motion
One easing, `cubic-bezier(0.16, 1, 0.3, 1)`. Colour transitions 160ms, chevron 200ms, score paint-in 520ms (clips up from the floor), now line 900ms. All of it is off under `prefers-reduced-motion`.

## Do's and Don'ts

### Do:
- **Do** read every colour on an event page from `--ev-*`, `--div` or `--on-div`, deriving tints with `color-mix(in srgb, ... , var(--ev-bg))`.
- **Do** draw structure with 2 px paint lines and separate sections with space.
- **Do** pair every state with words and a stroke pattern: solid on court, dashed up next, baseline tick for final.
- **Do** use Big Shoulders for numerals and headings, the stencil cut for court numbers only, Archivo for names and body, all with tabular numerals for scores and times.
- **Do** put lettering that crosses court lines on a Floor Tint patch.
- **Do** keep touch targets at least 2.75rem, make wide grids scroll inside themselves, and check the layout at 360 px.
- **Do** check a new surface against a second organiser palette, including a light floor, before calling it done.
- **Do** write dates as DD/MM/YYYY and times as "7:00 pm", in NZ English, with "-" as the only dash.

### Don't:
- **Don't** use `--brand-*` tokens, iTala logo colours or hard-coded hex values inside `/events/[eventId]`; the only iTala element is the "Powered by iTala Connect" footer.
- **Don't** add shadows, glows, gradients, wood grain or other textures.
- **Don't** put games or sections in filled cards or panels; a game is an outline on the floor.
- **Don't** add another moving mark beyond the now line and the score paint-in.
- **Don't** show a game clock, period or quarter; the mobile app owns those.
- **Don't** round corners beyond 2px, except the circles a court actually has.
- **Don't** treat this document as the platform screen system; that palette and type are not yet decided.
