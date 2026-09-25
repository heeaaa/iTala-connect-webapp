# Work status

Last updated: 25/09/2026

## Objective

Rebuild the iTala Platform scheduler as iTala Connect (Next.js + Supabase) with full feature parity, real security, tests and a rebranded UI, then migrate existing Firebase data and switch connect.itala.fyi over.

## Decisions

- Next.js App Router replaces Vite; TypeScript strict; Tailwind; shadcn/ui where useful.
- New dedicated Supabase project; individual admin accounts with superadmin and admin roles.
- Platform UI uses the iTala logo palette; organiser-chosen event colours stay in full control of public event pages.
- Migrate existing Firebase data with a repeatable import, verify, then switch over.
- Repository https://github.com/heeaaa/iTala-connect-webapp and Supabase project https://ephhjzrkbjrhcjrwtknn.supabase.co are created (25/09/2026). Nothing pushed or applied to either yet.
- Mobile integration starts with a simple league import (docs/MOBILE_INTEGRATION.md stage 1), built as the first feature slice (phase 3b). Mobile reader uses a server-side cached anonymous session (O-3 decided).
- docs/SCHEDULER_INTEGRATION_PLAN.md copied verbatim from `iTala/docs` as the parked long-term plan.
- Open decisions O-1 to O-7: docs/MIGRATION_PLAN.md section 15.

## Changed areas

- `CLAUDE.md`: appended "iTala Connect project specifics"; original content unchanged.
- `docs/PRD.md`: feature parity spec.
- `docs/MIGRATION_PLAN.md`: architecture, schema, RLS, testing, CI, migration, phases.
- `docs/MOBILE_INTEGRATION.md`: new staged integration roadmap and stage 1 spec; PRD rows D-05 and MI-01 to MI-09; MIGRATION_PLAN phase 3b, schema `players.mobile_player_id`, E2E journey 9, section 16.
- Both docs revised after an independent review against the old code (odd-team round counts, delete-game score, seed gate, import edge cases, audit log, disabled admins, storage limits, backups, freeze via Firebase rules).

## Commands and results

- No application code exists yet, so no build, lint or test commands have been run. All test gates are NOT RUN.
- Impeccable launcher: NOT RUN (it needs a shell on the computer that holds the skill scripts; this planning session had none). Run `impeccable context` at the start of the design phase.

## Blockers

- None for phase 0 and 1. Phase 3 (design) needs your choice between two directions. Phase 6 needs access details for the mobile Supabase project. Phase 7 needs a Firebase service account or JSON export.

## Next action

1. Phase 0: rotate the two old admin passwords and check the live Firebase rules.
2. Review docs/PRD.md rows marked Fix and decide O-1 to O-7.
3. Phase 1: scaffold the project and CI, then phase 3 (design choice), then phase 3b (mobile league import) as the first feature slice.
4. Before building against the real mobile project: confirm anonymous sign-ins are enabled there.
