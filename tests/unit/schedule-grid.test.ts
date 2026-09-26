import { describe, expect, it } from 'vitest';
import { type Game } from '@/domain/types';
import { playoffColour } from '@/lib/color';
import {
  applyDrop,
  editorGrid,
  nextTarget,
  ownTarget,
  planDrop,
  slotKey,
  targetId,
  type DropTarget,
} from '@/lib/schedule-grid';

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

const at = (id: string, day: string | null, time: string | null, court: number | null) => ({
  ...game(day, time, court),
  id,
});

describe('drag and drop plans (E-45)', () => {
  const games = [
    at('a', '2026-10-03', '09:00', 1),
    at('b', '2026-10-03', '10:00', 2),
    at('u', null, null, null),
    at('v', null, null, null),
  ];
  const grid = editorGrid({ days: ['2026-10-03'], timeStart: '09:00', timeEnd: '11:00', courts: 2 }, games);
  const slot = (time: string, court: number): DropTarget => ({ kind: 'slot', day: '2026-10-03', time, court });

  it('swaps with a game, moves to an empty cell and unschedules on the Unscheduled row', () => {
    expect(planDrop(grid, games, 'a', slot('10:00', 2))).toEqual({ kind: 'swap', game: games[0], other: games[1] });
    expect(planDrop(grid, games, 'a', slot('10:00', 1))).toEqual({
      kind: 'move',
      game: games[0],
      day: '2026-10-03',
      time: '10:00',
      court: 1,
    });
    expect(planDrop(grid, games, 'a', { kind: 'unscheduled' })).toEqual({ kind: 'unschedule', game: games[0] });
  });

  it('swaps an unscheduled game with a scheduled one either way round', () => {
    expect(planDrop(grid, games, 'u', slot('09:00', 1))).toEqual({ kind: 'swap', game: games[2], other: games[0] });
    expect(planDrop(grid, games, 'a', { kind: 'game', id: 'u' })).toEqual({
      kind: 'swap',
      game: games[0],
      other: games[2],
    });
    expect(planDrop(grid, games, 'u', slot('10:00', 1))).toMatchObject({ kind: 'move', time: '10:00', court: 1 });
  });

  it('does nothing on its own slot, between two unscheduled games, or without a target', () => {
    expect(planDrop(grid, games, 'a', slot('09:00', 1))).toBeNull();
    expect(planDrop(grid, games, 'u', { kind: 'game', id: 'u' })).toBeNull();
    expect(planDrop(grid, games, 'u', { kind: 'game', id: 'v' })).toBeNull();
    expect(planDrop(grid, games, 'u', { kind: 'unscheduled' })).toBeNull();
    expect(planDrop(grid, games, 'a', { kind: 'game', id: 'gone' })).toBeNull();
    expect(planDrop(grid, games, 'a', null)).toBeNull();
    expect(planDrop(grid, games, 'missing', slot('10:00', 1))).toBeNull();
    // A day with no games yet is still a free slot.
    expect(planDrop(grid, games, 'a', { kind: 'slot', day: '2026-12-25', time: '09:00', court: 1 })).toMatchObject({
      kind: 'move',
    });
  });

  it('applies each plan to the schedule for the optimistic grid', () => {
    const swap = applyDrop(games, planDrop(grid, games, 'a', slot('10:00', 2))!);
    expect(swap.map((g) => [g.id, g.time, g.court])).toEqual([
      ['a', '10:00', 2],
      ['b', '09:00', 1],
      ['u', null, null],
      ['v', null, null],
    ]);
    const moved = applyDrop(games, planDrop(grid, games, 'u', slot('10:00', 1))!);
    expect(moved[2]).toMatchObject({ day: '2026-10-03', time: '10:00', court: 1 });
    const cleared = applyDrop(games, planDrop(grid, games, 'b', { kind: 'unscheduled' })!);
    expect(cleared[1]).toMatchObject({ day: null, time: null, court: null });
    expect(cleared[0]).toBe(games[0]);
  });

  it('names targets uniquely and starts a keyboard move from the game itself', () => {
    expect(targetId(slot('09:00', 2))).toBe('slot:2026-10-03|09:00|2');
    expect(targetId({ kind: 'game', id: 'u' })).toBe('game:u');
    expect(targetId({ kind: 'unscheduled' })).toBe('unscheduled');
    expect(ownTarget(games[1]!)).toEqual(slot('10:00', 2));
    expect(ownTarget({ ...games[1]!, court: null })).toEqual(slot('10:00', 1));
    expect(ownTarget(games[2]!)).toEqual({ kind: 'game', id: 'u' });
  });
});

