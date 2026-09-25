import { describe, expect, it } from 'vitest';

import {
  compareScheduled,
  courtStations,
  dayWindow,
  gameStatus,
  hasBothScores,
  involvesTeam,
  nextGameForTeam,
  nowFraction,
  pickFocusDay,
  toMinutes,
  type Clock,
  type DayGame,
} from '@/domain/game-day';

const TONIGHT = '2026-09-25';

function game(id: string, over: Partial<DayGame> = {}): DayGame {
  return {
    id,
    day: TONIGHT,
    time: '18:00',
    court: 1,
    team1Id: 'a',
    team2Id: 'b',
    score1: null,
    score2: null,
    ...over,
  };
}

const at = (hhmm: string, date = TONIGHT): Clock => ({ date, minutes: toMinutes(hhmm) });

describe('toMinutes and hasBothScores', () => {
  it('reads HH:MM as minutes after midnight', () => {
    expect(toMinutes('00:00')).toBe(0);
    expect(toMinutes('19:40')).toBe(1180);
  });

  it('counts 0 as a score and needs both sides', () => {
    expect(hasBothScores({ score1: 0, score2: 0 })).toBe(true);
    expect(hasBothScores({ score1: 12, score2: null })).toBe(false);
    expect(hasBothScores({ score1: null, score2: null })).toBe(false);
  });
});

describe('gameStatus', () => {
  it('is unscheduled without a day or a time', () => {
    expect(gameStatus(game('g', { day: null }), at('18:00'))).toBe('unscheduled');
    expect(gameStatus(game('g', { time: null }), at('18:00'))).toBe('unscheduled');
  });

  it('is on court from the slot start up to (not including) its end', () => {
    expect(gameStatus(game('g'), at('17:59'))).toBe('upcoming');
    expect(gameStatus(game('g'), at('18:00'))).toBe('on-court');
    expect(gameStatus(game('g'), at('18:59'))).toBe('on-court');
    expect(gameStatus(game('g'), at('19:00'))).toBe('awaiting-score');
  });

  it('is final once the slot has passed with both scores, including 0', () => {
    expect(gameStatus(game('g', { score1: 0, score2: 3 }), at('19:00'))).toBe('final');
    expect(gameStatus(game('g', { score1: 40, score2: null }), at('19:00'))).toBe('awaiting-score');
  });

  it('uses the day before the time', () => {
    expect(gameStatus(game('g', { day: '2026-09-18', score1: 1, score2: 2 }), at('08:00'))).toBe('final');
    expect(gameStatus(game('g', { day: '2026-09-18' }), at('08:00'))).toBe('awaiting-score');
    expect(gameStatus(game('g', { day: '2026-10-02' }), at('23:00'))).toBe('upcoming');
  });

  it('honours a custom slot length', () => {
    expect(gameStatus(game('g'), at('18:45'), 40)).toBe('awaiting-score');
  });
});

describe('pickFocusDay', () => {
  const days = ['2026-10-02', '2026-09-18', '2026-09-25'];

  it('opens on today when it is an event day', () => {
    expect(pickFocusDay(days, TONIGHT)).toEqual({ day: TONIGHT, relation: 'today' });
  });

  it('opens on the next event day between event days', () => {
    expect(pickFocusDay(days, '2026-09-20')).toEqual({ day: '2026-09-25', relation: 'upcoming' });
    expect(pickFocusDay(days, '2026-01-01')).toEqual({ day: '2026-09-18', relation: 'upcoming' });
  });

  it('opens on the last event day once the event is over', () => {
    expect(pickFocusDay(days, '2026-12-01')).toEqual({ day: '2026-10-02', relation: 'past' });
  });

  it('is null when the event has no days', () => {
    expect(pickFocusDay([], TONIGHT)).toBeNull();
  });
});

describe('compareScheduled', () => {
  it('orders by day, time, then court; unscheduled first as the empty key', () => {
    const list = [
      game('c2', { court: 2 }),
      game('late', { time: '20:00' }),
      game('c1', { court: 1 }),
      game('prev', { day: '2026-09-18', time: '21:00' }),
      game('none', { day: null, time: null, court: null }),
    ];
    expect([...list].sort(compareScheduled).map((g) => g.id)).toEqual(['none', 'prev', 'c1', 'c2', 'late']);
  });

  it('treats two unscheduled games as equal, and a missing court as court 0', () => {
    const loose = game('a', { day: null, time: null, court: null });
    expect(compareScheduled(loose, game('b', { day: null, time: null, court: null }))).toBe(0);
    expect(compareScheduled(game('x', { court: null }), game('y', { court: 2 }))).toBeLessThan(0);
    expect(compareScheduled(game('y', { court: 2 }), game('x', { court: null }))).toBeGreaterThan(0);
  });
});

