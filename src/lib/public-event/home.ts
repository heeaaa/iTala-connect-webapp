import { clockInZone } from '@/lib/event-time';

import { imageUrl } from './model';

/** Home (PRD H-01 to H-05): published events as cards. */
export interface HomeEventRow {
  id: string;
  name: string;
  schedule_days: string[];
  timezone: string;
  logo_path: string | null;
  divisions: { count: number }[];
}

export type HomeWhen = 'current' | 'upcoming' | 'past' | 'undated';

export interface HomeCard {
  id: string;
  name: string;
  logoUrl: string | null;
  divisionCount: number;
  firstDay: string | null;
  lastDay: string | null;
  when: HomeWhen;
}

const RANK: Record<HomeWhen, number> = { current: 0, upcoming: 0, past: 1, undated: 2 };

/**
 * H-04: current and upcoming events first, by first day; then past events,
 * most recent first; then events without dates. "Today" is each event's
 * own time zone.
 */
export function toHomeCards(rows: readonly HomeEventRow[], supabaseUrl: string, now: Date): HomeCard[] {
  const cards = rows.map((r): HomeCard => {
    const days = [...r.schedule_days].sort();
    const firstDay = days[0] ?? null;
    const lastDay = days.at(-1) ?? null;
    let when: HomeWhen = 'undated';
    if (firstDay && lastDay) {
      const today = clockInZone(now, r.timezone).date;
      when = lastDay < today ? 'past' : firstDay <= today ? 'current' : 'upcoming';
    }
    return {
      id: r.id,
      name: r.name,
      logoUrl: imageUrl(supabaseUrl, r.logo_path),
      divisionCount: r.divisions[0]?.count ?? 0,
      firstDay,
      lastDay,
      when,
    };
  });
  return cards.sort((a, b) => {
    const rank = RANK[a.when] - RANK[b.when];
    if (rank !== 0) return rank;
    if (a.when === 'past') return b.lastDay!.localeCompare(a.lastDay!);
    if (a.when === 'undated') return a.name.localeCompare(b.name);
    return a.firstDay!.localeCompare(b.firstDay!);
  });
}

export function divisionsLabel(count: number): string {
  return `${count} ${count === 1 ? 'division' : 'divisions'}`;
}
