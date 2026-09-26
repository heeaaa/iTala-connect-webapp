import 'server-only';
import { z } from 'zod';
import { buildLeaguePreview, mobileLeagueSchema, mobilePlayerSchema, mobileTeamSchema } from '@/lib/mobile-import';

const sessionSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().positive(),
});
type Session = z.infer<typeof sessionSchema> & { expiresAt: number };
/** One least-privileged anonymous session per server process, never a user session.
 * Database transport exposes GET only; the two POSTs are Auth signup/refresh.
 */
export function createMobileReader(url: string, key: string, request: typeof fetch = fetch, now = Date.now) {
  let session: Session | undefined;
  let signingIn: Promise<Session> | undefined;
  async function token() {
    if (session && session.expiresAt > now() + 60_000) return session.access_token;
    signingIn ??= (async () => {
      const old = session;
      const response = await request(`${url}/auth/v1/${old ? 'token?grant_type=refresh_token' : 'signup'}`, {
        method: 'POST',
        headers: { apikey: key, 'Content-Type': 'application/json' },
        body: JSON.stringify(old ? { refresh_token: old.refresh_token } : {}),
        signal: AbortSignal.timeout(15_000),
        cache: 'no-store',
        redirect: 'error',
      });
      if (!response.ok) {
        session = undefined;
        throw new Error('Mobile authentication unavailable');
      }
      const data = sessionSchema.parse(await response.json());
      session = { ...data, expiresAt: now() + data.expires_in * 1000 };
      return session;
    })();
    try {
      return (await signingIn).access_token;
    } finally {
      signingIn = undefined;
    }
  }
  async function rows<T>(
    table: 'leagues' | 'teams' | 'players',
    schema: z.ZodType<T>,
    leagueId?: string,
  ): Promise<T[]> {
    const result: T[] = [];
    const accessToken = await token();
    for (let offset = 0; offset < 100_000; offset += 500) {
      const target = new URL(`${url}/rest/v1/${table}`);
      target.searchParams.set('select', '*');
      target.searchParams.set('order', 'id.asc');
      target.searchParams.set('limit', '500');
      target.searchParams.set('offset', String(offset));
      if (leagueId) target.searchParams.set('league_id', `eq.${leagueId}`);
      const response = await request(target, {
        method: 'GET',
        headers: { apikey: key, Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(15_000),
        cache: 'no-store',
        redirect: 'error',
      });
      if (!response.ok) {
        if (response.status === 401) session = undefined;
        throw new Error('Mobile data unavailable');
      }
      const page = z.array(schema).parse(await response.json());
      result.push(...page);
      if (page.length < 500) return result;
    }
    throw new Error('Mobile dataset is too large');
  }
  return {
    async listLeagues() {
      const [leagues, teams] = await Promise.all([
        rows('leagues', mobileLeagueSchema),
        rows('teams', mobileTeamSchema),
      ]);
      const counts = new Map<string, number>();
      for (const team of teams) counts.set(team.league_id, (counts.get(team.league_id) ?? 0) + 1);
      return leagues
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((league) => ({ ...league, teamCount: counts.get(league.id) ?? 0 }));
    },
    async preview(leagueId: string) {
      const [leagues, teams, players] = await Promise.all([
        rows('leagues', mobileLeagueSchema),
        rows('teams', mobileTeamSchema, leagueId),
        rows('players', mobilePlayerSchema, leagueId),
      ]);
      const league = leagues.find((l) => l.id === leagueId);
      if (!league) throw new Error('Mobile league no longer exists');
      return buildLeaguePreview(league, teams, players);
    },
  };
}
