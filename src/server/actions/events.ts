'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { serverEnv } from '@/env';
import { editorSchema, type EditorInput } from '@/lib/event-editor';
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

export async function saveDraft(input: EditorInput): Promise<ActionResult<string>> {
  const auth = await authorizeAdmin();
  if (!auth.ok) return auth;
  const parsed = editorSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: `Check the event details: ${parsed.error.issues[0]?.message ?? 'invalid fields'}` };
  const { id, version, divisions, ...details } = parsed.data;
  if (!(await canEditEvent(id))) return { ok: false, error: 'You can only edit your own events.' };
  const db = await createClient();
  const { data, error } = await db.rpc('save_draft_editor', {
    p_event_id: id,
    p_version: version,
    p_details: details,
    p_divisions: divisions,
  });
  if (error)
    return {
      ok: false,
      error:
        error.code === '40001'
          ? 'This event changed in another window. Reload before saving.'
          : 'Could not save the draft. Check the details and try again.',
    };
  revalidatePath('/admin');
  revalidatePath(`/admin/events/${id}`);
  revalidatePath(`/events/${id}`);
  return { ok: true, data };
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
