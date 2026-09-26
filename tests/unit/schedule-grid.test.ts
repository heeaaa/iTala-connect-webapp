import { describe, expect, it } from 'vitest';
import { type Game } from '@/domain/types';
import { playoffColour } from '@/lib/color';
import { editorGrid, slotKey } from '@/lib/schedule-grid';

const game = (day: string | null, time: string | null, court: number | null): Game => ({
  day,
  time,
  court,
  divisionId: 'd',
  groupId: null,
  team1Id: null,
  team2Id: null,
  label: '',
  type: 'group',
  score1: null,
  score2: null,
});

describe('editorGrid (E-40, E-41)', () => {
  const event = { days: ['2026-10-10', '2026-10-03'], timeStart: '09:00', timeEnd: '11:30', courts: 2 };
  it('lists every hourly slot per day, honouring end minutes', () => {
    const grid = editorGrid(event, []);
    expect(grid.days.map((d) => [d.day, d.times])).toEqual([
      ['2026-10-03', ['09:00', '10:00', '11:00']],
      ['2026-10-10', ['09:00', '10:00', '11:00']],
    ]);
    expect(grid.courts).toBe(2);
    expect(grid.unscheduled).toEqual([]);
  });
  it('adds off-grid times, days and courts that games already use, and parks unscheduled games', () => {
    const offGrid = game('2026-10-03', '12:30', 1);
    const extraDay = game('2026-10-17', '09:00', 3);
    const parked = game(null, null, null);
    const noTime = game('2026-10-03', null, 1);
    const grid = editorGrid(event, [offGrid, extraDay, parked, noTime]);
    expect(grid.days.map((d) => d.day)).toEqual(['2026-10-03', '2026-10-10', '2026-10-17']);
    expect(grid.days[0]!.times).toEqual(['09:00', '10:00', '11:00', '12:30']);
    expect(grid.days[0]!.slots.get(slotKey('12:30', 1))).toBe(offGrid);
    expect(grid.days[2]!.times).toEqual(['09:00']);
    expect(grid.courts).toBe(3);
    expect(grid.unscheduled).toEqual([parked, noTime]);
  });
  it('treats a missing court as court 1 and a zero court count as one court', () => {
    const g = game('2026-10-03', '09:00', null);
    const grid = editorGrid({ ...event, days: ['2026-10-03', '2026-10-03'], courts: 0 }, [g]);
    expect(grid.days).toHaveLength(1);
    expect(grid.courts).toBe(1);
    expect(grid.days[0]!.slots.get(slotKey('09:00', 1))).toBe(g);
  });
});

describe('playoffColour (E-43)', () => {
  it('shifts the division colour warm as the old code did, but as valid hex', () => {
    expect(playoffColour('#6C63FF')).toBe('#A88BEB');
    expect(playoffColour('#F0F0F0')).toBe('#FFFFDC');
    expect(playoffColour('#000010')).toBe('#3C2800');
    expect(playoffColour('#000000')).toMatch(/^#[0-9A-F]{6}$/);
  });
  it('falls back to the old grey for a missing colour instead of NaN', () => {
    expect(playoffColour('')).toBe('#C4B074');
  });
});
