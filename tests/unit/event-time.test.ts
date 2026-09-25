import { describe, expect, it } from 'vitest';

import { clockInZone, minutesToTime } from '@/lib/event-time';

describe('clockInZone (PRD M-08: the event time zone decides the day)', () => {
  // 25/09/2026 02:40 UTC is still 24/09 19:40 in Vancouver and 25/09 14:40 in Auckland.
  const instant = new Date('2026-09-25T02:40:00Z');

  it('reads the wall clock in the event time zone', () => {
    expect(clockInZone(instant, 'America/Vancouver')).toEqual({ date: '2026-09-24', minutes: 19 * 60 + 40 });
    expect(clockInZone(instant, 'Pacific/Auckland')).toEqual({ date: '2026-09-25', minutes: 14 * 60 + 40 });
  });

  it('reports midnight as 0 minutes, not 24:00', () => {
    expect(clockInZone(new Date('2026-09-25T07:00:00Z'), 'America/Vancouver')).toEqual({
      date: '2026-09-25',
      minutes: 0,
    });
  });
});

describe('minutesToTime', () => {
  it.each([
    [0, '00:00'],
    [1180, '19:40'],
    [1439, '23:59'],
  ])('%i -> %s', (input, expected) => {
    expect(minutesToTime(input)).toBe(expected);
  });
});
