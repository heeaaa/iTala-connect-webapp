import { describe, expect, it } from 'vitest';

import {
  dayOf,
  hasDrifted,
  isSettling,
  scoredGameIds,
  type ApprovedSource,
  type MobileFinal,
} from '@/domain/mobile-matching';
import { placePlayoffGames, resolveAllPlayoffs } from '@/domain/playoffs';
import { matchupCounts, reconcileSchedule } from '@/domain/schedule-edit';
import {
  buildSlotGrid,
  circleRounds,
  divisionRounds,
  fromMinutes,
  generateDivisionRoundRobin,
  isUnscheduled,
  maxRoundsFor,
  sortSchedule,
} from '@/domain/scheduler';
import { computeStandings } from '@/domain/standings';
import { type Game } from '@/domain/types';

/*
 * Rules the golden suite cannot reach (recorded Fixes, the PRD's
 * hand-checked cases, and defensive branches). Parity with the old code
 * lives in golden-parity.test.ts.
 */

function game(over: Partial<Game> = {}): Game {
  return {
    day: '2026-10-03',
    time: '09:00',
    court: 1,
    divisionId: 'd',
    groupId: null,
    team1Id: 'a',
    team2Id: 'b',
    label: 'Open',
    type: 'group',
    score1: null,
    score2: null,
    ...over,
  };
}

describe('standings: the hand-checked cases from the old regression.js (PRD 12.4)', () => {
  it('a winner: 1 win, 0 losses, 61 for, 58 against, +3', () => {
    const [a, b] = computeStandings(['a', 'b'], [game({ score1: 61, score2: 58 })], 'd');
    expect(a).toEqual({ teamId: 'a', w: 1, l: 0, pf: 61, pa: 58, diff: 3, gp: 1 });
    expect(b).toEqual({ teamId: 'b', w: 0, l: 1, pf: 58, pa: 61, diff: -3, gp: 1 });
  });

  it('a level game adds points but no win or loss', () => {
    const rows = computeStandings(['a', 'b'], [game({ score1: 74, score2: 74 })], 'd');
    expect(rows.map((r) => [r.teamId, r.w, r.l, r.pf, r.pa, r.diff])).toEqual([
      ['a', 0, 0, 74, 74, 0],
      ['b', 0, 0, 74, 74, 0],
    ]);
  });

  it('unplayed teams show zeros, in insertion order', () => {
    expect(computeStandings(['x', 'y'], [], 'd').map((r) => [r.teamId, r.w, r.pf, r.gp])).toEqual([
      ['x', 0, 0, 0],
      ['y', 0, 0, 0],
    ]);
  });

  it('skips a game against a team from another division', () => {
    const rows = computeStandings(['a', 'b'], [game({ team2Id: 'other', score1: 10, score2: 2 })], 'd');
    expect(rows.every((r) => r.gp === 0)).toBe(true);
  });
});

describe('playoff placement: recorded Fixes', () => {
  const setup = { days: ['2026-10-03'], timeStart: '09:00', timeEnd: '12:00' };

  it('E-64: games that cannot fit go to Unscheduled, and so does every later round', () => {
    const existing = [game({ time: '09:00' }), game({ time: '10:00' })];
    const out = placePlayoffGames(setup, existing, { id: 'd', name: 'Open' }, 4);
    expect(out.map((g) => g.time)).toEqual(['11:00', null, null]);
    expect(out.map((g) => g.label)).toEqual(['Open - Semi 1', 'Open - Semi 2', 'Open - Finals']);
  });

  it('E-64: an event with no days parks the whole bracket', () => {
    const out = placePlayoffGames({ ...setup, days: [] }, [], { id: 'd', name: 'Open' }, 2);
    expect(out).toHaveLength(1);
    // A 2-team bracket is one "Semi 1" game, as in the old code (golden bracket cases).
    expect(out[0]).toMatchObject({ day: null, time: null, court: null, type: 'semi', label: 'Open - Semi 1' });
  });

  it('E-41: the end time keeps its minutes (old code rounded 12:30 down to 12:00)', () => {
    const out = placePlayoffGames(
      { ...setup, timeEnd: '12:30' },
      [game({ time: '10:00' })],
      { id: 'd', name: 'Open' },
      2,
    );
    expect(out[0]).toMatchObject({ day: '2026-10-03', time: '11:00', court: 1 });
    const later = placePlayoffGames(
      { ...setup, timeEnd: '12:30' },
      [game({ time: '11:00' })],
      { id: 'd', name: 'Open' },
      2,
    );
    expect(later[0]).toMatchObject({ time: '12:00' });
  });

  it('ignores a game with a day but no time when finding the latest game', () => {
    const out = placePlayoffGames(setup, [game({ time: null })], { id: 'd', name: 'Open' }, 2);
    expect(out[0]).toMatchObject({ time: '09:00' });
  });

  it('fewer than two teams means no bracket', () => {
    expect(placePlayoffGames(setup, [], { id: 'd', name: 'Open' }, 1)).toEqual([]);
  });
});

