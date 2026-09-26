import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync(new URL('../fixtures/mobile.json', import.meta.url), 'utf8'));
let mode = 'normal';
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
  if (req.method !== 'GET' || !['leagues', 'teams', 'players'].includes(table))
    return send(405, { message: 'Mobile writes are forbidden' });
  let rows = mode === 'empty' ? [] : fixture[table];
  const league = url.searchParams.get('league_id')?.replace(/^eq\./, '');
  if (league) rows = rows.filter((r) => r.league_id === league);
  rows = [...rows].sort((a, b) => a.id.localeCompare(b.id));
  const offset = Number(url.searchParams.get('offset') ?? 0);
  const limit = Number(url.searchParams.get('limit') ?? 500);
  return send(200, rows.slice(offset, offset + limit));
});
server.listen(3211, '127.0.0.1');
