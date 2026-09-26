import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync(new URL('../fixtures/mobile.json', import.meta.url), 'utf8'));
let mode = 'normal';
const started = Date.now();
const requests = [];
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:3211');
  res.setHeader('Content-Type', 'application/json');
  const send = (status, body) => {
    res.writeHead(status);
    res.end(JSON.stringify(body));
  };
  if (url.pathname === '/health') return send(200, { ok: true });
  if (url.pathname === '/__control' && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    mode = JSON.parse(body).mode;
    return send(200, { ok: true });
  }
  if (url.pathname === '/__requests') return send(200, requests);
  requests.push({ method: req.method, path: url.pathname });
  if (mode === 'unreachable') return send(503, { message: 'Unavailable' });
  if ((url.pathname === '/auth/v1/signup' || url.pathname === '/auth/v1/token') && req.method === 'POST')
    return send(200, {
      access_token: 'fixture-access-token',
      refresh_token: 'fixture-refresh-token',
      expires_in: 3600,
    });
  const table = url.pathname.replace('/rest/v1/', '');
  if (req.method !== 'GET' || !['leagues', 'teams', 'players', 'final_game_scores'].includes(table))
    return send(405, { message: 'Mobile writes are forbidden' });
  // Finished-game times are relative, so settling and today behave the same on every run. Games that
  // finished hours ago are fixed at server start (an approved result must not drift between requests);
  // only the still-settling game follows each request, to stay inside the 5-minute window.
  const ago = { 'NOW-2H': [2 * 3600e3, started], 'NOW-1H': [3600e3, started], 'NOW-2M': [2 * 60e3], 'NOW-1M': [60e3] };
  const at = (v, iso) => {
    if (!(v in ago)) return v;
    const [back, from = Date.now()] = ago[v];
    return iso ? new Date(from - back).toISOString() : from - back;
  };
  // 'changed': the ready result gained points and stats after it was approved (the drift case, M-05).
  const changed = (r) =>
    mode === 'changed' && r.game_id === 'fin-result'
      ? { ...r, home_pts: 60, event_count: 50, last_event_at: 'NOW-1H' }
      : r;
  let rows = (mode === 'empty' ? [] : (fixture[table] ?? [])).map(changed).map((r) =>
    table === 'final_game_scores'
      ? {
          ...r,
          finished_at: at(r.finished_at, false),
          finished_at_ts: at(r.finished_at_ts, true),
          last_event_at: at(r.last_event_at, true),
        }
      : r,
  );
  const league = url.searchParams.get('league_id')?.replace(/^eq\./, '');
  if (league) rows = rows.filter((r) => r.league_id === league);
  rows = [...rows].sort((a, b) => (a.id ?? a.game_id).localeCompare(b.id ?? b.game_id));
  const offset = Number(url.searchParams.get('offset') ?? 0);
  const limit = Number(url.searchParams.get('limit') ?? 500);
  return send(200, rows.slice(offset, offset + limit));
});
server.listen(3211, '127.0.0.1');
