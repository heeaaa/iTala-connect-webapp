import { z } from 'zod';

import { type EventTheme } from '@/components/event/theme';
import { type TodayEvent, type TodayGame } from '@/components/event/today/model';
import { resolveAllPlayoffs } from '@/domain/playoffs';
import { type Game, type PlayoffSource } from '@/domain/types';
import { type Database } from '@/lib/supabase/database.types';

/**
 * Public event page view model (PRD P-01 to P-13), mapped from database rows.
 * Pure, so the server loader and the live client island share it, and so
 * standings and playoff resolution always agree (MIGRATION_PLAN.md 9).
 */

type Rows = Database['public']['Tables'];
export type EventRow = Pick<
  Rows['events']['Row'],
  | 'id'
  | 'name'
  | 'status'
  | 'schedule_days'
  | 'time_start'
  | 'time_end'
  | 'courts'
  | 'court_names'
  | 'timezone'
  | 'logo_path'
  | 'theme_primary'
  | 'theme_bg'
  | 'theme_text'
  | 'theme_text_secondary'
  | 'theme_heading'
  | 'rules_html'
>;
export type DivisionRow = Pick<Rows['divisions']['Row'], 'id' | 'name' | 'color' | 'sort_order' | 'created_at'>;
export type TeamRow = Pick<Rows['teams']['Row'], 'id' | 'division_id' | 'name' | 'coach' | 'sort_order' | 'created_at'>;
export type PlayerRow = Pick<Rows['players']['Row'], 'id' | 'team_id' | 'name' | 'number' | 'sort_order'>;
export type GameRow = Pick<
  Rows['games']['Row'],
  | 'id'
  | 'division_id'
  | 'day'
  | 'start_time'
  | 'court'
  | 'group_id'
  | 'team1_id'
  | 'team2_id'
  | 'label'
  | 'type'
  | 'is_playoff'
  | 'bracket_game_id'
  | 'team1_source'
  | 'team2_source'
  | 'playoff_round'
  | 'position'
>;
export type ScoreRow = Pick<Rows['game_scores']['Row'], 'game_id' | 's1' | 's2'>;
export type SponsorRow = { tier: string; image_path: string; sort_order: number };

export interface Score {
  score1: number | null;
  score2: number | null;
}

export interface EventModel {
  id: string;
  name: string;
  status: 'draft' | 'published';
  days: string[];
  timeZone: string;
  courtNames: string[];
  theme: EventTheme;
  logoUrl: string | null;
  sponsors: { major: string | null; minor: string[]; platformPrimary: string[]; platformSecondary: string[] };
  divisions: { id: string; name: string; color: string; teamIds: string[] }[];
  teams: {
    id: string;
    divisionId: string;
    name: string;
    coach: string;
    players: { id: string; name: string; number: string }[];
  }[];
  /** Games in schedule order (position); scores are kept apart and merged live. */
  games: (Game & { id: string })[];
  scores: Record<string, Score>;
}

export interface EventRows {
  event: EventRow;
  divisions: DivisionRow[];
  teams: TeamRow[];
  players: PlayerRow[];
  games: GameRow[];
  scores: ScoreRow[];
  eventSponsors: SponsorRow[];
  platformSponsors: SponsorRow[];
}

/** Public URL of an object in the public images bucket. */
export function imageUrl(supabaseUrl: string, path: string | null | undefined): string | null {
  if (!path) return null;
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  return `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/images/${encoded}`;
}

const sourceSchema = z.union([
  z.object({ type: z.literal('seed'), rank: z.number().int().min(1) }),
  z.object({ type: z.literal('winner'), bracketGameId: z.string().min(1) }),
]);

