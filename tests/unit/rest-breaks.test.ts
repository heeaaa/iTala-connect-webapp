import { describe, expect, it } from 'vitest';
import { restBreaks } from '@/domain/schedule-edit';

type G = { id: string; day: string | null; time: string | null; team1Id: string | null; team2Id: string | null };
const g = (id: string, day: string | null, time: string | null, team1Id: string | null, team2Id: string | null): G => ({
  id,
  day,
  time,
  team1Id,
  team2Id,
});
const move = (games: G[], id: string, day: string | null, time: string | null) =>
  games.map((x) => (x.id === id ? { ...x, day, time } : x));

const SAT = '2026-10-03';
const SUN = '2026-10-04';

describe('restBreaks (E-45 rest warning)', () => {
  const base = [
    g('a', SAT, '09:00', 'hawks', 'owls'),
    g('b', SAT, '13:00', 'hawks', 'kea'),
    g('c', SAT, '13:00', 'owls', 'tui'),
  ];

  it('reports a team whose moved game now sits under 120 minutes from its other game', () => {
    const after = move(base, 'b', SAT, '10:00');
    expect(restBreaks(base, after, ['b'])).toEqual([{ teamId: 'hawks', day: SAT, times: ['09:00', '10:00'] }]);
  });

  it('orders the two times earlier first whichever game moved', () => {
    const after = move(base, 'a', SAT, '14:00');
    expect(restBreaks(base, after, ['a'])).toEqual([
      { teamId: 'hawks', day: SAT, times: ['13:00', '14:00'] },
      { teamId: 'owls', day: SAT, times: ['13:00', '14:00'] },
    ]);
  });

  it('allows exactly 120 minutes, other days and other teams', () => {
    expect(restBreaks(base, move(base, 'b', SAT, '11:00'), ['b'])).toEqual([]);
    expect(restBreaks(base, move(base, 'b', SUN, '09:00'), ['b'])).toEqual([]);
    const strangers = [g('a', SAT, '09:00', 'hawks', 'owls'), g('d', SAT, '12:00', 'kea', 'tui')];
    expect(restBreaks(strangers, move(strangers, 'd', SAT, '09:30'), ['d'])).toEqual([]);
  });

  it('leaves out gaps that were already short before the move, and unscheduled or TBD games', () => {
    const tight = [g('a', SAT, '09:00', 'hawks', 'owls'), g('b', SAT, '10:00', 'hawks', 'kea')];
    // Moving within a gap that was already short is not a new warning.
    expect(restBreaks(tight, move(tight, 'b', SAT, '10:30'), ['b'])).toEqual([]);
    expect(restBreaks(tight, move(tight, 'b', null, null), ['b'])).toEqual([]);
    const tbd = [g('a', SAT, '09:00', null, null), g('p', SAT, '13:00', null, 'hawks')];
    expect(restBreaks(tbd, move(tbd, 'p', SAT, '09:00'), ['p'])).toEqual([]);
  });

  it('counts a swap once per pair and sorts by day, time, then team', () => {
    const games = [
      g('a', SAT, '09:00', 'hawks', 'owls'),
      g('b', SAT, '15:00', 'hawks', 'kea'),
      g('c', SUN, '09:00', 'tui', 'kea'),
      g('d', SUN, '15:00', 'tui', 'ruru'),
      g('e', SAT, '10:00', 'kaka', 'moa'),
    ];
    // Swap a and e (Sat 9:00 and 10:00) is harmless; then pull b and d up next to them.
    const after = move(move(games, 'b', SAT, '10:30'), 'd', SUN, '10:00');
    expect(restBreaks(games, after, ['b', 'd'])).toEqual([
      { teamId: 'hawks', day: SAT, times: ['09:00', '10:30'] },
      { teamId: 'tui', day: SUN, times: ['09:00', '10:00'] },
    ]);
    const swapped = games.map((x) =>
      x.id === 'a' ? { ...x, time: '10:00' } : x.id === 'e' ? { ...x, time: '09:00' } : x,
    );
    expect(restBreaks(games, swapped, ['a', 'e'])).toEqual([]);
    const both = [g('x', SAT, '09:00', 'hawks', 'owls'), g('y', SAT, '12:00', 'owls', 'hawks')];
    expect(restBreaks(both, move(both, 'y', SAT, '10:00'), ['x', 'y'])).toEqual([
      { teamId: 'hawks', day: SAT, times: ['09:00', '10:00'] },
      { teamId: 'owls', day: SAT, times: ['09:00', '10:00'] },
    ]);
  });
});
