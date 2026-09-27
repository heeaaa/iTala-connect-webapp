import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Compare rosters (PRD M-11): the loader, with a fake database and a fake
 * mobile reader. Connect is read through the session client; the mobile app
 * only through the reader's preview (GET only). Nothing is written.
 */

const fake = vi.hoisted(() => ({ event: null as unknown, preview: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: fake.event }) }) }) }),
  }),
}));
vi.mock('@/server/mobile/reader', () => ({ mobileReader: () => ({ preview: fake.preview }) }));
import { loadRosterComparison } from '@/server/mobile/rosters';

const E = 'e1';
const D = 'd1';
const team = (id: string, name: string, sort_order: number, players: { number: string; name: string }[]) => ({
  id,
  name,
  sort_order,
  created_at: '',
  players,
});
const event = (link: unknown) => ({
  id: E,
  name: 'League Night',
  divisions: [
    {
      id: D,
      name: 'Open',
      teams: [
        team('t-owls', 'Night Owls', 1, [{ number: '99', name: 'Unlisted' }]),
        team('t-hawks', 'Harbour Hawks', 0, [
          { number: '7', name: 'Bea' },
          { number: '04', name: 'Ari' },
        ]),
        team('t-kea', 'Kea', 2, []),
      ],
      division_mobile_links: link,
    },
  ],
});
const link = {
  league_id: 'league-open',
  league_name: 'Harbour League',
  season: '2026',
  division_mobile_team_links: [
    { team_id: 't-hawks', mobile_team_id: 'team-hawks' },
    { team_id: 't-owls', mobile_team_id: 'team-owls' },
  ],
};
const mobileTeams = [
  {
    id: 'team-hawks',
    name: 'Harbour Hawks BC',
    team_only: false,
    players: [
      { id: 'p1', number: '7', name: 'bea' },
      { id: 'p2', number: '04', name: 'Ari' },
    ],
  },
  { id: 'team-owls', name: 'Night Owls', team_only: true, players: [] },
  { id: 'team-extra', name: 'Southern Stars', team_only: false, players: [] },
];

beforeEach(() => {
  vi.clearAllMocks();
  fake.event = event(link);
  fake.preview.mockResolvedValue({ league: { id: 'league-open' }, teams: mobileTeams });
});

describe('loading the roster comparison', () => {
  it('pairs each team with its mobile team, sorts both lists, and notes same or different', async () => {
    const c = await loadRosterComparison(E, D);
    expect(fake.preview).toHaveBeenCalledWith('league-open');
    expect(c).toMatchObject({
      state: 'ready',
      event: { id: E, name: 'League Night' },
      division: { id: D, name: 'Open' },
      league: { name: 'Harbour League', season: '2026' },
      unpairedMobile: ['Southern Stars'],
    });
    if (c?.state !== 'ready') throw new Error('not ready');
    expect(c.teams.map((t) => [t.name, t.mobile?.name ?? null, t.same, t.note])).toEqual([
      ['Harbour Hawks', 'Harbour Hawks BC', true, 'Same in both (2 players)'],
      ['Night Owls', 'Night Owls', false, 'The lists differ (1 in iTala Connect, 0 in the mobile app)'],
      ['Kea', null, null, null],
    ]);
    expect(c.teams[0]!.connect).toEqual([
      { number: '04', name: 'Ari' },
      { number: '7', name: 'Bea' },
    ]);
    expect(c.teams[0]!.mobileRoster).toEqual([
      { number: '04', name: 'Ari' },
      { number: '7', name: 'bea' },
    ]);
    expect(c.teams[1]!.mobile).toEqual({ id: 'team-owls', name: 'Night Owls', teamOnly: true });
    expect(c.teams[2]).toMatchObject({ connect: [], mobileRoster: null });
  });

  it('says when the division is not linked, without asking the mobile app', async () => {
    fake.event = event(null);
    expect(await loadRosterComparison(E, D)).toMatchObject({ state: 'not_linked', division: { name: 'Open' } });
    expect(fake.preview).not.toHaveBeenCalled();
  });

  it('tells a league that is gone apart from a mobile app that does not answer', async () => {
    fake.preview.mockRejectedValueOnce(new Error('Mobile league no longer exists'));
    expect(await loadRosterComparison(E, D)).toMatchObject({
      state: 'league_gone',
      league: { name: 'Harbour League' },
    });
    fake.preview.mockRejectedValueOnce(new Error('Mobile data unavailable'));
    expect(await loadRosterComparison(E, D)).toMatchObject({ state: 'unreachable' });
  });

  it('finds nothing for a division of another event or an event it cannot see', async () => {
    expect(await loadRosterComparison(E, 'other')).toBeNull();
    fake.event = null;
    expect(await loadRosterComparison(E, D)).toBeNull();
  });
});
