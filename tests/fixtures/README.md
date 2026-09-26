# Mobile import fixtures

`mobile.json` is synthetic test data shaped from the mobile fields documented in
`docs/MOBILE_INTEGRATION.md`. It is not a production export. It covers normal,
closed, archived, recreational/shared, team-only and fewer-than-two-team leagues.
Roster IDs intentionally differ from player table order. The team-only row lists
an ID to prove the importer still creates no players for that side.

The loopback-only HTTP server is launched by Playwright. It accepts only the
anonymous Auth signup/refresh operations and GETs of leagues, teams and players.
Tests inspect its request log to assert zero mobile database mutations.

`final_game_scores` rows cover the results inbox states: a result ready to approve, a 0-0 with no stats (needs a look), one still settling and one against a team that is not linked. Their times are placeholders the server fills in relative to now: `NOW-2H` and `NOW-2M` for when the game finished (epoch ms, as the view stores it), `NOW-1M` for the last stat (an ISO time), so the settling window and the event day behave the same on every run.
