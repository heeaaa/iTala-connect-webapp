/**
 * Reading a Firebase Realtime Database JSON export (MIGRATION_PLAN.md 12.1).
 * Pure. Firebase drops nulls and empty children, and returns a list as an
 * array or an object depending on how full it is, so every reader here
 * accepts either and treats a missing value as empty.
 */

export type Tree = Record<string, unknown>;

export function isRecord(value: unknown): value is Tree {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const INT_KEY = /^-?(0|[1-9]\d*)$/;
/** Firebase sorts keys that read as 32-bit integers by number, before the rest. */
const isIntKey = (key: string) => INT_KEY.test(key) && Math.abs(Number(key)) <= 2 ** 31 - 1;
/** JavaScript lists whole-number keys up to 2^32 - 2 first, in number order, whatever order they came in. */
const isArrayIndex = (key: string) => /^(0|[1-9]\d*)$/.test(key) && Number(key) <= 2 ** 32 - 2;

/**
 * The key order the old app's Object.keys loops saw: the Firebase SDK builds
 * each object in Firebase order (32-bit integer keys by number, then the
 * rest as text), and JavaScript then lists whole-number keys first. This
 * order decided group splits, pairings and standings ties.
 */
export function firebaseKeyCompare(a: string, b: string): number {
  const ax = isArrayIndex(a);
  const bx = isArrayIndex(b);
  if (ax && bx) return Number(a) - Number(b);
  if (ax !== bx) return ax ? -1 : 1;
  const ai = isIntKey(a);
  const bi = isIntKey(b);
  if (ai && bi) return Number(a) - Number(b);
  if (ai !== bi) return ai ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** A node's children in that order, skipping nulls (Firebase stores none). */
export function entries(value: unknown): [string, unknown][] {
  let pairs: [string, unknown][];
  if (Array.isArray(value)) pairs = value.map((v, i) => [String(i), v]);
  else if (isRecord(value)) pairs = Object.entries(value);
  else return [];
  return pairs.filter(([, v]) => v !== null && v !== undefined).sort(([a], [b]) => firebaseKeyCompare(a, b));
}

/** A list stored as an array or an object, in that order. */
export function values(value: unknown): unknown[] {
  return entries(value).map(([, v]) => v);
}

/** A child by key, whether the node is an array or an object. */
export function child(value: unknown, key: string | number): unknown {
  if (Array.isArray(value)) return typeof key === 'number' || isArrayIndex(key) ? value[Number(key)] : undefined;
  return isRecord(value) ? value[String(key)] : undefined;
}

/** Text as stored; a broken character (a lone surrogate) becomes U+FFFD, which Postgres can store. */
export const text = (value: unknown): string =>
  typeof value === 'string' ? value.toWellFormed() : typeof value === 'number' ? String(value) : '';

/**
 * A copy of a node rebuilt in that order, so old code that loops with
 * Object.keys sees what it saw in the browser. Arrays stay arrays.
 */
export function inFirebaseOrder(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(inFirebaseOrder);
  if (!isRecord(value)) return value;
  return Object.fromEntries(entries(value).map(([k, v]) => [k, inFirebaseOrder(v)]));
}

const PUSH_CHARS = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';

/**
 * When a Firebase push id was made: its first 8 characters are the
 * creation time in milliseconds. Null for any other kind of key, or a time
 * outside 2015 to 2100.
 */
export function pushIdTime(key: string): Date | null {
  if (key.length !== 20) return null;
  let ms = 0;
  for (const ch of key.slice(0, 8)) {
    const i = PUSH_CHARS.indexOf(ch);
    if (i < 0) return null;
    ms = ms * 64 + i;
  }
  return ms >= Date.UTC(2015, 0, 1) && ms < Date.UTC(2100, 0, 1) ? new Date(ms) : null;
}
