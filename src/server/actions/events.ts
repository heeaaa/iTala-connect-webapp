'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { serverEnv } from '@/env';
import { reconcileSchedule } from '@/domain/schedule-edit';
import { editorSchema, type EditorInput } from '@/lib/event-editor';
import { gamesFromRows } from '@/lib/public-event/model';
import { createClient } from '@/lib/supabase/server';
import { authorizeAdmin, canEditEvent, type ActionResult } from '@/server/auth';
import { DEFAULT_RULES_HTML } from '@/server/event-defaults';
import { cleanDeletedEventImages } from '@/server/image-cleanup';

export async function createEvent(name: string): Promise<ActionResult<string>> {
  const auth = await authorizeAdmin();
  if (!auth.ok) return auth;
  const parsed = z.string().trim().min(1).max(200).safeParse(name);
  if (!parsed.success) return { ok: false, error: 'Enter an event name, up to 200 characters.' };
  const db = await createClient();
  const { data, error } = await db.rpc('create_draft_event', {
    p_name: parsed.data,
    p_timezone: serverEnv().DEFAULT_EVENT_TIMEZONE,
    p_rules: DEFAULT_RULES_HTML,
  });
  if (error) return { ok: false, error: 'Could not create the event. Please try again.' };
  revalidatePath('/admin');
  return { ok: true, data };
}

export type SaveOutcome = {
  version: string;
  /** Games moved to Unscheduled because they no longer fit (E-14). */
  moved: number;
};

/**
 * Editor save for drafts and published events (E-02, E-05, E-14). On a
 * published event, games that no longer fit the new days, hours or courts
 * are found with the ported reconcileSchedule and unscheduled in the same
 * transaction. Scores, provenance and mobile links are never written (E-06).
 */
export async function saveEvent(input: EditorInput): Promise<ActionResult<SaveOutcome>> {
  const auth = await authorizeAdmin();
  if (!auth.ok) return auth;
  const parsed = editorSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: `Check the event details: ${parsed.error.issues[0]?.message ?? 'invalid fields'}` };
  const { id, version, divisions, ...details } = parsed.data;
  if (!(await canEditEvent(id))) return { ok: false, error: 'You can only edit your own events.' };
  const db = await createClient();
  const { data: games, error: gamesError } = await db
    .from('games')
    .select(
      'id, division_id, day, start_time, court, group_id, team1_id, team2_id, label, type, is_playoff, bracket_game_id, team1_source, team2_source, playoff_round, position',
    )
    .eq('event_id', id);
  if (gamesError) return { ok: false, error: 'Could not save the event. Please try again.' };
  const stored = gamesFromRows(games);
  const reconciled = reconcileSchedule(
    { days: details.schedule_days, timeStart: details.time_start, timeEnd: details.time_end, courts: details.courts },
    stored,
  );
  const unschedule = reconciled.games.filter((g, i) => g.day === null && stored[i]!.day !== null).map((g) => g.id);
  const { data, error } = await db.rpc('save_event_editor', {
    p_event_id: id,
    p_version: version,
    p_details: details,
    p_divisions: divisions,
    p_unschedule: unschedule,
  });
  if (error)
    return {
      ok: false,
      error:
        error.code === '40001'
          ? 'This event changed in another window. Reload before saving.'
          : 'Could not save the event. Check the details and try again.',
    };
  revalidatePath('/admin');
  revalidatePath(`/admin/events/${id}`);
  revalidatePath(`/events/${id}`);
  return { ok: true, data: { version: data, moved: unschedule.length } };
}

export async function deleteEvent(eventId: string): Promise<ActionResult> {
  const auth = await authorizeAdmin();
  if (!auth.ok) return auth;
  if (!z.uuid().safeParse(eventId).success || !(await canEditEvent(eventId)))
    return { ok: false, error: 'You can only delete your own events.' };
  const db = await createClient();
  const { data, error } = await db.from('events').delete().eq('id', eventId).select('id').single();
  if (error || !data) return { ok: false, error: 'Could not delete the event. Please refresh and try again.' };
  await cleanDeletedEventImages(eventId);
  revalidatePath('/admin');
  revalidatePath('/');
  revalidatePath(`/events/${eventId}`);
  return { ok: true, data: undefined };
}

export async function retryImageCleanup(): Promise<ActionResult> {
  const auth = await authorizeAdmin();
  if (!auth.ok) return auth;
  const db = await createClient();
  const { data, error } = await db.from('event_image_cleanup').select('event_id').limit(100);
  if (error) return { ok: false, error: 'Could not load pending image cleanup. Try again.' };
  const results = await Promise.all(data.map((job) => cleanDeletedEventImages(job.event_id)));
  revalidatePath('/admin');
  return results.every(Boolean)
    ? { ok: true, data: undefined }
    : { ok: false, error: 'Some images could not be removed. Please try again later.' };
}
