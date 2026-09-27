import { describe, it, expect, vi } from 'vitest';
import fixture from '../fixtures/mobile.json';
import {
  buildLeaguePreview,
  mobileLeagueSchema,
  mobileTeamSchema,
  mobilePlayerSchema,
  importChoiceSchema,
} from '@/lib/mobile-import';
import { createMobileReader } from '@/server/mobile/transport';

function transport() {
  const calls: { url: URL; init: RequestInit }[] = [];
  const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url, init: init ?? {} });
    if (url.pathname.startsWith('/auth/'))
      return Response.json({ access_token: 'access', refresh_token: 'refresh', expires_in: 3600 });
    const table = url.pathname.split('/').at(-1) as keyof typeof fixture;
    const league = url.searchParams.get('league_id')?.slice(3);
    return Response.json(fixture[table].filter((r) => !league || ('league_id' in r && r.league_id === league)));
  });
  return { request, calls };
}
describe('Mobile reads', () => {
  it('shares anonymous sign-in across concurrent reads, sorts leagues and only sends GET database calls', async () => {
    const { request, calls } = transport();
    const reader = createMobileReader('http://mobile.test', 'publishable', request);
    const [leagues, preview] = await Promise.all([reader.listLeagues(), reader.preview('league-open')]);
    expect(leagues.map((l) => l.name)).toEqual(['Autumn League', 'Friday Drop-in', 'Harbour League', 'New League']);
    expect(leagues.find((l) => l.id === 'league-open')?.teamCount).toBe(2);
    expect(preview.teams[0]?.players.map((p) => p.name)).toEqual(['Bea', 'Ari']);
    expect(preview.teams[0]?.players[1]?.number).toBe('04');
    expect(preview.teams[1]?.players).toEqual([]);
    expect(calls.filter((c) => c.url.pathname === '/auth/v1/signup')).toHaveLength(1);
    expect(calls.filter((c) => c.url.pathname.startsWith('/rest/')).every((c) => c.init.method === 'GET')).toBe(true);
    expect(JSON.stringify(preview)).not.toContain('is_shared');
  });
  it('refreshes the cached anonymous session instead of creating another account', async () => {
    const { request, calls } = transport();
    let time = 0;
    const reader = createMobileReader('http://mobile.test', 'publishable', request, () => time);
    await reader.listLeagues();
    time = 3_600_000;
    await reader.listLeagues();
    expect(calls.filter((c) => c.url.pathname === '/auth/v1/signup')).toHaveLength(1);
    expect(calls.find((c) => c.url.pathname === '/auth/v1/token')?.init.body).toBe(
      JSON.stringify({ refresh_token: 'refresh' }),
    );
  });
  it('fails closed on auth, database, missing league and malformed responses', async () => {
    const authFail = createMobileReader(
      'http://mobile.test',
      'key',
      vi.fn(async () => new Response('', { status: 503 })),
    );
    await expect(authFail.listLeagues()).rejects.toThrow('authentication');
    const { request } = transport();
    const reader = createMobileReader('http://mobile.test', 'key', request);
    await expect(reader.preview('missing')).rejects.toThrow('no longer exists');
    request.mockImplementation(async () => Response.json({ unexpected: true }));
    await expect(reader.listLeagues()).rejects.toThrow();
    request.mockImplementation(async () => new Response('', { status: 401 }));
    await expect(reader.listLeagues()).rejects.toThrow('unavailable');
  });
  it('paginates without losing teams after the first API page', async () => {
    const { request, calls } = transport();
    const original = request.getMockImplementation()!;
    request.mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/teams')) {
        calls.push({ url, init: init ?? {} });
        return Response.json(
          url.searchParams.get('offset') === '0'
            ? Array.from({ length: 500 }, (_, i) => ({ ...fixture.teams[0], id: `team-${i}` }))
            : [{ ...fixture.teams[0], id: 'team-last' }],
        );
      }
      return original(input, init);
    });
    expect(
      (await createMobileReader('http://mobile.test', 'key', request).listLeagues()).find((l) => l.id === 'league-open')
        ?.teamCount,
    ).toBe(501);
  });
});
describe('Import mapping', () => {
  const league = mobileLeagueSchema.parse(fixture.leagues[0]);
  const teams = fixture.teams.map((t) => mobileTeamSchema.parse(t));
  const players = fixture.players.map((p) => mobilePlayerSchema.parse(p));
  it('rejects missing roster references and repeated player/team identities', () => {
    expect(() => buildLeaguePreview(league, teams, [])).toThrow('incomplete');
    expect(() =>
      buildLeaguePreview(league, [{ ...teams[0]!, player_ids: ['player-ari', 'player-ari'] }], players),
    ).toThrow('duplicate');
    expect(() => buildLeaguePreview(league, [teams[0]!, teams[0]!], players)).toThrow('Duplicate');
  });
  it('accepts an empty league and strips unrelated input fields', () => {
    expect(buildLeaguePreview(league, [], []).teams).toEqual([]);
    const choice = importChoiceSchema.parse({
      leagueId: league.id,
      eventName: ' Event ',
      divisionName: ' Open ',
      allowDuplicate: false,
      ownerId: 'attacker',
    });
    expect(choice).toEqual({ leagueId: league.id, eventName: 'Event', divisionName: 'Open', allowDuplicate: false });
    expect(importChoiceSchema.safeParse({ ...choice, eventName: '  ' }).success).toBe(false);
  });
});
