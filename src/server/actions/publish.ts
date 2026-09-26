'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { NO_GAMES_MESSAGE, publishProblem } from '@/domain/publish';
import { generateSchedule } from '@/domain/scheduler';
import { eventSetupFromRows, gameRows } from '@/lib/schedule-rows';
import { createClient } from '@/lib/supabase/server';
import { authorizeAdmin, canEditEvent, type ActionResult } from '@/server/auth';

export type PublishOutcome =
  /** Published; `games` fixtures were created. */
  | { status: 'published'; games: number }
  /** Nothing changed: ask first. `scores` is null when they could not be counted (E-62). */
  | { status: 'confirm'; scores: number | null };

type Db = Awaited<ReturnType<typeof createClient>>;

async function recordedScores(db: Db, eventId: string): Promise<number | null> {
  const { count, error } = await db
    .from('game_scores')
    .select('game_id', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .or('s1.not.is.null,s2.not.is.null');
  return error ? null : (count ?? 0);
}

/**
 * Publish (E-60 to E-62): rebuilds the whole schedule from the saved event,
 * never from client state, in one `publish_event` transaction. When scores
 * exist and `clearScores` is false, nothing changes and the caller is asked.
 */
export async function publishEvent(eventId: string, clearScores = false): Promise<ActionResult<PublishOutcome>> {
  const auth = await authorizeAdmin();
  if (!auth.ok) return auth;
  if (!z.uuid().safeParse(eventId).success || !(await canEditEvent(eventId)))
    return { ok: false, error: 'You can only publish your own events.' };
  const db = await createClient();
  const { data: event, error } = await db
    .from('events')
    .select(
      'schedule_days, time_start, time_end, courts, divisions(id, name, bracket_count, custom_games_per_team, games_per_team, sort_order, teams(id, sort_order))',
    )
    .eq('id', eventId)
    .single();
  if (error || !event) return { ok: false, error: 'Could not load the event. Please try again.' };

  const problem = publishProblem({
    days: event.schedule_days,
    divisions: event.divisions.map((d) => ({
      name: d.name,
      teamCount: d.teams.length,
      customGamesPerTeam: d.custom_games_per_team,
      gamesPerTeam: d.games_per_team ?? 0,
    })),
  });
  if (problem) return { ok: false, error: problem };

  let schedule;
  try {
    schedule = generateSchedule(eventSetupFromRows(event, event.divisions));
  } catch (e) {
    return { ok: false, error: `Error generating schedule: ${e instanceof Error ? e.message : 'unknown error'}` };
  }
  if (!schedule.length) return { ok: false, error: NO_GAMES_MESSAGE };

  if (!clearScores) {
    const scores = await recordedScores(db, eventId);
    if (scores !== 0) return { ok: true, data: { status: 'confirm', scores } };
  }
  const { data: count, error: publishError } = await db.rpc('publish_event', {
    p_event_id: eventId,
    p_games: gameRows(schedule),
    p_clear_scores: clearScores,
  });
  if (publishError) {
    // A score arrived between the count and the publish: ask again.
    if (publishError.hint === 'scores_exist')
      return { ok: true, data: { status: 'confirm', scores: await recordedScores(db, eventId) } };
    return { ok: false, error: 'Could not publish the event. Nothing was changed. Please try again.' };
  }
  revalidatePath('/admin');
  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath(`/events/${eventId}`);
  revalidatePath('/');
  return { ok: true, data: { status: 'published', games: count } };
}
