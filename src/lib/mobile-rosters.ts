/**
 * Compare rosters (PRD M-11), read only: a team's iTala Connect players and
 * its paired mobile team's players, as two lists. Pure, so the page and the
 * tests agree on the order and on what counts as "the same".
 */

export interface RosterPlayer {
  number: string;
  name: string;
}

/** Jersey numbers in number order ("4" before "10"), then others such as "12A", then none. */
function numberKey(number: string): [group: number, value: number, text: string] {
  const t = number.trim();
  if (t === '') return [2, 0, ''];
  if (/^\d+$/.test(t)) return [0, Number(t), t];
  return [1, 0, t.toLowerCase()];
}

const collator = new Intl.Collator('en-NZ', { sensitivity: 'base', numeric: true });

/** A roster by jersey number, then name. "0" comes before "00", which stay two numbers. */
export function sortRoster<P extends RosterPlayer>(players: readonly P[]): P[] {
  return [...players].sort((a, b) => {
    const [ga, va, ta] = numberKey(a.number);
    const [gb, vb, tb] = numberKey(b.number);
    // Among plain numbers of equal value, the shorter first ("0" before "00", "4" before "04").
    const shorter = ga === 0 ? ta.length - tb.length : 0;
    return ga - gb || va - vb || shorter || collator.compare(ta, tb) || collator.compare(a.name, b.name);
  });
}

/** A player as the comparison sees them: the number as written, the name without case or extra spaces. */
const key = (p: RosterPlayer) =>
  `${p.number.trim()}\u0000${p.name.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim()}`;

/** Whether two rosters hold the same players (in any order). */
export function sameRoster(a: readonly RosterPlayer[], b: readonly RosterPlayer[]): boolean {
  if (a.length !== b.length) return false;
  const left = a.map(key).sort();
  const right = b.map(key).sort();
  return left.every((k, i) => k === right[i]);
}

const players = (n: number) => `${n} ${n === 1 ? 'player' : 'players'}`;

/** The one note shown for a team. */
export function rosterNote(connect: readonly RosterPlayer[], mobile: readonly RosterPlayer[]): string {
  if (sameRoster(connect, mobile))
    return connect.length ? `Same in both (${players(connect.length)})` : 'Same in both (no players)';
  return `The lists differ (${connect.length} in iTala Connect, ${mobile.length} in the mobile app)`;
}
