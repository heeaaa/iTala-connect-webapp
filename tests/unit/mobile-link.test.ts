import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DUPLICATE,
  duplicateMobileTeams,
  leagueLabel,
  linkableLeagues,
  startingPairs,
  unpairedHint,
} from '@/lib/mobile-link';

const fake = vi.hoisted(() => ({
  authorize: vi.fn(),
  canEdit: vi.fn(),
  revalidate: vi.fn(),
  leagues: vi.fn(),
  teams: vi.fn(),
  rpc: vi.fn(),
  division: null as unknown,
  configured: true,
}));
vi.mock('next/cache', () => ({ revalidatePath: fake.revalidate }));
vi.mock('@/server/auth', () => ({ authorizeAdmin: fake.authorize, canEditEvent: fake.canEdit }));
vi.mock('@/server/mobile/reader', () => ({
  get mobileConfigured() {
    return fake.configured;
  },
  mobileReader: () => ({ listLeagues: fake.leagues, teams: fake.teams }),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: fake.division }) }) }) }),
    rpc: fake.rpc,
  }),
}));
import { saveMobileLink } from '@/server/actions/mobile-link';

const EVENT = '00000000-0000-4000-8000-000000000001';
const DIV = '00000000-0000-4000-8000-0000000000d1';
const HAWKS = '00000000-0000-4000-8000-0000000000a1';
const OWLS = '00000000-0000-4000-8000-0000000000a2';
const OTHER = '00000000-0000-4000-8000-0000000000a9';
const CHECK = 'Something on this page changed. Refresh and check the pairs again.';

describe('Link wizard rules (M-03)', () => {
  const teams = [
    { id: 'h', name: 'Harbour Hawks' },
    { id: 'o', name: 'Night Owls' },
    { id: 'k', name: 'Kea' },
  ];
  const mobile = [
    { id: 'm-h', name: 'harbour  hawks' },
    { id: 'm-o', name: 'Night Owls' },
    // 'Kea Club' would pair with 'Kea' (club is ignored); 'Kea Rangers' is a different name.
    { id: 'm-k', name: 'Kea Rangers' },
  ];

  it('fills gaps from names, but a pair a person chose wins, and a pair to a team no longer there is dropped', () => {
    expect(startingPairs(teams, mobile, {})).toEqual({ h: 'm-h', o: 'm-o', k: '' });
    expect(startingPairs(teams, mobile, { h: 'm-o', k: 'm-k' })).toEqual({ h: 'm-o', o: 'm-o', k: 'm-k' });
    expect(startingPairs(teams, mobile, { k: 'gone' })).toEqual({ h: 'm-h', o: 'm-o', k: '' });
    expect(startingPairs(teams, [], { h: 'm-h' })).toEqual({ h: '', o: '', k: '' });
  });

  it('finds duplicates, words the unpaired hint and labels leagues as the old picker did', () => {
    expect(duplicateMobileTeams([{ mobileTeamId: 'a' }, { mobileTeamId: '' }, { mobileTeamId: '' }])).toEqual([]);
    expect(duplicateMobileTeams([{ mobileTeamId: 'a' }, { mobileTeamId: 'b' }, { mobileTeamId: 'a' }])).toEqual(['a']);
    expect(unpairedHint(0)).toBe('');
    expect(unpairedHint(1)).toBe('1 team not paired. Results involving them will be listed but cannot be approved.');
    expect(unpairedHint(2)).toMatch(/^2 teams not paired\./);
    expect(leagueLabel({ name: 'Harbour League', season: '2026' })).toBe('Harbour League (2026)');
    expect(leagueLabel({ name: 'Autumn', season: '2025', is_archived: true, is_closed: true })).toBe(
      'Autumn (2025) · archived',
    );
    expect(leagueLabel({ name: 'Drop-in', season: '', is_closed: true })).toBe('Drop-in · closed');
  });

  it('offers real leagues only, keeping a drop-in space the division is already linked to', () => {
    const leagues = [
      { id: 'l1', kind: 'league' as const },
      { id: 'shared', kind: 'recreational' as const },
      { id: 'private', kind: 'recreational' as const },
    ];
    expect(linkableLeagues(leagues, null).map((l) => l.id)).toEqual(['l1']);
    expect(linkableLeagues(leagues, 'l1').map((l) => l.id)).toEqual(['l1']);
    expect(linkableLeagues(leagues, 'private').map((l) => l.id)).toEqual(['l1', 'private']);
    expect(linkableLeagues([], null)).toEqual([]);
  });
});

const input = (pairs: { teamId: string; mobileTeamId: string }[]) => ({
  eventId: EVENT,
  divisionId: DIV,
  leagueId: 'league-open',
  expectedLeagueId: null,
  confirmReplace: false,
  pairs,
});

beforeEach(() => {
  vi.clearAllMocks();
  fake.configured = true;
  fake.authorize.mockResolvedValue({ ok: true, data: { id: 'u' } });
  fake.canEdit.mockResolvedValue(true);
  fake.division = { id: DIV, event_id: EVENT, teams: [{ id: HAWKS }, { id: OWLS }], division_mobile_links: null };
  fake.leagues.mockResolvedValue([{ id: 'league-open', name: 'Harbour League', season: '2026' }]);
  fake.teams.mockResolvedValue([
    { id: 'team-hawks', name: 'Harbour Hawks' },
    { id: 'team-owls', name: 'Night Owls' },
  ]);
  fake.rpc.mockResolvedValue({ data: null, error: null });
});