describe('playoff resolution', () => {
  it('a playoff in a division the event does not list resolves seeds to TBD', () => {
    const po = game({
      divisionId: 'gone',
      type: 'final',
      team1Id: 'stale',
      playoff: {
        bracketGameId: 'po_gone_1',
        team1Source: { type: 'seed', rank: 1 },
        team2Source: { type: 'seed', rank: 2 },
        round: 1,
      },
    });
    const [out] = resolveAllPlayoffs([{ id: 'd', teamIds: ['a', 'b'] }], [po]);
    expect([out!.team1Id, out!.team2Id]).toEqual([null, null]);
    // The input is not changed.
    expect(po.team1Id).toBe('stale');
  });
});

describe('schedule edits', () => {
  it('reconcile treats a missing court count as one court and a missing court as court 1', () => {
    const setup = { days: ['2026-10-03'], timeStart: '09:00', timeEnd: '12:00', courts: 0 };
    const { games, moved } = reconcileSchedule(setup, [game({ court: null }), game({ court: 2 })]);
    expect(moved).toBe(1);
    expect(games[0]).toMatchObject({ court: null, day: '2026-10-03' });
    expect(games[1]).toMatchObject({ day: null, time: null, court: null });
  });

  it('matchup counts skip other-division teams and a team against itself', () => {
    const games = [game(), game({ team1Id: 'b', team2Id: 'a' }), game({ team2Id: 'z' }), game({ team2Id: 'a' })];
    const { counts, totalGames } = matchupCounts(games, 'd', ['a', 'b']);
    expect(Object.fromEntries(counts)).toEqual({ 'a|b': 2 });
    expect(totalGames).toBe(2);
  });
});

describe('scheduler helpers', () => {
  it('maxRoundsFor matches the E-63 dialog (full round robin games per team)', () => {
    expect([0, 1, 2, 3, 4, 5].map(maxRoundsFor)).toEqual([0, 0, 1, 3, 3, 5]);
  });

  it('formats minutes, spots unscheduled games, and sorts unscheduled last', () => {
    expect(fromMinutes(9 * 60 + 5)).toBe('09:05');
    expect(isUnscheduled({ day: '2026-10-03', time: null })).toBe(true);
    const sorted = sortSchedule([
      game({ day: null, time: null, court: null, label: 'u' }),
      game({ court: null, label: 'no-court' }),
      game({ court: 2, label: 'c2' }),
    ]);
    expect(sorted.map((g) => g.label)).toEqual(['no-court', 'c2', 'u']);
  });

  it('circle rounds give 4 teams 3 rounds and 5 teams 5 rounds (PRD 12.2)', () => {
    expect(circleRounds(['a', 'b', 'c', 'd'], 0)).toHaveLength(3);
    expect(circleRounds(['a', 'b', 'c', 'd', 'e'], 0)).toHaveLength(5);
    expect(circleRounds(['a', 'b', 'c', 'd', 'e'], 0).flat()).toHaveLength(10);
    expect(circleRounds(['a', 'b', 'c', 'd'], 2)).toHaveLength(2);
  });
});

describe('mobile matching edge cases', () => {
  const rec: ApprovedSource = { mobileGameId: 'm', homePts: 50, awayPts: 40, eventCount: 12, lastEventAt: 'x' };
  const f = (over: Partial<MobileFinal>): MobileFinal => ({
    game_id: 'm',
    home_team_id: 'h',
    away_team_id: 'a',
    home_pts: 50,
    away_pts: 40,
    event_count: 12,
    finished_at: 1,
    last_event_at: 'x',
    ...over,
  });

  it('is not settling without a last event time', () => {
    expect(isSettling({ last_event_at: null }, Date.now())).toBe(false);
  });

  it('drifts on any change to points, event count or last event, and treats missing values alike', () => {
    expect(hasDrifted(rec, f({}))).toBe(false);
    expect(hasDrifted(rec, f({ last_event_at: 'y' }))).toBe(true);
    expect(
      hasDrifted(
        { ...rec, homePts: null, eventCount: null, lastEventAt: null },
        f({ home_pts: null, event_count: 0, last_event_at: '' }),
      ),
    ).toBe(false);
  });

  it('has no finish day for a time beyond the representable date range', () => {
    expect(dayOf({ finished_at: 9e15 }, 'Pacific/Auckland')).toBeNull();
    expect(dayOf({ finished_at: null }, 'Pacific/Auckland')).toBeNull();
  });
});

