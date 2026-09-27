import { describe, expect, it } from 'vitest';
import { rosterNote, sameRoster, sortRoster, type RosterPlayer } from '@/lib/mobile-rosters';

/* Compare rosters (PRD M-11): the order of each list and what counts as the same. */

const p = (number: string, name: string): RosterPlayer => ({ number, name });

describe('sorting a roster', () => {
  it('orders jersey numbers as numbers, then other numbers, then none, and names within a number', () => {
    const sorted = sortRoster([
      p('', 'Zed'),
      p('10', 'Kai'),
      p('12A', 'Mo'),
      p('4', 'Ben'),
      p('00', 'Rua'),
      p('0', 'Tui'),
      p('4', 'Ana'),
      p('', 'amy'),
      p('B7', 'Lee'),
      p('07', 'Sam'),
    ]);
    expect(sorted.map((x) => `${x.number || '-'} ${x.name}`)).toEqual([
      '0 Tui',
      '00 Rua',
      '4 Ana',
      '4 Ben',
      '07 Sam',
      '10 Kai',
      '12A Mo',
      'B7 Lee',
      '- amy',
      '- Zed',
    ]);
  });

  it('keeps extra fields and never changes the list it is given', () => {
    const list = [
      { number: '9', name: 'B', id: 'x' },
      { number: '1', name: 'A', id: 'y' },
    ];
    expect(sortRoster(list).map((x) => x.id)).toEqual(['y', 'x']);
    expect(list.map((x) => x.id)).toEqual(['x', 'y']);
  });
});

describe('comparing two rosters', () => {
  it('finds them the same whatever the order, letter case or spacing', () => {
    expect(sameRoster([p('7', 'Bea Smith'), p('04', 'Ari')], [p('04', ' ari '), p(' 7', 'bea  SMITH')])).toBe(true);
    expect(sameRoster([], [])).toBe(true);
  });

  it('finds a different number, name, player or count, and keeps "0", "00" and "04" apart', () => {
    expect(sameRoster([p('7', 'Bea')], [p('8', 'Bea')])).toBe(false);
    expect(sameRoster([p('7', 'Bea')], [p('7', 'Bee')])).toBe(false);
    expect(sameRoster([p('0', 'Tui')], [p('00', 'Tui')])).toBe(false);
    expect(sameRoster([p('4', 'Ari')], [p('04', 'Ari')])).toBe(false);
    expect(sameRoster([p('7', 'Bea')], [p('7', 'Bea'), p('9', 'Cai')])).toBe(false);
    // Same count but one player twice on one side.
    expect(sameRoster([p('7', 'Bea'), p('7', 'Bea')], [p('7', 'Bea'), p('9', 'Cai')])).toBe(false);
  });

  it('says so in one note', () => {
    expect(rosterNote([p('7', 'Bea')], [p('7', 'bea')])).toBe('Same in both (1 player)');
    expect(rosterNote([p('7', 'Bea'), p('4', 'Ari')], [p('4', 'Ari'), p('7', 'Bea')])).toBe('Same in both (2 players)');
    expect(rosterNote([], [])).toBe('Same in both (no players)');
    expect(rosterNote([p('7', 'Bea'), p('4', 'Ari')], [p('7', 'Bea')])).toBe(
      'The lists differ (2 in iTala Connect, 1 in the mobile app)',
    );
  });
});
