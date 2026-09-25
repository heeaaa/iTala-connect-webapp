/**
 * Display formatting (X-07): dates DD/MM/YYYY, times "9:00 am".
 * Inputs are the database's ISO forms: dates "YYYY-MM-DD", times "HH:MM[:SS]".
 * Pure string maths, so no time zone can shift a calendar date.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_TIME = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

export function formatDate(isoDate: string): string {
  const m = ISO_DATE.exec(isoDate);
  if (!m) throw new RangeError(`Not an ISO date: ${isoDate}`);
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function formatTime(isoTime: string): string {
  const m = ISO_TIME.exec(isoTime);
  if (!m) throw new RangeError(`Not an ISO time: ${isoTime}`);
  const hours = Number(m[1]);
  const minutes = m[2];
  if (hours > 23 || Number(minutes) > 59) throw new RangeError(`Not an ISO time: ${isoTime}`);
  const suffix = hours < 12 ? 'am' : 'pm';
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${h12}:${minutes} ${suffix}`;
}
