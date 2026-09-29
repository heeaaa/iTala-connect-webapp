import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Inbox, InboxGame, InboxItem } from '@/server/mobile/results';
import type { InboxFinal } from '@/lib/mobile-results';

const fake = vi.hoisted(() => ({
  authorize: vi.fn(),
  canEdit: vi.fn(),
  revalidate: vi.fn(),
  load: vi.fn(),
  rpc: vi.fn(),
  configured: true,
}));
vi.mock('next/cache', () => ({ revalidatePath: fake.revalidate }));
vi.mock('@/server/auth', () => ({ authorizeAdmin: fake.authorize, canEditEvent: fake.canEdit }));
vi.mock('@/server/mobile/reader', () => ({
  get mobileConfigured() {
    return fake.configured;
  },
}));
vi.mock('@/server/mobile/results', () => ({ loadInbox: fake.load }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc: fake.rpc }) }));
import { approveResult, keepPublishedScore } from '@/server/actions/mobile-results';

const EVENT = '00000000-0000-4000-8000-000000000001';
const G1 = '00000000-0000-4000-8000-0000000000a1';
const G2 = '00000000-0000-4000-8000-0000000000a2';
const G9 = '00000000-0000-4000-8000-0000000000a9';
const CHANGED = 'This result has changed in the mobile app or on the schedule. Refresh and check it again.';
const game = (id: string, o: Partial<InboxGame> = {}): InboxGame => ({
  id,
  day: '2026-09-27',
  time: '19:00',
  court: 1,
  divisionId: 'd1',
  groupId: null,
  // Listed Owls first: the score must follow the teams, not the position.
  team1Id: 't-owls',
  team2Id: 't-hawks',
  label: 'Open',
  type: 'group',
  score1: null,
  score2: null,
  ...o,
});
const final: InboxFinal = {
  game_id: 'fin-1',
  league_id: 'L1',
  league_name: 'Harbour League',
  home_team_id: 'm-hawks',
  home_name: 'Harbour Hawks',
  away_team_id: 'm-owls',
  away_name: 'Night Owls',
  home_pts: 58,
  away_pts: 51,
  event_count: 48,
  finished_at: Date.parse('2026-09-27T07:05:00Z'),
  last_event_at: Date.parse('2026-09-27T07:05:00Z'),
};
const item = (state: InboxItem['result']['state'], o: Partial<InboxItem['result']> = {}): InboxItem => ({
  divisionId: 'd1',
  final,
  published: null,
  result: {
    final,
    homeTeamId: 't-hawks',
    awayTeamId: 't-owls',
    candidates: [],
    pick: null,
    existing: null,
    reason: null,
    state,
    ...o,
  },
});
const inbox = (items: InboxItem[], o: Partial<Inbox> = {}): Inbox => ({
  event: { id: EVENT, name: 'Night', timezone: 'Pacific/Auckland', courtNames: [] },
  divisions: [],
  teamNames: {},
  games: [game(G1), game(G2, { day: '2026-09-28' }), game(G9, { divisionId: 'd2' })],
  scored: [],
  items,
  notice: null,
  errors: [],
  ...o,
});
const approve = (gameId: string, mode: 'approve' | 'reapprove' | 'attach') =>
  approveResult({ eventId: EVENT, mobileGameId: 'fin-1', gameId, mode });

beforeEach(() => {
  vi.clearAllMocks();
  fake.configured = true;
  fake.authorize.mockResolvedValue({ ok: true, data: { id: 'u' } });
  fake.canEdit.mockResolvedValue(true);
  fake.rpc.mockResolvedValue({ data: null, error: null });
});

