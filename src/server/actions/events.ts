'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { serverEnv } from '@/env';
import { reconcileSchedule } from '@/domain/schedule-edit';
import { editorSchema, type EditorInput } from '@/lib/event-editor';
import { eventSlugSchema } from '@/lib/event-slug';
import { gamesFromRows } from '@/lib/public-event/model';
import { createClient } from '@/lib/supabase/server';
import { isEmptyRules, sanitizeRulesHtml } from '@/lib/rules-html';
import { authorizeAdmin, canEditEvent, type ActionResult } from '@/server/auth';
import { DEFAULT_RULES_HTML } from '@/server/event-defaults';
import { slugTaken, slugTakenMessage } from '@/server/event-slug';
import { cleanDeletedEventImages } from '@/server/image-cleanup';

const slugError = (issues: { message: string }[]) => issues[0]?.message ?? 'Check the web address.';

/** A new draft with its name and web address (P-14); the address must be free. */
export async function createEvent(input: { name: string; slug: string }): Promise<ActionResult<string>> {
  const auth = await authorizeAdmin();
  if (!auth.ok) return auth;
  const name = z.string().trim().min(1).max(200).safeParse(input?.name);
  if (!name.success) return { ok: false, error: 'Enter an event name, up to 200 characters.' };
  const slug = eventSlugSchema.safeParse(input?.slug);
  if (!slug.success) return { ok: false, error: slugError(slug.error.issues) };
  const db = await createClient();
  const { data, error } = await db.rpc('create_draft_event', {
    p_name: name.data,
    p_timezone: serverEnv().DEFAULT_EVENT_TIMEZONE,
    p_rules: DEFAULT_RULES_HTML,
    p_slug: slug.data,
  });
  if (error)
    return {
      ok: false,
      error: slugTaken(error) ? await slugTakenMessage(db, slug.data) : 'Could not create the event. Please try again.',
    };
  revalidatePath('/admin');
  return { ok: true, data };
}

export type SlugCheck = {
  /** The address as it would be stored. */
  slug: string;
  /** Free, or already this event's. */
  free: boolean;
  /** The address itself when free, otherwise the first free one with a number added. */
  suggestion: string;
};

/** For the web address field: is this address free (for this event, when editing)? */
export async function checkEventSlug(slug: string, eventId?: string): Promise<ActionResult<SlugCheck>> {
  const auth = await authorizeAdmin();
  if (!auth.ok) return auth;
  const parsed = eventSlugSchema.safeParse(slug);
  if (!parsed.success) return { ok: false, error: slugError(parsed.error.issues) };
  if (eventId !== undefined && !z.uuid().safeParse(eventId).success) return { ok: false, error: 'Unknown event.' };
  const db = await createClient();
  const { data, error } = await db.rpc('free_event_slug', { p_slug: parsed.data, p_event_id: eventId });
  if (error || !data) return { ok: false, error: 'Could not check the web address. Try again.' };
  return { ok: true, data: { slug: parsed.data, free: data === parsed.data, suggestion: data } };
}

/**
 * A new web address for an event (owner or superadmin). The old one keeps
 * leading to the event. Returns the event's new version for the editor.
 */
export async function changeEventSlug(
  eventId: string,
  slug: string,
): Promise<ActionResult<{ slug: string; version: string }>> {
  const auth = await authorizeAdmin();
  if (!auth.ok) return auth;
  const parsed = eventSlugSchema.safeParse(slug);
  if (!parsed.success) return { ok: false, error: slugError(parsed.error.issues) };
  if (!z.uuid().safeParse(eventId).success || !(await canEditEvent(eventId)))
    return { ok: false, error: 'You can only change your own events.' };
  const db = await createClient();
  const { data, error } = await db.rpc('set_event_slug', { p_event_id: eventId, p_slug: parsed.data });
  if (error || !data)
    return {
      ok: false,
      error:
        error && slugTaken(error)
          ? await slugTakenMessage(db, parsed.data, eventId)
          : 'Could not change the web address. Please try again.',
    };
  revalidatePath('/');
  revalidatePath('/admin');
  revalidatePath(`/admin/events/${eventId}`);
  return { ok: true, data: { slug: parsed.data, version: data } };
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
  const { id, version, divisions, ...fields } = parsed.data;
  // Rules are cleaned to the allow-list before they are stored (E-71), and
  // rules with no text are stored as none, so the event page says "No rules."
  const clean = fields.rules_html === undefined ? undefined : sanitizeRulesHtml(fields.rules_html);
  const details = clean === undefined ? fields : { ...fields, rules_html: isEmptyRules(clean) ? '' : clean };
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
