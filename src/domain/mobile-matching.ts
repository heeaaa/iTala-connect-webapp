/**
 * PRD 12.6 and M-03 to M-08, ported from iTala-platform/src/integration.js
 * (matchFinals, reviewReason, toMs, isSettling, hasDrifted, norm,
 * proposeTeamPairs, scoredGidSet, orient, dayOf). Pure: the caller passes
 * "now" and the event time zone. One recorded Improve (M-08): "same day"
 * is decided in the event's time zone instead of the admin's browser zone.
 */

/** A row of the mobile app's final_game_scores view (column names as the view has them). */
export interface MobileFinal {
  game_id: string;
  league_id?: string;
  home_team_id: string | null;
  away_team_id: string | null;
  home_pts: number | null;
  away_pts: number | null;
  event_count: number | null;
  finished_at: number | string | null;
  last_event_at: number | string | null;
}

/** Provenance of an approved result (score_sources). */
export interface ApprovedSource {
  mobileGameId: string;
  homePts: number | null;
  awayPts: number | null;
  eventCount: number | null;
  lastEventAt: number | string | null;
}

/** A finished game may still receive replayed offline taps for this long. */
export const SETTLING_MS = 5 * 60 * 1000;

/** Epoch ms from a number, a digits string, or an ISO string; null when unreadable. */
export function toMs(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (/^-?\d+$/.test(v)) return parseInt(v, 10);
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

/** Why a row is not a usable result, in check order; null when it is usable. */
export function reviewReason(f: MobileFinal): string | null {
  if (!f.event_count) return 'no stats were recorded for this game';
  if (f.home_team_id === f.away_team_id) return 'the same team is on both sides';
  if (toMs(f.finished_at) === null) return 'no finish time recorded';
  if (f.home_pts === f.away_pts) return 'the score is level, so the game has no result';
  return null;
}

/** 0 <= now - last event < 5 minutes. A negative age is clock skew, not settling. */
export function isSettling(f: Pick<MobileFinal, 'last_event_at'>, nowMs: number): boolean {
  const last = toMs(f.last_event_at);
  if (last === null) return false;
  const age = nowMs - last;
  return age >= 0 && age < SETTLING_MS;
}

/** Points, event count or last event time moved since approval. */
export function hasDrifted(rec: ApprovedSource, f: MobileFinal): boolean {
  const pts = (a: unknown, b: unknown) => `${a ?? ''},${b ?? ''}`;
  if (pts(rec.homePts, rec.awayPts) !== pts(f.home_pts, f.away_pts)) return true;
  if ((rec.eventCount || 0) !== (f.event_count || 0)) return true;
  return (rec.lastEventAt || null) !== (f.last_event_at || null);
}

/** Name normalisation, for pre-filling the link wizard only. */
export function norm(s: string | null | undefined): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(bc|fc|team|the|club|basketball)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Auto-pairs only an unambiguous, unclaimed single match per Connect team. */
export function proposeTeamPairs<P extends { id: string; name: string }, M extends { id: string; name: string }>(
  connectTeams: readonly P[],
  mobileTeams: readonly M[],
) {
  const byNorm = new Map<string, M[]>();
  for (const mt of mobileTeams) {
    const k = norm(mt.name);
    byNorm.set(k, [...(byNorm.get(k) ?? []), mt]);
  }
  const pairs: Record<string, string> = {};
  const unmatchedConnect: P[] = [];
  const taken = new Set<string>();
  for (const pt of connectTeams) {
    const bucket = byNorm.get(norm(pt.name));
    if (bucket && bucket.length === 1 && !taken.has(bucket[0]!.id)) {
      pairs[pt.id] = bucket[0]!.id;
      taken.add(bucket[0]!.id);
    } else {
      unmatchedConnect.push(pt);
    }
  }
  return { pairs, unmatchedConnect, unmatchedMobile: mobileTeams.filter((mt) => !taken.has(mt.id)) };
}

/** The finish day in the event's time zone (M-08). */
export function dayOf(f: Pick<MobileFinal, 'finished_at'>, timeZone: string): string | null {
  const ms = toMs(f.finished_at);
  if (ms === null) return null;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export interface Score {
  score1: number | null;
  score2: number | null;
}

/**
 * Game ids that already hold a score, from the per-game scores and (for an
 * event not yet migrated to per-game scores) the positional ones. Either
 * side on its own counts; 0 is a score.
 */
export function scoredGameIds(
  games: readonly { id?: string }[],
  byIndex: Readonly<Record<number, Score | undefined>> | null,
  byId: Readonly<Record<string, Score | undefined>> | null,
  migrated: boolean,
): Set<string> {
  // null or missing is no score; 0 is a score.
  const has = (s: Score | undefined) => !!s && ((s.score1 ?? null) !== null || (s.score2 ?? null) !== null);
  const out = new Set<string>();
  games.forEach((g, i) => {
    if (!g.id) return;
    if (byId && has(byId[g.id])) out.add(g.id);
    else if (!migrated && byIndex && has(byIndex[i])) out.add(g.id);
  });
  return out;
}

/** Which fixture side each mobile team is on, by team and never by position. */
export function orient(
  game: { team1Id: string | null; team2Id: string | null } | null | undefined,
  homeTeamId: string,
  awayTeamId: string,
  homePts: number,
  awayPts: number,
): Score {
  if (!game) throw new Error('Fixture not found');
  if (game.team1Id === homeTeamId && game.team2Id === awayTeamId) return { score1: homePts, score2: awayPts };
  if (game.team1Id === awayTeamId && game.team2Id === homeTeamId) return { score1: awayPts, score2: homePts };
  throw new Error("This result's teams do not match that fixture");
}

export type MatchState =
  'approved' | 'drifted' | 'review' | 'settling' | 'unlinked' | 'proposed' | 'ambiguous' | 'unmatched';

export interface MatchGame {
  id?: string;
  divisionId: string;
  day: string | null;
  team1Id: string | null;
  team2Id: string | null;
}

export interface Candidate<G extends MatchGame> {
  gameId: string;
  game: G;
  sameDay: boolean;
}

export interface MatchResult<G extends MatchGame> {
  final: MobileFinal;
  homeTeamId: string | null;
  awayTeamId: string | null;
  candidates: Candidate<G>[];
  pick: Candidate<G> | null;
  existing: { gameId: string; source: ApprovedSource } | null;
  reason: string | null;
  state: MatchState;
}

export interface MatchInput<G extends MatchGame> {
  games: readonly G[];
  divisionId: string;
  /** Connect team id -> mobile team id, from the division's link. */
  teamMap: Readonly<Record<string, string | null | undefined>>;
  /** Game id -> provenance of an approved result. */
  sources: Readonly<Record<string, ApprovedSource | null | undefined>>;
  finals: readonly MobileFinal[];
  scoredGameIds: ReadonlySet<string>;
  nowMs: number;
  timeZone: string;
}

/**
 * 12.6: prior provenance (approved or drifted), review, settling,
 * unlinked, then candidates: one same-day or one overall is proposed, more
 * is ambiguous, none is unmatched. Never applies anything.
 */
export function matchFinals<G extends MatchGame>(input: MatchInput<G>): MatchResult<G>[] {
  const reverse = new Map<string, string>();
  for (const [teamId, mobileId] of Object.entries(input.teamMap)) if (mobileId) reverse.set(mobileId, teamId);
  const byMobileGame = new Map<string, { gameId: string; source: ApprovedSource }>();
  for (const [gameId, source] of Object.entries(input.sources)) {
    if (source?.mobileGameId) byMobileGame.set(source.mobileGameId, { gameId, source });
  }

  return input.finals.map((f) => {
    const out: MatchResult<G> = {
      final: f,
      homeTeamId: (f.home_team_id && reverse.get(f.home_team_id)) || null,
      awayTeamId: (f.away_team_id && reverse.get(f.away_team_id)) || null,
      candidates: [],
      pick: null,
      existing: null,
      reason: null,
      state: 'unmatched',
    };

    const prior = byMobileGame.get(f.game_id);
    if (prior) {
      out.existing = prior;
      out.state = hasDrifted(prior.source, f) ? 'drifted' : 'approved';
      return out;
    }
    const why = reviewReason(f);
    if (why) {
      out.state = 'review';
      out.reason = why;
      return out;
    }
    if (isSettling(f, input.nowMs)) {
      out.state = 'settling';
      out.reason = `the last stat arrived less than ${Math.round(SETTLING_MS / 60000)} minutes ago`;
      return out;
    }
    if (!out.homeTeamId || !out.awayTeamId) {
      out.state = 'unlinked';
      out.reason = 'a team in this game is not linked to a division team';
      return out;
    }

    const day = dayOf(f, input.timeZone);
    for (const g of input.games) {
      if (g.divisionId !== input.divisionId || !g.id || input.scoredGameIds.has(g.id)) continue;
      const pair =
        (g.team1Id === out.homeTeamId && g.team2Id === out.awayTeamId) ||
        (g.team1Id === out.awayTeamId && g.team2Id === out.homeTeamId);
      if (pair) out.candidates.push({ gameId: g.id, game: g, sameDay: !!day && g.day === day });
    }
    const sameDay = out.candidates.filter((c) => c.sameDay);
    if (sameDay.length === 1) {
      out.state = 'proposed';
      out.pick = sameDay[0]!;
    } else if (out.candidates.length === 1) {
      out.state = 'proposed';
      out.pick = out.candidates[0]!;
    } else if (out.candidates.length > 1) {
      out.state = 'ambiguous';
    }
    return out;
  });
}
