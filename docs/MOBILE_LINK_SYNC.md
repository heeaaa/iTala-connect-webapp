# Durable mobile link status

Implemented on 1 October 2026 on `codex/synced-connect-links`, paired with mobile
`codex/schedule-iphone-fixes`. Hosted delivery is not deployed or verified.
This extends the earlier read-only mobile integration for published-link
metadata; existing league/result readers retain their previous behavior.

## Delivery

`20261001000100_mobile_link_sync.sql` creates a private transactional queue.
Triggers cover link insert/update/delete, publication and event metadata changes,
division rename/move, imports and cascading deletion. Existing links are
backfilled. Snapshots contain only published event references and linked division
names. Draft links produce an empty published-event list.

`netlify/functions/sync-mobile-links.mts` runs every five minutes and sends up
to ten league snapshots through `src/server/mobile/link-sync-worker.ts`.
Failures stay pending. Exact-revision acknowledgements cannot clear newer
changes. Mobile ignores stale revisions. Backlogs/outages increase delivery
delay; manual owner discovery in mobile Schedule/Settings provides recovery.

The worker uses Connect's server key and a dedicated shared secret, without a
mobile database service key or user credentials. Each request has a six-second
timeout; deliveries run concurrently. Logs contain configured/delivered/failed
counts without secrets or league payloads.

## Deployment order

1. Apply mobile `20261001000200_connect_link_state.sql` after its existing
   schedule/default-game migrations. Apply the Connect migration above after
   existing migrations. No database reset is needed.
2. Set a new random `CONNECT_LINK_SYNC_SECRET` of at least 32 characters in
   Netlify's environment and mobile Edge Function secrets. On plans that allow
   scope selection, select **Functions only**, excluding Builds and Runtime.
   Netlify Free uses all scopes; the build handles this without persisting the
   compiler cache or disabling secret scanning.
3. Deploy mobile `connect-link-state` with gateway JWT verification disabled
   only for that function; it checks `x-connect-link-secret`. Deploy
   `connect-schedule` with normal JWT verification enabled.
4. Publish Connect to Netlify. Functions needs `NEXT_PUBLIC_SUPABASE_URL`,
   `SUPABASE_SECRET_KEY`, `MOBILE_SUPABASE_URL` and `CONNECT_LINK_SYNC_SECRET`.
   Confirm `sync-mobile-links` is registered as scheduled.
5. Observe successful backfill delivery and normal mobile sync before releasing
   the paired mobile app. Follow mobile's `docs/CONNECT_LINK_SYNC.md` acceptance
   checks, including two-device publish/unpublish/unlink/delete.

See [Netlify scheduling](https://docs.netlify.com/build/functions/scheduled-functions/)
and [Supabase function configuration](https://supabase.com/docs/guides/functions/function-configuration).

### Netlify deployment stopped by a compiler-cache secret finding

Next 16.3 enables Turbopack's persistent production cache by default. Netlify
can restore that cache and its full secret scanner checks it after packaging.
A runtime secret in `.netlify/.next/cache/turbopack/*.sst` therefore stops the
deployment even when compilation and the browser-output scan passed.

Production builds now disable Turbopack disk caching. `npm run build` first
removes only `.next/cache/turbopack` and `.netlify/.next/cache/turbopack`, including
restored cache files. Image caches and other output are retained. `check:secrets`
also scans these compiler-cache locations; CI builds with a harmless test secret.
The scheduled worker still receives the actual secret through Netlify at runtime.

Deploy this fix, then use Netlify's **Clear cache and deploy site** for the first
retry. Keep `CONNECT_LINK_SYNC_SECRET` marked secret and retain Netlify scanning;
do not add omit-key/path exceptions. The pasted cache-only finding does not
establish that the secret reached a browser. Verify the hosted scan and worker
logs after the retry; a local build cannot prove the Netlify deployment passed.

References: [Next production compiler cache](https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopackFileSystemCache),
[Netlify environment scopes](https://docs.netlify.com/build/environment-variables/overview/#scopes).

## Verification limits

- The unit suite covers successful delivery, retries, partial failure, queue
  outage, exact acknowledgement, malformed jobs and empty queue.
- `supabase/tests/019_mobile_link_sync.sql` checks queue/RPC permissions in
  normal Docker/pgTAP CI. Not executed locally: Docker Desktop's engine pipe
  is unavailable on this Windows host.
- Mobile `tests/connectLinkSync.database.test.js` passed with PGlite 0.5.8,
  two isolated PostgreSQL databases, the shipped migrations, real worker and
  receiver. It covers backfill, draft/publish/unpublish, retry, multiple links,
  relink, rename, delete/unlink, stale delivery/ack, permissions, the game guard,
  existing games and receiver authentication. HTTP is adapted to the databases;
  hosted gateway/auth/realtime and separate concurrent connections are not simulated.
- Hosted Supabase, Netlify scheduling, browser E2E, local type regeneration
  and native iPhone/iPad verification remain **NOT RUN**. Added database types
  were maintained by hand; regenerate with `npm run db:types` once Docker is available.
