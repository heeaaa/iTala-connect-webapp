import { describe, expect, it } from 'vitest';
import { matchFinals, parseFixtureClaim, type MobileFinal } from '@/domain/mobile-matching';

const ID = '40000000-0000-4000-8000-000000000001';
const REPEAT = '40000000-0000-4000-8000-000000000002';
const FOREIGN = '40000000-0000-4000-8000-000000000003';
const finished: MobileFinal = {
  game_id: `cg_${ID}`,
  league_id: 'league-open',
  home_team_id: 'mobile-a',
  away_team_id: 'mobile-b',
  home_pts: 0,
  away_pts: 51,
  event_count: 4,
  finished_at: '2026-09-29T08:00:00Z',
  last_event_at: '2026-09-29T08:00:00Z',
};
const games = [
  { id: ID, divisionId: 'division-a', day: '2026-10-02', team1Id: 'team-b', team2Id: 'team-a' },
  { id: REPEAT, divisionId: 'division-a', day: '2026-09-29', team1Id: 'team-a', team2Id: 'team-b' },
  { id: FOREIGN, divisionId: 'division-b', day: '2026-09-29', team1Id: 'team-a', team2Id: 'team-b' },
];
const source = {
  mobileGameId: finished.game_id,
  homePts: 0,
  awayPts: 51,
  eventCount: 4,
  lastEventAt: finished.last_event_at,
};
const match = (overrides: Record<string, unknown> = {}) =>
  matchFinals({
    games,
    divisionId: 'division-a',
    leagueId: 'league-open',
    teamMap: { 'team-a': 'mobile-a', 'team-b': 'mobile-b' },
    sources: {},
    finals: [finished],
    scoredGameIds: new Set<string>(),
    nowMs: Date.parse('2026-09-30T08:00:00Z'),
    timeZone: 'Pacific/Auckland',
    ...overrides,
  })[0]!;

describe('scheduled fixture claims (CSI-03 to CSI-08)', () => {
  it('accepts only a complete cg_ UUID; malformed claims never fall back to legacy matching', () => {
    expect(parseFixtureClaim(`cg_${ID}`)).toEqual({ kind: 'valid', gameId: ID });
    for (const id of ['cg_', 'cg_bad', `cg_${ID}junk`, 'cg_40000000-0000-4000-8000-00000000000z']) {
      expect(parseFixtureClaim(id)).toEqual({ kind: 'invalid' });
      expect(match({ finals: [{ ...finished, game_id: id }] })).toMatchObject({ state: 'review', pick: null });
    }
    expect(parseFixtureClaim('old-freeform')).toEqual({ kind: 'legacy' });
  });

  it('uses only the claimed fixture through moved dates, repeated opponents and reversed teams', () => {
    expect(match()).toMatchObject({ state: 'proposed', pick: { gameId: ID, sameDay: false } });
    expect(match().candidates.map((c) => c.gameId)).toEqual([ID]);
  });

  it('rejects a foreign division, missing fixture, wrong league, changed pairs and any existing score', () => {
    expect(match({ finals: [{ ...finished, game_id: `cg_${FOREIGN}` }] })).toMatchObject({ state: 'review' });
    expect(match({ finals: [{ ...finished, game_id: 'cg_40000000-0000-4000-8000-000000000099' }] })).toMatchObject({
      state: 'review',
    });
    expect(match({ finals: [{ ...finished, league_id: 'other-league' }] })).toMatchObject({ state: 'review' });
    expect(match({ teamMap: { 'team-a': 'mobile-a' } })).toMatchObject({ state: 'review' });
    for (const score of [
      { score1: 0, score2: null },
      { score1: null, score2: 1 },
      { score1: 0, score2: 51 },
    ]) {
      expect(
        match({ scoredGameIds: new Set([ID]), games: [{ ...games[0], ...score }, games[1], games[2]] }),
      ).toMatchObject({
        state: 'review',
        reason: 'Connect already has a score for this fixture',
      });
    }
  });

  it('keeps approval and drift for the same fixture, but flags provenance on another fixture', () => {
    expect(match({ sources: { [ID]: source }, scoredGameIds: new Set([ID]) })).toMatchObject({ state: 'approved' });
    expect(match({ sources: { [ID]: source }, finals: [{ ...finished, home_pts: 2 }] })).toMatchObject({
      state: 'drifted',
    });
    expect(match({ sources: { [REPEAT]: source } })).toMatchObject({ state: 'review', pick: null });
    expect(match({ conflictingMobileGameIds: new Set([finished.game_id]) })).toMatchObject({
      state: 'review',
      reason: 'This mobile final was approved for a different fixture',
    });
  });

  it('keeps legacy freeform team and date selection', () => {
    expect(match({ finals: [{ ...finished, game_id: 'legacy-id' }] })).toMatchObject({
      state: 'proposed',
      pick: { gameId: REPEAT },
    });
  });

  it('sends an explicit zero-event default to approval but still reviews an ordinary zero-event final', () => {
    const byDefault = { ...finished, home_pts: 30, away_pts: 0, event_count: 0, last_event_at: null, is_default: true };
    expect(match({ finals: [byDefault] })).toMatchObject({
      state: 'proposed',
      pick: { gameId: ID },
      final: { home_pts: 30, away_pts: 0 },
    });
    expect(match({ finals: [{ ...byDefault, is_default: false }] })).toMatchObject({
      state: 'review',
      reason: 'no stats were recorded for this game',
    });
  });
});