describe('defensive fallbacks', () => {
  const setup = {
    days: ['2026-10-03'],
    timeStart: '09:00',
    timeEnd: '13:00',
    courts: 1,
    divisions: [{ id: 'd', name: 'Open', teamIds: ['a', 'b', 'c', 'd'], bracketCount: 0, gamesPerTeam: null }],
  };

  it('a court count of 0 means one court, and a bracket count of 0 means one group', () => {
    expect(buildSlotGrid({ ...setup, courts: 0 })[0]!.rows[0]!.courts).toEqual([1]);
    expect(
      divisionRounds(setup.divisions[0]!)
        .flat()
        .every((p) => p.groupId === null),
    ).toBe(true);
  });

  it('round robin for an unknown division adds nothing', () => {
    expect(generateDivisionRoundRobin(setup, 'nope', [])).toEqual([]);
  });

  it('existing TBD playoff games block their slot but give no team a rest', () => {
    const tbd = game({ time: '09:00', team1Id: null, team2Id: null, type: 'final' });
    const out = generateDivisionRoundRobin(setup, 'd', [tbd], 1);
    expect(out.map((g) => g.time)).toEqual(['10:00', '11:00']);
  });

  it('sorting compares a missing court as 0 either way round', () => {
    const sorted = sortSchedule([game({ court: 2, label: 'c2' }), game({ court: null, label: 'none' })]);
    expect(sorted.map((g) => g.label)).toEqual(['none', 'c2']);
  });

  it('playoffs start after the latest game on any court', () => {
    const existing = [game({ time: '10:00' }), game({ time: '11:00', court: 2 })];
    const out = placePlayoffGames(setup, existing, { id: 'd', name: 'Open' }, 2);
    expect(out[0]).toMatchObject({ time: '12:00', court: 1 });
  });

  it('drift compares a missing away score as blank', () => {
    const rec: ApprovedSource = { mobileGameId: 'm', homePts: 1, awayPts: null, eventCount: 1, lastEventAt: null };
    const final: MobileFinal = {
      game_id: 'm',
      home_team_id: 'h',
      away_team_id: 'a',
      home_pts: 1,
      away_pts: null,
      event_count: 1,
      finished_at: 1,
      last_event_at: null,
    };
    expect(hasDrifted(rec, final)).toBe(false);
  });
});

describe('empty inputs', () => {
  it('circle rounds need two teams', () => {
    expect(circleRounds(['solo'], 0)).toEqual([]);
    expect(circleRounds([], 3)).toEqual([]);
  });

  it('an empty daily window parks every playoff game', () => {
    const out = placePlayoffGames(
      { days: ['2026-10-03', '2026-10-04'], timeStart: '12:00', timeEnd: '12:00' },
      [],
      { id: 'd', name: 'Open' },
      4,
    );
    expect(out.map((g) => g.day)).toEqual([null, null, null]);
  });
});

describe('review regressions (independent review, 25/09/2026)', () => {
  const setup = {
    days: ['2026-10-03'],
    timeStart: '09:00',
    timeEnd: '11:00',
    courts: 1,
    divisions: [
      { id: 'd', name: 'Open', teamIds: ['a', 'b', 'c', 'd', 'e', 'f'], bracketCount: 1, gamesPerTeam: null },
    ],
  };

  it('a day listed twice never double-books a playoff slot', () => {
    const out = placePlayoffGames(
      { days: ['2026-10-03', '2026-10-03'], timeStart: '09:00', timeEnd: '11:00' },
      [game({ time: '09:00' })],
      { id: 'd', name: 'Open' },
      4,
    );
    expect(out.map((g) => g.time)).toEqual(['10:00', null, null]);
  });

  it('an existing game stored as "HH:MM:SS" still occupies its slot', () => {
    const out = generateDivisionRoundRobin(
      { ...setup, timeEnd: '10:00' },
      'd',
      [game({ time: '09:00:00', team1Id: 'x', team2Id: 'y' })],
      1,
    );
    expect(out.every((g) => g.time === null)).toBe(true);
  });

  it('an empty score record is not a score', () => {
    const ids = scoredGameIds(
      [{ id: 'g1' }, { id: 'g2' }],
      null,
      { g1: {} as never, g2: { score1: 0, score2: null } },
      true,
    );
    expect([...ids]).toEqual(['g2']);
  });

  it('a fractional games-per-team value is truncated, as the old parseInt did', () => {
    const div = { ...setup.divisions[0]!, gamesPerTeam: 2.5 };
    expect(divisionRounds(div)).toHaveLength(2);
    expect(divisionRounds(setup.divisions[0]!, 1.9)).toHaveLength(1);
  });

  it('round robin skips pairings already played in a resolved playoff game of the division', () => {
    const po = game({
      team1Id: 'a',
      team2Id: 'b',
      type: 'final',
      playoff: {
        bracketGameId: 'po_d_1',
        team1Source: { type: 'seed', rank: 1 },
        team2Source: { type: 'seed', rank: 2 },
        round: 1,
      },
    });
    const four = { ...setup, timeEnd: '20:00', divisions: [{ ...setup.divisions[0]!, teamIds: ['a', 'b'] }] };
    expect(generateDivisionRoundRobin(four, 'd', [po])).toEqual([]);
  });
});
