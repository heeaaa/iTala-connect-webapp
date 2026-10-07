import { describe, expect, it } from 'vitest';

import { sideManifests, withoutOptionalStats } from '@/features/reports/coverage';
import type { ReportEvent } from '@/features/reports/model';

const game = (o: Record<string, unknown> = {}) => ({
  id: 'mg1',
  league_id: 'L',
  home_team_id: 'mh',
  away_team_id: 'ma',
  status: 'final' as const,
  default_winner_team_id: null,
  ...o,
});
const teams = [
  { id: 'mh', league_id: 'L', team_only: false, player_ids: ['p1', 'p2', 'p3'] },
  { id: 'ma', league_id: 'L', team_only: false, player_ids: ['q1', 'q2'] },
];
const sides = [
  { teamId: 'home', mobileTeamId: 'mh' },
  { teamId: 'away', mobileTeamId: 'ma' },
];
const events: ReportEvent[] = [
  { id: 'e1', teamId: 'home', playerId: 'p1', type: 'fg2_make' },
  { id: 'e2', teamId: 'home', playerId: 'p9', type: 'ast' },
  { id: 'e3', teamId: 'away', playerId: null, type: 'ft_make' },
];

describe('what a mobile game tracked (safe set, 07/10/2026)', () => {
  it('counts the always-on categories, and misses and turnovers only from the game itself', () => {
    const [home, away] = sideManifests(game({ track_misses: true, track_turnovers: false }), teams, sides, events);
    expect(home).toEqual({
      teamId: 'home',
      scoring: 'complete',
      shots: { fg2: 'complete', fg3: 'complete', ft: 'complete' },
      turnovers: 'not-tracked',
      other: { rebounds: 'complete', assists: 'complete', steals: 'complete', blocks: 'complete', fouls: 'complete' },
      appearances: 'unknown',
      playerIds: ['p1', 'p9'],
      eventCount: 2,
    });
    expect(away).toMatchObject({ teamId: 'away', eventCount: 1, playerIds: [] });
    // A game that followed its league does not say what it tracked then.
    const [league] = sideManifests(game({ track_misses: null }), teams, sides, events);
    expect(league).toMatchObject({ shots: { fg2: 'unknown', fg3: 'unknown', ft: 'unknown' }, turnovers: 'unknown' });
  });

  it('confirms appearances from attendance, kept to each team, plus anyone with an event', () => {
    const [home, away] = sideManifests(game({ attendance: ['p2', 'q1', 'zz'] }), teams, sides, events);
    expect(home).toMatchObject({ appearances: 'confirmed', playerIds: ['p2', 'p1', 'p9'] });
    expect(away).toMatchObject({ appearances: 'confirmed', playerIds: ['q1'] });
  });

  it('leaves a team scored as a team only without player categories', () => {
    const teamOnly = [teams[0]!, { ...teams[1]!, team_only: true }];
    const [, away] = sideManifests(game({ track_misses: true, attendance: ['q1'] }), teamOnly, sides, events);
    expect(away).toEqual({
      teamId: 'away',
      scoring: 'complete',
      shots: { fg2: 'unknown', fg3: 'unknown', ft: 'unknown' },
      turnovers: 'unknown',
      appearances: 'unknown',
      playerIds: [],
      eventCount: 1,
    });
  });

  it('says nothing when the reply does not describe both teams (an older reader)', () => {
    expect(sideManifests(game({ track_misses: true }), [], sides, events)).toEqual([]);
    expect(sideManifests(game(), [teams[0]!], sides, events)).toEqual([]);
  });

  it('drops the optional categories when "Show all player stats" is not ticked', () => {
    const manifests = sideManifests(
      game({ track_misses: true, track_turnovers: true, attendance: ['p2'] }),
      teams,
      sides,
      events,
    );
    const plain = withoutOptionalStats(manifests);
    expect(plain[0]).toEqual({
      teamId: 'home',
      scoring: 'complete',
      shots: { fg2: 'unknown', fg3: 'unknown', ft: 'unknown' },
      turnovers: 'unknown',
      appearances: 'confirmed',
      playerIds: ['p2', 'p1', 'p9'],
      eventCount: 2,
    });
    expect('other' in plain[0]!).toBe(false);
    // The originals are left as they were.
    expect(manifests[0]!.other?.rebounds).toBe('complete');
  });
});
