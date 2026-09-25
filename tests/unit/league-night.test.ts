import { describe, expect, it } from 'vitest';

import { gameStatus, toMinutes } from '@/domain/game-day';
import { SAMPLE_DAYS, SAMPLE_GAME_DAY, sampleLeague } from '@/prototype/league-night';

const at = (hhmm: string) => ({ date: SAMPLE_GAME_DAY, minutes: toMinutes(hhmm) });

describe('prototype sample league', () => {
  it.each([2, 4] as const)('is a valid schedule with %i courts: no slot collisions, 120-minute rest', (courts) => {
    const event = sampleLeague({ courts, clock: at('19:25') });
    const slots = new Set(event.games.map((g) => `${g.day} ${g.time} ${g.court}`));
    expect(slots.size).toBe(event.games.length);
    expect(event.courtNames).toHaveLength(courts);
    expect(event.divisions).toHaveLength(courts);

    for (const team of event.teams) {
      for (const day of SAMPLE_DAYS) {
        const starts = event.games
          .filter((g) => g.day === day && (g.team1Id === team.id || g.team2Id === team.id))
          .map((g) => toMinutes(g.time!))
          .sort((a, b) => a - b);
        starts.slice(1).forEach((s, i) => expect(s - starts[i]!).toBeGreaterThanOrEqual(120));
      }
    }
  });

  it('shows every game-day state at 7:25 pm', () => {
    const event = sampleLeague({ courts: 2, clock: at('19:25') });
    const statuses = new Set(event.games.map((g) => gameStatus(g, at('19:25'))));
    expect(statuses).toEqual(new Set(['final', 'awaiting-score', 'on-court', 'upcoming']));
    const live = event.games.find((g) => g.day === SAMPLE_GAME_DAY && g.time === '19:00' && g.court === 1)!;
    expect(live.score1).not.toBeNull();
  });

  it('leaves later games unscored and playoffs TBD', () => {
    const event = sampleLeague({ courts: 2, clock: at('17:30') });
    expect(event.games.filter((g) => g.day === SAMPLE_GAME_DAY).every((g) => g.score1 === null)).toBe(true);
    const finals = event.games.filter((g) => g.type !== 'group');
    expect(finals.length).toBeGreaterThan(0);
    expect(finals.every((g) => g.team1Id === null && g.score1 === null)).toBe(true);
  });

  it('scores every game on past nights', () => {
    const event = sampleLeague({ courts: 2, clock: at('23:00') });
    const past = event.games.filter((g) => g.day! < SAMPLE_GAME_DAY);
    expect(past.every((g) => g.score1 !== null && g.score2 !== null)).toBe(true);
  });
});
