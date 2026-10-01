import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  calls: [] as string[],
  eventGames: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from(table: string) {
      fake.calls.push(`from:${table}`);
      const rows =
        table === 'events'
          ? [
              {
                id: 'e',
                name: 'League night',
                status: 'published',
                owner_id: 'owner',
                timezone: 'Pacific/Auckland',
                divisions: [
                  {
                    id: 'd',
                    name: 'Senior',
                    teams: [
                      { id: 'a', name: 'Aces' },
                      { id: 'b', name: 'Blues' },
                    ],
                  },
                ],
                games: fake.eventGames,
              },
            ]
          : table === 'game_scores'
            ? [{ game_id: 'g', s1: 4, s2: 2 }]
            : table === 'score_sources'
              ? [{ game_id: 'g', mobile_game_id: 'mobile-g' }]
              : [];
      const query = {
        select(selection: string) {
          fake.calls.push(`select:${table}:${selection}`);
          return query;
        },
        order(column: string) {
          fake.calls.push(`order:${table}:${column}`);
          return query;
        },
        eq(column: string, value: string) {
          fake.calls.push(`eq:${table}:${column}:${value}`);
          return query;
        },
        in(column: string, values: string[]) {
          fake.calls.push(`in:${table}:${column}:${values.join(',')}`);
          return query;
        },
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        then(resolve: (result: { data: typeof rows; error: null }) => unknown) {
          return Promise.resolve(resolve({ data: rows, error: null }));
        },
      };
      return query;
    },
  }),
}));

const { listReportEvents, loadConnectReportSource } = await import('@/features/reports/connect-source');

beforeEach(() => {
  fake.calls.length = 0;
  fake.eventGames = [
    {
      id: 'g',
      division_id: 'd',
      day: '2026-10-02',
      start_time: '10:00:00',
      type: 'group',
      is_playoff: false,
      team1_id: 'a',
      team2_id: 'b',
    },
  ];
});

describe('Connect report source', () => {
  it('lists only manageable events for ordinary admins and maps Connect scores without mobile writes', async () => {
    const events = await listReportEvents({ id: 'owner', role: 'admin' } as Parameters<typeof listReportEvents>[0]);
    expect(events).toHaveLength(1);
    expect(fake.calls).toContain('eq:events:owner_id:owner');
    const source = await loadConnectReportSource('e', '2026-10-02T00:00:00.000Z');
    expect(source.games[0]).toMatchObject({
      id: 'g',
      date: '2026-10-02',
      homeScore: 4,
      awayScore: 2,
      mobileGameId: 'mobile-g',
      mobileFinal: false,
      mobileEvents: [],
    });
    expect(fake.calls).toContain('in:score_sources:game_id:g');
    expect(fake.calls.every((call) => !/insert|update|delete|upsert|signup|refresh/.test(call))).toBe(true);
  });

  it('does not query score provenance with an empty ID list', async () => {
    fake.eventGames = [];
    const source = await loadConnectReportSource('e');
    expect(source.games).toEqual([]);
    expect(fake.calls.some((call) => call.startsWith('from:score_sources'))).toBe(false);
  });

  it('bounds provenance reads for events with more than 100 games', async () => {
    fake.eventGames = Array.from({ length: 101 }, (_, index) => ({
      ...fake.eventGames[0],
      id: `game-${index}`,
    }));
    const source = await loadConnectReportSource('e');
    expect(source.games).toHaveLength(101);
    const reads = fake.calls.filter((call) => call.startsWith('in:score_sources:game_id:'));
    expect(reads).toHaveLength(2);
    expect(reads[0]!.split(',')).toHaveLength(100);
    expect(reads[1]).toBe('in:score_sources:game_id:game-100');
  });
});
