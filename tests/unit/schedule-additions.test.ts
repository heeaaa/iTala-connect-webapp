import { describe, expect, it } from 'vitest';
import {
  ENTER_GAMES,
  additionMessage,
  maxCustomGames,
  defaultGamesPerTeam,
  defaultPlayoffTeams,
  playoffProblem,
  roundRobinProblem,
  roundRobinSummary,
} from '@/lib/schedule-additions';

describe('round robin dialog text and checks (E-63)', () => {
  it('describes a full round robin as the old editor did', () => {
    expect(roundRobinSummary(4)).toBe(
      '4 teams. A full round robin is 6 games (3 per team). Matchups already on the schedule are skipped, and new games take whatever slots are still free.',
    );
    expect(roundRobinSummary(5)).toContain('5 teams. A full round robin is 10 games (5 per team).');
    expect(roundRobinSummary(2)).toContain('A full round robin is 1 game (1 per team).');
  });

  it("starts from the division's saved number, else min(3, max)", () => {
    expect(defaultGamesPerTeam(6, { custom: true, gamesPerTeam: 2 })).toBe(2);
    expect(defaultGamesPerTeam(6, { custom: false, gamesPerTeam: 2 })).toBe(3);
    expect(defaultGamesPerTeam(6, { custom: true, gamesPerTeam: 0 })).toBe(3);
    expect(defaultGamesPerTeam(2, { custom: false, gamesPerTeam: 0 })).toBe(1);
  });

  it('checks teams, then dates, then the custom number, with the old messages', () => {
    const ok = { teams: 4, days: 1, custom: false, gamesPerTeam: 0 };
    expect(roundRobinProblem(ok)).toBeNull();
    expect(roundRobinProblem({ ...ok, teams: 1, days: 0 })).toBe('This division needs at least 2 teams.');
    expect(roundRobinProblem({ ...ok, days: 0 })).toBe('Select at least one event date first.');
    expect(roundRobinProblem({ ...ok, custom: true, gamesPerTeam: 0 })).toBe(ENTER_GAMES);
    expect(roundRobinProblem({ ...ok, custom: true, gamesPerTeam: 1.5 })).toBe(ENTER_GAMES);
    expect(roundRobinProblem({ ...ok, custom: true, gamesPerTeam: Number.NaN })).toBe(ENTER_GAMES);
    expect(roundRobinProblem({ ...ok, custom: true, gamesPerTeam: 3 })).toBeNull();
    expect(roundRobinProblem({ ...ok, custom: true, gamesPerTeam: 4 })).toBe(
      'With 4 teams each team can play at most 3 games without a repeat matchup.',
    );
    expect(roundRobinProblem({ teams: 2, days: 1, custom: true, gamesPerTeam: 2 })).toBe(
      'With 2 teams each team can play at most 1 game without a repeat matchup.',
    );
  });

  it('caps the custom number at the stored limit of 20, even for 22 or more teams', () => {
    expect(maxCustomGames(4)).toBe(3);
    expect(maxCustomGames(22)).toBe(20);
    expect(roundRobinProblem({ teams: 22, days: 1, custom: true, gamesPerTeam: 20 })).toBeNull();
    expect(roundRobinProblem({ teams: 22, days: 1, custom: true, gamesPerTeam: 21 })).toBe(
      'Custom games per team can be at most 20. Leave the box unticked for a full round robin.',
    );
  });
});

describe('playoff dialog checks (E-64)', () => {
  it('defaults to min(N, 4) teams and allows 2 to N', () => {
    expect(defaultPlayoffTeams(3)).toBe(3);
    expect(defaultPlayoffTeams(9)).toBe(4);
    expect(playoffProblem(1, 2)).toBe('Need at least 2 teams.');
    expect(playoffProblem(6, 1)).toBe('Choose between 2 and 6 teams.');
    expect(playoffProblem(6, 7)).toBe('Choose between 2 and 6 teams.');
    expect(playoffProblem(6, 2.5)).toBe('Choose between 2 and 6 teams.');
    expect(playoffProblem(6, 6)).toBeNull();
  });
});

describe('addition results', () => {
  const r = (added: number, unscheduled = 0, moved = 0) => ({ added, unscheduled, moved });
  it('reports games added and any sent to Unscheduled', () => {
    expect(additionMessage('round-robin', r(3))).toBe('3 games added.');
    expect(additionMessage('round-robin', r(1, 1))).toBe(
      '1 game added. 1 could not fit and is in the Unscheduled row.',
    );
    expect(additionMessage('round-robin', r(4, 2))).toBe(
      '4 games added. 2 could not fit and are in the Unscheduled row.',
    );
    expect(additionMessage('round-robin', r(0))).toBe(
      'No new games to add. Every matchup for this division is already on the schedule.',
    );
    expect(additionMessage('playoff', r(3))).toBe('3 playoff games added!');
    expect(additionMessage('playoff', r(1, 1))).toBe(
      '1 playoff game added! 1 could not fit and is in the Unscheduled row.',
    );
  });
  it('says when existing games no longer fit and were moved first (E-14)', () => {
    expect(additionMessage('playoff', r(3, 0, 1))).toBe(
      "3 playoff games added! 1 game moved to Unscheduled because it no longer fits the event's days, hours or courts.",
    );
    expect(additionMessage('round-robin', r(0, 0, 2))).toBe(
      "No new games to add. Every matchup for this division is already on the schedule. 2 games moved to Unscheduled because they no longer fit the event's days, hours or courts.",
    );
  });
});