describe('saveMobileLink (M-03)', () => {
  it('saves the link with the league as the mobile app names it, and only the paired teams', async () => {
    expect(
      await saveMobileLink(
        input([
          { teamId: HAWKS, mobileTeamId: 'team-hawks' },
          { teamId: OWLS, mobileTeamId: '' },
        ]),
      ),
    ).toEqual({ ok: true, data: undefined });
    expect(fake.teams).toHaveBeenCalledWith('league-open');
    expect(fake.rpc).toHaveBeenCalledWith('set_division_mobile_link', {
      p_division_id: DIV,
      p_league_id: 'league-open',
      p_league_name: 'Harbour League',
      p_season: '2026',
      p_teams: [{ team_id: HAWKS, mobile_team_id: 'team-hawks' }],
      p_expected_league_id: null,
      p_confirm_replace: false,
    });
    expect(fake.revalidate).toHaveBeenCalledWith(`/admin/events/${EVENT}/results`);
  });

  it('refuses two teams on one mobile team, before reading anything', async () => {
    expect(
      await saveMobileLink(
        input([
          { teamId: HAWKS, mobileTeamId: 'team-hawks' },
          { teamId: OWLS, mobileTeamId: 'team-hawks' },
        ]),
      ),
    ).toEqual({ ok: false, error: DUPLICATE });
    expect(fake.leagues).not.toHaveBeenCalled();
    fake.rpc.mockResolvedValueOnce({ data: null, error: { code: '23505' } });
    expect(await saveMobileLink(input([{ teamId: HAWKS, mobileTeamId: 'team-hawks' }]))).toEqual({
      ok: false,
      error: DUPLICATE,
    });
  });

  it('refuses a team from elsewhere, a division of another event, and a mobile team the league does not have', async () => {
    expect(await saveMobileLink(input([{ teamId: OTHER, mobileTeamId: 'team-hawks' }]))).toEqual({
      ok: false,
      error: CHECK,
    });
    fake.division = { id: DIV, event_id: '00000000-0000-4000-8000-000000000009', teams: [{ id: HAWKS }] };
    expect(await saveMobileLink(input([{ teamId: HAWKS, mobileTeamId: 'team-hawks' }]))).toEqual({
      ok: false,
      error: CHECK,
    });
    fake.division = { id: DIV, event_id: EVENT, teams: [{ id: HAWKS }] };
    expect(await saveMobileLink(input([{ teamId: HAWKS, mobileTeamId: 'team-ghost' }]))).toEqual({
      ok: false,
      error: CHECK,
    });
    fake.division = null;
    expect(await saveMobileLink(input([]))).toEqual({ ok: false, error: CHECK });
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it('refuses a stale link and an unconfirmed replacement', async () => {
    fake.division = {
      id: DIV,
      event_id: EVENT,
      teams: [{ id: HAWKS }],
      division_mobile_links: { league_id: 'league-old' },
    };
    expect(await saveMobileLink(input([]))).toEqual({ ok: false, error: CHECK });
    expect(await saveMobileLink({ ...input([]), expectedLeagueId: 'league-old' })).toEqual({ ok: false, error: CHECK });
    expect((await saveMobileLink({ ...input([]), expectedLeagueId: 'league-old', confirmReplace: true })).ok).toBe(
      true,
    );
    expect(fake.rpc).toHaveBeenCalledTimes(1);
  });

  it('says so when the league is gone or the mobile app does not answer', async () => {
    fake.leagues.mockResolvedValueOnce([]);
    expect(await saveMobileLink(input([]))).toEqual({
      ok: false,
      error: 'That league is no longer in the mobile app. Choose another.',
    });
    fake.teams.mockRejectedValueOnce(new Error('Mobile data unavailable'));
    expect(await saveMobileLink(input([]))).toEqual({
      ok: false,
      error: 'Could not reach the mobile app. Try again in a moment.',
    });
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it('checks sign-in, the integration, the input and ownership', async () => {
    fake.authorize.mockResolvedValueOnce({ ok: false, error: 'Please sign in again.' });
    expect(await saveMobileLink(input([]))).toEqual({ ok: false, error: 'Please sign in again.' });
    fake.configured = false;
    expect(await saveMobileLink(input([]))).toEqual({
      ok: false,
      error: 'The mobile app integration is not configured.',
    });
    fake.configured = true;
    expect(await saveMobileLink({ ...input([]), leagueId: '' })).toEqual({ ok: false, error: CHECK });
    fake.canEdit.mockResolvedValueOnce(false);
    expect(await saveMobileLink(input([]))).toEqual({ ok: false, error: 'You can only edit your own events.' });
    fake.rpc.mockResolvedValueOnce({ data: null, error: { code: '42501' } });
    expect(await saveMobileLink(input([]))).toEqual({ ok: false, error: 'Could not save the link. Please try again.' });
  });
});
