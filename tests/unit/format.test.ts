import { describe, expect, it } from 'vitest';

import { formatDate, formatDayLabel, formatTime } from '@/lib/format';

describe('formatDayLabel', () => {
  it.each([
    ['2026-09-25', 'Fri 25/09/2026'],
    ['2026-09-27', 'Sun 27/09/2026'],
    ['2027-01-02', 'Sat 02/01/2027'],
  ])('%s -> %s', (input, expected) => {
    expect(formatDayLabel(input)).toBe(expected);
  });

  it('rejects non-ISO input', () => {
    expect(() => formatDayLabel('25/09/2026')).toThrow(RangeError);
  });
});

describe('formatDate (X-07: DD/MM/YYYY)', () => {
  it.each([
    ['2026-09-25', '25/09/2026'],
    ['2027-01-03', '03/01/2027'],
  ])('%s -> %s', (input, expected) => {
    expect(formatDate(input)).toBe(expected);
  });

  it('rejects anything that is not an ISO date', () => {
    expect(() => formatDate('25/09/2026')).toThrow(RangeError);
    expect(() => formatDate('')).toThrow(RangeError);
  });
});

describe('formatTime (X-07: "9:00 am")', () => {
  it.each([
    ['00:00', '12:00 am'],
    ['09:00', '9:00 am'],
    ['11:59:00', '11:59 am'],
    ['12:00', '12:00 pm'],
    ['13:30', '1:30 pm'],
    ['23:05:00', '11:05 pm'],
  ])('%s -> %s', (input, expected) => {
    expect(formatTime(input)).toBe(expected);
  });

  it('rejects out-of-range or malformed times', () => {
    expect(() => formatTime('24:00')).toThrow(RangeError);
    expect(() => formatTime('12:60')).toThrow(RangeError);
    expect(() => formatTime('9:00 AM')).toThrow(RangeError);
  });
});