function playoffSource(value: unknown): PlayoffSource | null {
  const parsed = sourceSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Postgres returns time as "HH:MM:SS"; the domain works in "HH:MM". */
export function hhmm(time: string | null): string | null {
  return time ? time.slice(0, 5) : null;
}

const byOrder = <T extends { sort_order: number; created_at?: string }>(a: T, b: T) =>
  a.sort_order - b.sort_order || (a.created_at ?? '').localeCompare(b.created_at ?? '');

export function toEventModel(rows: EventRows, supabaseUrl: string): EventModel {
  const { event } = rows;
  const divisions = [...rows.divisions].sort(byOrder);
  const teams = [...rows.teams].sort(byOrder);
  const playersByTeam = new Map<string, EventModel['teams'][number]['players']>();
  for (const p of [...rows.players].sort(byOrder)) {
    playersByTeam.set(p.team_id, [
      ...(playersByTeam.get(p.team_id) ?? []),
      { id: p.id, name: p.name, number: p.number },
    ]);
  }
  const sponsorUrls = (list: SponsorRow[], tier: string) =>
    [...list]
      .filter((s) => s.tier === tier)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((s) => imageUrl(supabaseUrl, s.image_path)!);

  const games = [...rows.games]
    .sort((a, b) => a.position - b.position)
    .map((g): Game & { id: string } => {
      const s1 = g.is_playoff ? playoffSource(g.team1_source) : null;
      const s2 = g.is_playoff ? playoffSource(g.team2_source) : null;
      return {
        id: g.id,
        day: g.day,
        time: hhmm(g.start_time),
        court: g.court,
        divisionId: g.division_id ?? '',
        groupId: g.group_id,
        team1Id: g.team1_id,
        team2Id: g.team2_id,
        label: g.label,
        // A playoff game never counts as a group game, even when its bracket
        // link is unreadable (the old isGroupGame checked the playoff flag).
        type: g.type === 'semi' || g.type === 'final' ? g.type : g.is_playoff ? 'semi' : 'group',
        score1: null,
        score2: null,
        ...(s1 && s2 && g.bracket_game_id
          ? {
              playoff: {
                bracketGameId: g.bracket_game_id,
                team1Source: s1,
                team2Source: s2,
                round: g.playoff_round ?? 1,
              },
            }
          : {}),
      };
    });

  return {
    id: event.id,
    name: event.name,
    status: event.status === 'published' ? 'published' : 'draft',
    days: [...new Set(event.schedule_days)].sort(),
    timeZone: event.timezone,
    courtNames: event.court_names,
    theme: {
      primary: event.theme_primary,
      bg: event.theme_bg,
      text: event.theme_text,
      textSecondary: event.theme_text_secondary,
      heading: event.theme_heading,
    },
    logoUrl: imageUrl(supabaseUrl, event.logo_path),
    sponsors: {
      major: sponsorUrls(rows.eventSponsors, 'major')[0] ?? null,
      minor: sponsorUrls(rows.eventSponsors, 'minor'),
      platformPrimary: sponsorUrls(rows.platformSponsors, 'primary'),
      platformSecondary: sponsorUrls(rows.platformSponsors, 'secondary'),
    },
    divisions: divisions.map((d) => ({
      id: d.id,
      name: d.name,
      color: d.color,
      teamIds: teams.filter((t) => t.division_id === d.id).map((t) => t.id),
    })),
    teams: teams.map((t) => ({
      id: t.id,
      divisionId: t.division_id,
      name: t.name,
      coach: t.coach,
      players: playersByTeam.get(t.id) ?? [],
    })),
    games,
    scores: Object.fromEntries(rows.scores.map((s) => [s.game_id, { score1: s.s1, score2: s.s2 }])),
  };
}

/** Games with scores merged and playoff teams resolved (P-06), in schedule order. */
export function scoredGames(model: EventModel, scores: Record<string, Score> = model.scores) {
  const merged = model.games.map((g) => ({ ...g, ...(scores[g.id] ?? { score1: null, score2: null }) }));
  return resolveAllPlayoffs(model.divisions, merged);
}

/** The Schedule tab's view (TodaySchedule), from a model and the live scores. */
export function toTodayEvent(
  model: EventModel,
  scores: Record<string, Score>,
  changedAt: Record<string, number> = {},
): TodayEvent {
  return {
    id: model.id,
    name: model.name,
    days: model.days,
    courtNames: model.courtNames,
    timeZone: model.timeZone,
    theme: model.theme,
    divisions: model.divisions.map(({ id, name, color }) => ({ id, name, color })),
    teams: model.teams.map(({ id, name, divisionId }) => ({ id, name, divisionId })),
    games: scoredGames(model, scores).map((g): TodayGame => ({
      id: g.id,
      day: g.day,
      time: g.time,
      court: g.court,
      team1Id: g.team1Id,
      team2Id: g.team2Id,
      score1: g.score1,
      score2: g.score2,
      divisionId: g.divisionId,
      label: g.label,
      type: g.type,
      ...(changedAt[g.id] ? { changedAt: changedAt[g.id] } : {}),
    })),
  };
}
