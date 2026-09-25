# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Spectators, players and families** (primary audience of the public event page). On a phone at the venue or at home, no login. Job: find their next game time and court, follow live scores, check standings, rosters and rules.
- **Event organisers (admins).** A few known organisers plus a handful of community organisers, running a few events per season, mostly in British Columbia, Canada. On a laptop before the event to build it; on a phone or tablet courtside on game day to fix the schedule and enter or approve scores.
- **Platform owner (superadmin).** Occasional use: manages every event, admin accounts and platform-wide sponsors and the default rules template.

## Product Purpose

iTala Connect is the basketball tournament and league scheduler for community events, and the rewrite of the iTala Platform scheduler live at connect.itala.fyi. Organisers create an event, define divisions and teams, generate a round-robin schedule and seeded knockout brackets, then publish one public page where scores, standings, rosters and rules update live on every device. Results can be pulled from the iTala mobile scorekeeper app and approved by an admin.

Success for the rewrite: full feature parity with the old app (docs/PRD.md), then real security, then accessibility and UI quality, then new features. Success on game day: nobody at the venue has to ask an organiser when or where a game is, or what the score was.

## Positioning

What a spreadsheet, TeamSnap or SportsEngine cannot truthfully claim together:

- **Free and fast to set up.** A full tournament with automatic round robin and seeded brackets in minutes, at no cost to organisers or spectators.
- **Tied to iTala mobile stats.** Connect owns fixtures; the iTala scorekeeper app owns stats and final scores. One link per league (mobile league = Connect division, one-to-one team map) joins them, and a mobile league can be imported straight into a draft event.
- **Live, no-login public page.** One shareable link per event with live scores and standings. No app to install, no account.
- **Organiser-branded pages.** Each public event page wears the organiser's own five colours, logo and sponsors, not iTala's.

## Operating Context

- Game day is the defining scene: a busy gym, phones in hand, games running on several courts at once, scores changing every few minutes. The public page Schedule tab on a game day (the "Today" screen) is the most important surface.
- Organiser prep happens at a desk: dates on a calendar, courts and hours, divisions, teams and player rosters, then Publish. After publishing, organisers drag games around the grid and add round robins or playoffs.
- Courtside admin work happens standing up on a phone or tablet: score entry on the public page, approving mobile results in the results inbox.
- Sponsors matter to organisers: platform primary and secondary sponsors appear on every event; each event has its own major and minor sponsors.
- Old shared links (`connect.itala.fyi/#/event/{id}`) must keep working after cutover.

## Capabilities and Constraints

- Feature spec: docs/PRD.md (every row coded Keep, Fix, Improve, Retire or New). Architecture and phases: docs/MIGRATION_PLAN.md. Mobile roadmap: docs/MOBILE_INTEGRATION.md.
- Roles: public (no login), admin (own events only), superadmin (everything). Individual accounts, no public sign-up.
- Terminology: event, division, bracket (group), team, player, game, court, day, round robin, playoff (semi, final), unscheduled, draft, published, results inbox, link (mobile league to division).
- Scheduling, standings, playoff resolution and mobile matching must behave identically to the old app (golden parity tests).
- The iTala mobile project is read only from Connect. No offline score entry and no push notifications in scope. Installable PWA manifest only.
- Free tiers only (Netlify, Supabase). Stack: Next.js App Router, React, TypeScript strict, Tailwind CSS, Supabase.
- Must work from 360 px wide, touch targets at least 44 px, tables scroll inside their card, never the page.
- Per-event time zone setting exists (default currently `Pacific/Auckland`); most events are in BC, so `America/Vancouver` will be common.
- **Open decision: copy locale and defaults.** The user asked for courtside-practical Canadian English, which conflicts with the organisation standard and CLAUDE.md (NZ English, DD/MM/YYYY, Pacific/Auckland default). Until that is resolved by whoever owns the organisation rule, UI copy follows NZ English and DD/MM/YYYY. The default event time zone for new events is also undecided given the BC user base.

## Brand Commitments

- Name: **iTala Connect**, part of the iTala family alongside the iTala mobile scorekeeper app.
- Logo: iTala mark (lime ball and speed lines, teal player-and-bars figure over a basketball) with the navy "iTala" wordmark. Source: `..\iTala-platform\src\itala-logo.png` and `itala-logo-sm.png`. The platform screens use the logo palette (navy, teal, lime); the old black-and-yellow shell is retired for platform screens.
- Tagline: **"Record. Track. Elevate."** is used across the platform.
- Voice: sporty and friendly. Clear and warm with hype personality, but always courtside-practical: the answer (time, court, score) comes first, the energy second. No long dashes in copy.
- Event pages belong to the organiser: inside `/events/[eventId]` only the organiser's `--ev-*` colours apply, and a small "Powered by iTala Connect" footer is the only iTala brand element.

## Evidence on Hand

- Real product: the live old app at connect.itala.fyi and its code in `..\iTala-platform`; existing Firebase event data to be migrated (production, read only).
- Logo files as above. Old defaults: event theme `#FFCC00 / #0D0D0D / #E0E0E0 / #888888 / #FFFFFF`, division colour cycle `#6C63FF, #2BBF8A, #E06040, #D4A017, #E06098, #3BACDF`.
- No testimonials, usage numbers, organiser names, league names or sponsor agreements are on hand. Do not invent them.

## Product Principles

1. **Parity before polish.** Nothing the old app does is lost unless the PRD retires it; improvements never remove a capability.
2. **Answer first on game day.** Time, court, teams and score must be readable at a glance on a phone in a noisy gym, before anything decorative.
3. **The event page is the organiser's.** Their colours, logo and sponsors lead; iTala Connect stays in the background there.
4. **Fixtures here, stats there.** Connect owns the schedule; the mobile app owns stats and finals. Never blur that line or write to the mobile app.
5. **Fast and free for community sport.** Setting up an event should take minutes, cost nothing, and need no training.

## Accessibility & Inclusion

- WCAG 2.2 AA for all iTala Connect screens; axe-core checks in E2E with no serious or critical violations.
- Event pages meet AA with default event colours; organiser colour choices below AA get a warning in the editor, not a block.
- Every interaction works with mouse, touch and keyboard, including schedule drag and drop, the calendar picker and collapsible sections.
- Readable in bright gyms and outdoor courts on mid-range phones over 4G (public page LCP under 2.5 s for a 100-game event).
