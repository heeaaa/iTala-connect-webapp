/** Server job transport. No user session, mobile database key, or browser imports. */
type Config = { connectUrl?: string; connectKey?: string; mobileUrl?: string; secret?: string };
type Snapshot = { leagueId: string; revision: number; checkedAt: number; events: unknown[] };
export async function syncMobileLinks(config: Config, request: typeof fetch = fetch) {
  const { connectUrl, connectKey, mobileUrl, secret } = config;
  if (!connectUrl || !connectKey || !mobileUrl || !secret || secret.length < 32)
    return { configured: false, delivered: 0, failed: 0 };
  async function rpc(name: string, body: unknown) {
    const response = await request(`${connectUrl!.replace(/\/$/, '')}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: connectKey!, authorization: `Bearer ${connectKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(6000),
      redirect: 'error',
    });
    if (!response.ok) throw new Error('Connect link queue request failed.');
    return response.status === 204 ? null : response.json();
  }
  const snapshots: unknown = await rpc('pending_mobile_link_snapshots', { p_limit: 10 });
  if (!Array.isArray(snapshots) || snapshots.length > 10) throw new Error('Invalid link queue response.');
  const results = await Promise.all(
    snapshots.map(async (snapshot: Snapshot) => {
      try {
        if (
          typeof snapshot?.leagueId !== 'string' ||
          !Number.isSafeInteger(snapshot.revision) ||
          snapshot.revision < 1 ||
          !Number.isSafeInteger(snapshot.checkedAt) ||
          !Array.isArray(snapshot.events)
        )
          throw new Error('Invalid link snapshot.');
        const response = await request(`${mobileUrl.replace(/\/$/, '')}/functions/v1/connect-link-state`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-connect-link-secret': secret },
          body: JSON.stringify(snapshot),
          signal: AbortSignal.timeout(6000),
          redirect: 'error',
        });
        if (!response.ok) return false;
        // A concurrent change has a newer revision and remains queued after this acknowledgement.
        await rpc('ack_mobile_link_snapshot', { p_league_id: snapshot.leagueId, p_revision: snapshot.revision });
        return true;
      } catch {
        return false;
      } // Durable database rows remain pending for the next scheduled run.
    }),
  );
  return { configured: true, delivered: results.filter(Boolean).length, failed: results.filter((v) => !v).length };
}
