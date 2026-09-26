# Mobile import fixtures

`mobile.json` is synthetic test data shaped from the mobile fields documented in
`docs/MOBILE_INTEGRATION.md`. It is not a production export. It covers normal,
closed, archived, recreational/shared, team-only and fewer-than-two-team leagues.
Roster IDs intentionally differ from player table order. The team-only row lists
an ID to prove the importer still creates no players for that side.

The loopback-only HTTP server is launched by Playwright. It accepts only the
anonymous Auth signup/refresh operations and GETs of leagues, teams and players.
Tests inspect its request log to assert zero mobile database mutations.
