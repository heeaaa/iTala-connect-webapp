'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { placePlayoffGames } from '@/domain/playoffs';
import { reconcileSchedule } from '@/domain/schedule-edit';
import { generateDivisionRoundRobin, isUnscheduled } from '@/domain/scheduler';
import { type EventSetup, type Game } from '@/domain/types';
import { gamesFromRows } from '@/lib/public-event/model';
import { ENTER_GAMES, playoffProblem, roundRobinProblem } from '@/lib/schedule-additions';
import { eventSetupFromRows, gameRows } from '@/lib/schedule-rows';
import { createClient } from '@/lib/supabase/server';
import { authorizeAdmin, canEditEvent, type ActionResult } from '@/server/auth';

/**
 * What an addition did: games added, how many of them went to Unscheduled,
 * and how many existing games were moved to Unscheduled first (E-14).
 */
export type Addition = { added: number; unscheduled: number; moved: number };

type Db = Awaited<ReturnType<typeof createClient>>;

const GAME_COLUMNS =
  'id, division_id, day, start_time, court, group_id, team1_id, team2_id, label, type, is_playoff, bracket_game_id, team1_source, team2_source, playoff_round, position';

/**
 * The saved event as the scheduler sees it. Games keep their stored teams:
 * the old editor loaded the event straight from the database, so a playoff
 * game counts with whatever teams are stored on it (usually TBD), never the
 * teams its bracket would resolve to right now (Phase 2 handover).
 */
async function loadSchedule(db: Db, eventId: string) {
  const { data } = await db
    .from('events')
    .select(
      `schedule_days, time_start, time_end, courts, divisions(id, name, bracket_count, custom_games_per_team, games_per_team, sort_order, teams(id, sort_order)), games(${GAME_COLUMNS})`,
    )
    .eq('id', eventId)
    .single();
  return data;
}

const nextPosition = (games: readonly { position: number }[]) => Math.max(-1, ...games.map((g) => g.position)) + 1;
const outcome = (games: readonly Game[], moved: readonly string[]): Addition => ({
  added: games.length,
  unscheduled: games.filter(isUnscheduled).length,
  moved: moved.length,
});

/**
 * The old editor ran reconcileSchedule (in collectEditorFields) before either
 * addition, so games that no longer fit the event's days, hours or courts
 * went to Unscheduled first. Returns the fitted schedule and the moved ids.
 */
function fitted(setup: EventSetup, stored: readonly (Game & { id: string })[]) {
  const { games } = reconcileSchedule(setup, stored);
  return { games, moved: stored.filter((g, i) => games[i] !== g).map((g) => g.id) };
}

function refresh(eventId: string) {
  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath(`/events/${eventId}`);
}

const roundRobinSchema = z.object({
  eventId: z.uuid(),
  divisionId: z.uuid(),
  custom: z.boolean(),
  /** Games per team when `custom`; ignored otherwise. */
  gamesPerTeam: z.number().int().min(0).max(20),
});
export type RoundRobinInput = z.input<typeof roundRobinSchema>;

/**
 * "+ Round robin" on a published event (PRD E-63): skips matchups already on
 * the schedule and fills free slots only, as the old editor did. The chosen
 * games per team is kept on the division, games that no longer fit are
 * unscheduled, the new games are added and the schedule re-sorted, all in one
 * `add_round_robin` transaction. Never writes scores.
 */
export async function addRoundRobin(input: RoundRobinInput): Promise<ActionResult<Addition>> {
  const auth = await authorizeAdmin();
  if (!auth.ok) return auth;
  const parsed = roundRobinSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: ENTER_GAMES };
  const { eventId, divisionId, custom, gamesPerTeam } = parsed.data;
  if (!(await canEditEvent(eventId))) return { ok: false, error: 'You can only edit your own events.' };
  const db = await createClient();
  const event = await loadSchedule(db, eventId);
  if (!event) return { ok: false, error: 'Could not load the event. Please try again.' };
  const division = event.divisions.find((d) => d.id === divisionId);
  if (!division) return { ok: false, error: 'That division is not in this event. Refresh and try again.' };
  const problem = roundRobinProblem({
    teams: division.teams.length,
    days: event.schedule_days.length,
    custom,
    gamesPerTeam,
  });
  if (problem) return { ok: false, error: problem };

  // The old editor stored the choice on the division before generating, so a
  // full round robin never picks up an earlier custom number.
  const divisions = event.divisions.map((d) =>
    d.id === divisionId ? { ...d, custom_games_per_team: custom, games_per_team: custom ? gamesPerTeam : null } : d,
  );
  const setup = eventSetupFromRows(event, divisions);
  const schedule = fitted(setup, gamesFromRows(event.games));
  let added: Game[];
  try {
    added = generateDivisionRoundRobin(setup, divisionId, schedule.games, custom ? gamesPerTeam : 0);
  } catch (e) {
    return {
      ok: false,
      error: `Could not generate the round robin: ${e instanceof Error ? e.message : 'unknown error'}`,
    };
  }
  const { error } = await db.rpc('add_round_robin', {
    p_event_id: eventId,
    p_division_id: divisionId,
    p_custom: custom,
    p_games_per_team: custom ? gamesPerTeam : 0,
    p_unschedule: schedule.moved,
    p_games: gameRows(added, nextPosition(event.games)),
  });
  if (error) return { ok: false, error: 'Could not add the round robin. Nothing was changed. Please try again.' };
  refresh(eventId);
  return { ok: true, data: outcome(added, schedule.moved) };
}

const playoffSchema = z.object({ eventId: z.uuid(), divisionId: z.uuid(), teams: z.number().int() });
export type PlayoffInput = z.input<typeof playoffSchema>;

/**
 * "+ Playoff" on a published event (PRD E-64): a seeded single-elimination
 * bracket for the top N teams, placed from 1 hour after the latest game in
 * 60-minute steps on court 1, rolling to the next day. Games that do not fit
 * go to Unscheduled. A second playoff reuses bracket ids, as the old editor
 * did (the first match wins). One `add_playoff` transaction.
 */
export async function addPlayoff(input: PlayoffInput): Promise<ActionResult<Addition>> {
  const auth = await authorizeAdmin();
  if (!auth.ok) return auth;
  const parsed = playoffSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Check the number of teams and try again.' };
  const { eventId, divisionId, teams } = parsed.data;
  if (!(await canEditEvent(eventId))) return { ok: false, error: 'You can only edit your own events.' };
  const db = await createClient();
  const event = await loadSchedule(db, eventId);
  if (!event) return { ok: false, error: 'Could not load the event. Please try again.' };
  const division = event.divisions.find((d) => d.id === divisionId);
  if (!division) return { ok: false, error: 'That division is not in this event. Refresh and try again.' };
  const problem = playoffProblem(division.teams.length, teams);
  if (problem) return { ok: false, error: problem };

  const setup = eventSetupFromRows(event, event.divisions);
  const schedule = fitted(setup, gamesFromRows(event.games));
  const added = placePlayoffGames(setup, schedule.games, division, teams);
  const { error } = await db.rpc('add_playoff', {
    p_event_id: eventId,
    p_unschedule: schedule.moved,
    p_games: gameRows(added, nextPosition(event.games)),
  });
  if (error) return { ok: false, error: 'Could not add the playoff. Nothing was changed. Please try again.' };
  refresh(eventId);
  return { ok: true, data: outcome(added, schedule.moved) };
}