describe('approveResult (M-06)', () => {
  it('approves the proposed fixture with the score on each team’s side and the version approved now', async () => {
    fake.load.mockResolvedValue(inbox([item('proposed', { pick: { gameId: G1, game: game(G1), sameDay: true } })]));
    expect(await approve(G1, 'approve')).toEqual({ ok: true, data: { gameId: G1 } });
    expect(fake.rpc).toHaveBeenCalledWith('approve_mobile_result', {
      p_game_id: G1,
      // Hawks (home, 58) are the fixture's team 2.
      p_s1: 51,
      p_s2: 58,
      p_source: {
        mobile_game_id: 'fin-1',
        league_id: 'L1',
        home_team_id: 'm-hawks',
        away_team_id: 'm-owls',
        home_pts: 58,
        away_pts: 51,
        event_count: 48,
        last_event_at: '2026-09-27T07:05:00.000Z',
        finished_at: '2026-09-27T07:05:00.000Z',
        method: 'mobile',
      },
    });
    expect(fake.revalidate).toHaveBeenCalledWith(`/admin/events/${EVENT}/results`);
    expect(fake.revalidate).toHaveBeenCalledWith(`/events/${EVENT}`);
  });

  it('refuses a fixture the result no longer points at, reading the inbox again rather than trusting the page', async () => {
    fake.load.mockResolvedValue(inbox([item('proposed', { pick: { gameId: G1, game: game(G1), sameDay: true } })]));
    expect(await approve(G2, 'approve')).toEqual({ ok: false, error: CHANGED });
    expect(await approve(G1, 'reapprove')).toEqual({ ok: false, error: CHANGED });
    fake.load.mockResolvedValue(inbox([]));
    expect(await approve(G1, 'approve')).toEqual({ ok: false, error: CHANGED });
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it('re-approves only the fixture approved before', async () => {
    fake.load.mockResolvedValue(
      inbox([item('drifted', { existing: { gameId: G1, source: {} as never } })], { scored: [G1] }),
    );
    expect((await approve(G2, 'reapprove')).ok).toBe(false);
    expect((await approve(G1, 'reapprove')).ok).toBe(true);
    expect(fake.rpc).toHaveBeenCalledTimes(1);
  });

  it('attaches only to an unscored fixture in the same division, and never a result that needs a look', async () => {
    fake.load.mockResolvedValue(inbox([item('unmatched')], { scored: [G2] }));
    expect(await approve(G2, 'attach')).toEqual({ ok: false, error: CHANGED });
    expect(await approve(G9, 'attach')).toEqual({ ok: false, error: CHANGED });
    expect((await approve(G1, 'attach')).ok).toBe(true);
    expect(fake.rpc.mock.lastCall![1].p_source.method).toBe('attach');
    for (const state of ['review', 'settling', 'unlinked', 'approved', 'drifted'] as const) {
      fake.load.mockResolvedValue(inbox([item(state)]));
      expect(await approve(G1, 'attach')).toEqual({ ok: false, error: CHANGED });
    }
    expect(fake.rpc).toHaveBeenCalledTimes(1);
  });

  it('never offers generic attachment for a scheduled claim, even if browser state is forged', async () => {
    const claimed = { ...final, game_id: `cg_${G1}` };
    fake.load.mockResolvedValue(inbox([{ ...item('unmatched'), final: claimed }]));
    expect(await approveResult({ eventId: EVENT, mobileGameId: claimed.game_id, gameId: G2, mode: 'attach' })).toEqual({
      ok: false,
      error: CHANGED,
    });
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it('needs both teams linked, and a fixture with those two teams', async () => {
    fake.load.mockResolvedValue(inbox([item('ambiguous', { awayTeamId: null })]));
    expect(await approve(G1, 'attach')).toEqual({
      ok: false,
      error: 'Link both teams for this division before approving this result.',
    });
    fake.load.mockResolvedValue(
      inbox([item('ambiguous')], { games: [game(G1, { team1Id: 't-kea', team2Id: 't-hawks' })] }),
    );
    expect(await approve(G1, 'attach')).toEqual({ ok: false, error: "This result's teams do not match that fixture." });
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it('checks sign-in, the integration, ownership and what the page could not read', async () => {
    fake.authorize.mockResolvedValueOnce({ ok: false, error: 'Please sign in again.' });
    expect(await approve(G1, 'approve')).toEqual({ ok: false, error: 'Please sign in again.' });
    fake.configured = false;
    expect(await approve(G1, 'approve')).toEqual({ ok: false, error: 'The mobile app integration is not configured.' });
    fake.configured = true;
    fake.canEdit.mockResolvedValueOnce(false);
    expect(await approve(G1, 'approve')).toEqual({ ok: false, error: 'You can only edit your own events.' });
    fake.load.mockResolvedValue(inbox([], { notice: 'Could not read this event’s existing scores.' }));
    expect(await approve(G1, 'approve')).toEqual({ ok: false, error: 'Could not read this event’s existing scores.' });
    fake.load.mockResolvedValue(null);
    expect(await approve(G1, 'approve')).toEqual({ ok: false, error: CHANGED });
    expect(await approveResult({ eventId: 'nope', mobileGameId: 'fin-1', gameId: G1, mode: 'approve' })).toEqual({
      ok: false,
      error: CHANGED,
    });
    expect(fake.load).toHaveBeenCalledTimes(2);
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it('reports a score the database would not save', async () => {
    fake.load.mockResolvedValue(inbox([item('proposed', { pick: { gameId: G1, game: game(G1), sameDay: true } })]));
    fake.rpc.mockResolvedValueOnce({ data: null, error: { code: '42501' } });
    expect(await approve(G1, 'approve')).toEqual({
      ok: false,
      error: 'Could not save the score. Refresh and try again.',
    });
    expect(fake.revalidate).not.toHaveBeenCalled();
  });
});

describe('keepPublishedScore (M-06)', () => {
  it('records the mobile app’s version now against the fixture approved before', async () => {
    fake.load.mockResolvedValue(inbox([item('drifted', { existing: { gameId: G1, source: {} as never } })]));
    expect(await keepPublishedScore({ eventId: EVENT, mobileGameId: 'fin-1' })).toEqual({ ok: true, data: undefined });
    expect(fake.rpc).toHaveBeenCalledWith('dismiss_mobile_result', {
      p_game_id: G1,
      p_source: expect.objectContaining({ mobile_game_id: 'fin-1', home_pts: 58, away_pts: 51, event_count: 48 }),
    });
  });

  it('refuses a result that has not changed, and reports a failed save', async () => {
    fake.load.mockResolvedValue(inbox([item('approved', { existing: { gameId: G1, source: {} as never } })]));
    expect(await keepPublishedScore({ eventId: EVENT, mobileGameId: 'fin-1' })).toEqual({ ok: false, error: CHANGED });
    fake.load.mockResolvedValue(inbox([item('drifted', { existing: { gameId: G1, source: {} as never } })]));
    fake.rpc.mockResolvedValueOnce({ data: null, error: { code: '42501' } });
    expect(await keepPublishedScore({ eventId: EVENT, mobileGameId: 'fin-1' })).toEqual({
      ok: false,
      error: 'Could not save. Refresh and try again.',
    });
    expect(await keepPublishedScore({ eventId: 'x', mobileGameId: '' })).toEqual({ ok: false, error: CHANGED });
  });
});