describe('courtStations', () => {
  const tonight = [
    game('c1-18', { time: '18:00', score1: 61, score2: 58 }),
    game('c1-19', { time: '19:00', score1: 20, score2: 18 }),
    game('c1-20', { time: '20:00' }),
    game('c1-21', { time: '21:00' }),
    game('c2-18', { court: 2, time: '18:00' }),
    game('c2-19', { court: 2, time: '19:00' }),
    game('other-day', { day: '2026-09-18', time: '19:00' }),
    game('unscheduled', { day: null, time: null, court: null }),
    game('no-time', { time: null }),
  ];

  it('gives each court its latest finished game, the game on court, and the next two', () => {
    const [c1, c2] = courtStations(tonight, TONIGHT, 2, at('19:25'));
    expect(c1).toMatchObject({ court: 1 });
    expect(c1!.final?.id).toBe('c1-18');
    expect(c1!.onCourt?.id).toBe('c1-19');
    expect(c1!.upNext?.id).toBe('c1-20');
    expect(c1!.then?.id).toBe('c1-21');
    // Court 2's 18:00 game has no scores yet: it still counts as finished.
    expect(c2!.final?.id).toBe('c2-18');
    expect(c2!.onCourt?.id).toBe('c2-19');
    expect(c2!.upNext).toBeNull();
    expect(c2!.then).toBeNull();
  });

  it('before the first game there is nothing finished or on court', () => {
    const [c1] = courtStations(tonight, TONIGHT, 1, at('17:00'));
    expect(c1).toMatchObject({ final: null, onCourt: null });
    expect(c1!.upNext?.id).toBe('c1-18');
  });

  it('lists courts with no games as empty', () => {
    const stations = courtStations(tonight, TONIGHT, 3, at('19:25'));
    expect(stations).toHaveLength(3);
    expect(stations[2]).toEqual({ court: 3, final: null, onCourt: null, upNext: null, then: null });
  });
});

describe('involvesTeam and nextGameForTeam', () => {
  const games = [
    game('past', { time: '18:00', team1Id: 'r', team2Id: 'h', score1: 50, score2: 40 }),
    game('later', { day: '2026-10-02', time: '18:00', team1Id: 'r', team2Id: 'x' }),
    game('tonight', { time: '20:00', team1Id: 'x', team2Id: 'r' }),
    game('not-r', { time: '19:00', team1Id: 'x', team2Id: 'y' }),
  ];

  it('matches either side', () => {
    expect(involvesTeam(games[2]!, 'r')).toBe(true);
    expect(involvesTeam(games[3]!, 'r')).toBe(false);
  });

  it('finds the next game across days, skipping finished ones', () => {
    expect(nextGameForTeam(games, 'r', at('19:25'))?.id).toBe('tonight');
    expect(nextGameForTeam(games, 'r', at('21:30'))?.id).toBe('later');
  });

  it('returns the game on court now before later ones', () => {
    expect(nextGameForTeam(games, 'r', at('20:10'))?.id).toBe('tonight');
  });

  it('is null when the team has no games left', () => {
    expect(nextGameForTeam(games, 'r', at('23:00', '2026-10-02'))).toBeNull();
  });
});

describe('dayWindow and nowFraction', () => {
  const games = [game('a', { time: '18:00' }), game('b', { time: '21:00' }), game('x', { day: '2026-09-18' })];

  it('spans first start to last end', () => {
    expect(dayWindow(games, TONIGHT)).toEqual({ start: 1080, end: 1320 });
    expect(dayWindow(games, TONIGHT, 30)).toEqual({ start: 1080, end: 1290 });
  });

  it('is null on a day with no scheduled games', () => {
    expect(dayWindow(games, '2026-10-02')).toBeNull();
  });

  it('places now inside the window, and nowhere outside it', () => {
    const w = { start: 1080, end: 1320 };
    expect(nowFraction(at('18:00'), TONIGHT, w)).toBe(0);
    expect(nowFraction(at('20:00'), TONIGHT, w)).toBe(0.5);
    expect(nowFraction(at('22:00'), TONIGHT, w)).toBe(1);
    expect(nowFraction(at('17:59'), TONIGHT, w)).toBeNull();
    expect(nowFraction(at('22:01'), TONIGHT, w)).toBeNull();
    expect(nowFraction(at('19:00', '2026-09-18'), TONIGHT, w)).toBeNull();
  });
});