describe('keyboard moves through the grid (E-45)', () => {
  const games = [at('a', '2026-10-03', '09:00', 1), at('u', null, null, null), at('v', null, null, null)];
  const grid = editorGrid(
    { days: ['2026-10-03', '2026-10-10'], timeStart: '09:00', timeEnd: '11:00', courts: 3 },
    games,
  );
  const slot = (day: string, time: string, court: number): DropTarget => ({ kind: 'slot', day, time, court });
  const walk = (from: DropTarget, ...moves: ('up' | 'down' | 'left' | 'right')[]) =>
    moves.reduce((t, m) => nextTarget(grid, t, m), from);

  it('steps across courts and stops at the edges', () => {
    expect(walk(slot('2026-10-03', '09:00', 1), 'right')).toEqual(slot('2026-10-03', '09:00', 2));
    expect(walk(slot('2026-10-03', '09:00', 1), 'right', 'right', 'right')).toEqual(slot('2026-10-03', '09:00', 3));
    expect(walk(slot('2026-10-03', '09:00', 2), 'left', 'left')).toEqual(slot('2026-10-03', '09:00', 1));
  });

  it('steps through the times and on into the next and previous day', () => {
    expect(walk(slot('2026-10-03', '09:00', 2), 'down')).toEqual(slot('2026-10-03', '10:00', 2));
    expect(walk(slot('2026-10-03', '10:00', 2), 'down')).toEqual(slot('2026-10-10', '09:00', 2));
    expect(walk(slot('2026-10-10', '10:00', 2), 'down')).toEqual(slot('2026-10-10', '10:00', 2));
    expect(walk(slot('2026-10-10', '09:00', 3), 'up')).toEqual(slot('2026-10-03', '10:00', 3));
    expect(walk(slot('2026-10-03', '10:00', 3), 'up')).toEqual(slot('2026-10-03', '09:00', 3));
  });

  it('goes up from the first row into the Unscheduled row and through its games', () => {
    expect(walk(slot('2026-10-03', '09:00', 2), 'up')).toEqual({ kind: 'unscheduled' });
    expect(walk({ kind: 'unscheduled' }, 'right')).toEqual({ kind: 'game', id: 'u' });
    expect(walk({ kind: 'unscheduled' }, 'right', 'right', 'right')).toEqual({ kind: 'game', id: 'v' });
    expect(walk({ kind: 'game', id: 'v' }, 'left', 'left', 'left')).toEqual({ kind: 'unscheduled' });
    expect(walk({ kind: 'game', id: 'u' }, 'up')).toEqual({ kind: 'game', id: 'u' });
    expect(walk({ kind: 'game', id: 'v' }, 'down')).toEqual(slot('2026-10-03', '09:00', 1));
  });

  it('recovers from a stale starting point and copes with no grid rows', () => {
    expect(walk(slot('2026-12-25', '09:00', 1), 'down')).toEqual(slot('2026-10-03', '09:00', 1));
    expect(walk({ kind: 'game', id: 'gone' }, 'right')).toEqual({ kind: 'game', id: 'u' });
    const empty = editorGrid({ days: ['2026-10-03'], timeStart: '09:00', timeEnd: '09:00', courts: 2 }, [games[1]!]);
    expect(nextTarget(empty, { kind: 'unscheduled' }, 'down')).toEqual({ kind: 'unscheduled' });
  });
});
