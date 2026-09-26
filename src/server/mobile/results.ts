import 'server-only';
import { matchFinals, scoredGameIds, type ApprovedSource, type MatchResult } from '@/domain/mobile-matching';
import { resolveAllPlayoffs } from '@/domain/playoffs';
import type { Game } from '@/domain/types';
import type { InboxFinal } from '@/lib/mobile-results';
import { gamesFromRows } from '@/lib/public-event/model';
import { createClient } from '@/lib/supabase/server';
import { mobileReader } from './reader';

const GAME_COLUMNS =
  'id, division_id, day, start_time, court, group_id, team1_id, team2_id, label, type, is_playoff, bracket_game_id, team1_source, team2_source, playoff_round, position';

export type InboxGame = Game & { id: string };

export interface InboxDivision {
  id: string;
  name: string;
  leagueName: string;
}

export interface InboxItem {
  divisionId: string;
  final: InboxFinal;
  result: MatchResult<InboxGame>;
  /** What was published, for a drifted result (M-05). */
  published: { s1: number | null; s2: number | null; eventCount: number | null } | null;
}

export interface Inbox {
  event: { id: string; name: string; timezone: string; courtNames: string[] };
  divisions: InboxDivision[];
  teamNames: Record<string, string>;
  /** Stored games with scores merged and playoff teams resolved (M-09), in schedule order. */
  games: InboxGame[];
  /** Games that already hold a score: never offered for a result (M-07). */
  scored: string[];
  items: InboxItem[];
  /** Why nothing is shown or nothing can be approved (M-07 safety refusals). */
  notice: string | null;
  /** Divisions whose finished games could not be read from the mobile app. */
  errors: string[];
}

export const NOT_LINKED = 'No division in this event is linked to a mobile app league yet.';
export const SCORES_UNREADABLE =
  "Could not read this event's existing scores, so nothing can be approved safely. Refresh to try again.";

/**
 * The results inbox for one event (PRD M-04 to M-09). Connect data is read
 * through the organiser's session (RLS applies); finished games come from the
 * mobile app, one linked division at a time, through the read-only reader.
 * Matching is the ported matchFinals; nothing here writes anything.
 */
export async function loadInbox(eventId: string, nowMs = Date.now()): Promise<Inbox | null> {
  const db = await createClient();
  const { data: event, error } = await db
    .from('events')
    .select(
      `id, name, timezone, court_names, divisions(id, name, sort_order, created_at, teams(id, name, sort_order, created_at), division_mobile_links(league_id, league_name, division_mobile_team_links(team_id, mobile_team_id))), games(${GAME_COLUMNS})`,
    )
    .eq('id', eventId)
    .maybeSingle();
  if (error || !event) return null;

  const order = <T extends { sort_order: number; created_at: string }>(a: T, b: T) =>
    a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at);
  const divisions = [...event.divisions].sort(order);
  const teamNames: Record<string, string> = {};
  for (const d of divisions) for (const t of d.teams) teamNames[t.id] = t.name;

  const base: Omit<Inbox, 'games' | 'scored' | 'items' | 'notice' | 'errors'> = {
    event: { id: event.id, name: event.name, timezone: event.timezone, courtNames: event.court_names ?? [] },
    divisions: divisions
      .filter((d) => d.division_mobile_links)
      .map((d) => ({ id: d.id, name: d.name, leagueName: d.division_mobile_links!.league_name })),
    teamNames,
  };

  const ids = event.games.map((g) => g.id);
  const [scores, sources] = await Promise.all([
    db.from('game_scores').select('game_id, s1, s2').eq('event_id', eventId),
    ids.length
      ? db
          .from('score_sources')
          .select('game_id, mobile_game_id, s1, s2, home_pts, away_pts, event_count, last_event_at')
          .in('game_id', ids)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const plain = gamesFromRows(event.games);
  // Without knowing what is already scored, offering a result could overwrite one (M-07).
  if (scores.error || sources.error)
    return { ...base, games: plain, scored: [], items: [], notice: SCORES_UNREADABLE, errors: [] };

  const byId = Object.fromEntries(scores.data.map((s) => [s.game_id, { score1: s.s1, score2: s.s2 }]));
  const games = resolveAllPlayoffs(
    divisions.map((d) => ({ id: d.id, teamIds: [...d.teams].sort(order).map((t) => t.id) })),
    plain.map((g) => ({ ...g, ...(byId[g.id] ?? {}) })),
  );
  const scored = scoredGameIds(games, null, byId, true);
  const approved: Record<string, ApprovedSource> = {};
  const published: Record<string, NonNullable<InboxItem['published']>> = {};
  for (const s of sources.data) {
    if (!s.mobile_game_id) continue;
    approved[s.game_id] = {
      mobileGameId: s.mobile_game_id,
      homePts: s.home_pts,
      awayPts: s.away_pts,
      eventCount: s.event_count,
      lastEventAt: s.last_event_at,
    };
    published[s.game_id] = { s1: s.s1, s2: s.s2, eventCount: s.event_count };
  }

  const linked = divisions.filter((d) => d.division_mobile_links);
  if (!linked.length) return { ...base, games, scored: [...scored], items: [], notice: NOT_LINKED, errors: [] };

  const items: InboxItem[] = [];
  const errors: string[] = [];
  // One request per linked division, in turn: a failure is reported against its own division.
  for (const d of linked) {
    const link = d.division_mobile_links!;
    let finals: InboxFinal[];
    try {
      finals = (await mobileReader().finals(link.league_id)) as InboxFinal[];
    } catch {
      errors.push(`Could not read ${d.name}'s finished games from the mobile app. Refresh to try again.`);
      continue;
    }
    const teamMap = Object.fromEntries(link.division_mobile_team_links.map((t) => [t.team_id, t.mobile_team_id]));
    for (const result of matchFinals({
      games,
      divisionId: d.id,
      teamMap,
      sources: approved,
      finals,
      scoredGameIds: scored,
      nowMs,
      timeZone: event.timezone,
    })) {
      items.push({
        divisionId: d.id,
        final: result.final as InboxFinal,
        result,
        published: result.existing ? (published[result.existing.gameId] ?? null) : null,
      });
    }
  }
  return { ...base, games, scored: [...scored], items, notice: null, errors };
}
