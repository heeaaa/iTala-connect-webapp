'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { serverEnv } from '@/env';
import { IMAGE_LIMIT, TOO_LARGE, imagePath, sniffImageType, uploadFailed, type ImageKind } from '@/lib/event-images';
import { createClient } from '@/lib/supabase/server';
import { authorizeAdmin, canEditEvent, type ActionResult } from '@/server/auth';

/**
 * `version`: the event's new edit token, when the event row changed (the logo)
 * and the caller's own version was current. Absent otherwise, so a window
 * behind another window's save is still told so at its next save.
 */
export type ImageOutcome = { version?: string };

type Db = Awaited<ReturnType<typeof createClient>>;

const kinds = z.enum(['logo', 'banner', 'major', 'minor']);
const NOT_STORED = 'only PNG, JPEG or WebP images can be stored.';
const NOT_SAVED = 'it could not be saved to the event. Please try again.';
const NOT_REMOVED = 'Could not remove the image. Refresh and try again.';
const NOT_UPDATED = 'Could not update the sponsor backing. Refresh and try again.';
const NOT_FOCUSED = 'Could not save the banner focal point. Refresh and try again.';

function refresh(eventId: string) {
  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath(`/events/${eventId}`);
  revalidatePath('/');
}

const bucket = (db: Db) => db.storage.from(serverEnv().SUPABASE_STORAGE_BUCKET);

/** Best effort: a replaced or removed file is deleted; the event's folder goes with the event anyway. */
async function removeFile(db: Db, path: string | null | undefined) {
  if (path) await bucket(db).remove([path]);
}

/**
 * Upload an event logo, banner, major sponsor, or a minor sponsor (PRD E-15 to
 * E-18). The browser has already resized the image; here the bytes decide
 * the type (never the name or declared type), the file goes to the event's
 * own folder through the organiser's session (storage RLS), and then the
 * event records it. A replaced file is deleted; if recording fails, the new
 * file is deleted again, so nothing is left behind.
 */
export async function uploadEventImage(form: FormData): Promise<ActionResult<ImageOutcome>> {
  const auth = await authorizeAdmin();
  if (!auth.ok) return auth;
  const eventId = z.uuid().safeParse(form.get('eventId'));
  const kind = kinds.safeParse(form.get('kind'));
  const file = form.get('file');
  const version = form.get('version');
  if (!eventId.success || !kind.success || !(file instanceof Blob) || file.size === 0)
    return { ok: false, error: uploadFailed('no image was received.') };
  if (file.size > IMAGE_LIMIT) return { ok: false, error: uploadFailed(TOO_LARGE) };
  if (!(await canEditEvent(eventId.data))) return { ok: false, error: 'You can only edit your own events.' };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImageType(bytes);
  if (!type) return { ok: false, error: uploadFailed(NOT_STORED) };

  const db = await createClient();
  const path = imagePath(eventId.data, kind.data, type, crypto.randomUUID());
  const upload = await bucket(db).upload(path, bytes, { contentType: type, cacheControl: '31536000', upsert: false });
  if (upload.error) return { ok: false, error: uploadFailed('the image store did not accept it. Please try again.') };

  const recorded = await record(db, eventId.data, kind.data, path, typeof version === 'string' ? version : undefined);
  if (!recorded.ok) {
    await removeFile(db, path);
    return { ok: false, error: uploadFailed(NOT_SAVED) };
  }
  await removeFile(db, recorded.replaced);
  refresh(eventId.data);
  return { ok: true, data: { version: recorded.version } };
}

async function record(
  db: Db,
  eventId: string,
  kind: ImageKind,
  path: string,
  version: string | undefined,
): Promise<{ ok: true; replaced: string | null; version?: string } | { ok: false }> {
  if (kind === 'logo' || kind === 'banner') {
    const { data, error } = await db
      .rpc(kind === 'logo' ? 'set_event_logo' : 'set_event_banner', {
        p_event_id: eventId,
        p_path: path,
        p_version: version,
      })
      .single();
    return error || !data ? { ok: false } : { ok: true, replaced: data.old_path, version: data.version ?? undefined };
  }
  if (kind === 'major') {
    const { data, error } = await db.rpc('set_major_sponsor', { p_event_id: eventId, p_path: path });
    return error ? { ok: false } : { ok: true, replaced: data };
  }
  const { data: last } = await db
    .from('event_sponsors')
    .select('sort_order')
    .eq('event_id', eventId)
    .eq('tier', 'minor')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await db
    .from('event_sponsors')
    .insert({ event_id: eventId, tier: 'minor', image_path: path, sort_order: (last?.sort_order ?? -1) + 1 });
  return error ? { ok: false } : { ok: true, replaced: null };
}

const removeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.enum(['logo', 'banner', 'major']), eventId: z.uuid(), version: z.string().optional() }),
  z.object({ kind: z.literal('minor'), eventId: z.uuid(), sponsorId: z.uuid() }),
]);
export type RemoveImageInput = z.input<typeof removeSchema>;

const displayModeSchema = z.object({
  eventId: z.uuid(),
  kind: z.enum(['major', 'minor']),
  sponsorId: z.uuid().optional(),
  displayMode: z.enum(['light', 'dark']),
});

const bannerFocusSchema = z.object({
  eventId: z.uuid(),
  focus: z.enum(['left', 'center', 'right']),
  version: z.string().optional(),
});

/** Save the horizontal crop position for one event banner. */
export async function setEventBannerFocus(
  input: z.input<typeof bannerFocusSchema>,
): Promise<ActionResult<ImageOutcome>> {
  const auth = await authorizeAdmin();
  if (!auth.ok) return auth;
  const parsed = bannerFocusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: NOT_FOCUSED };
  if (!(await canEditEvent(parsed.data.eventId))) return { ok: false, error: 'You can only edit your own events.' };
  const db = await createClient();
  const { data, error } = await db.rpc('set_event_banner_focus', {
    p_event_id: parsed.data.eventId,
    p_focus: parsed.data.focus,
    p_version: parsed.data.version,
  });
  if (error) return { ok: false, error: NOT_FOCUSED };
  refresh(parsed.data.eventId);
  return { ok: true, data: { version: data ?? undefined } };
}

/** Choose the neutral backing used behind an event sponsor logo. */
export async function setEventSponsorDisplayMode(input: z.input<typeof displayModeSchema>): Promise<ActionResult> {
  const auth = await authorizeAdmin();
  if (!auth.ok) return auth;
  const parsed = displayModeSchema.safeParse(input);
  if (!parsed.success || (parsed.data.kind === 'minor' && !parsed.data.sponsorId))
    return { ok: false, error: NOT_UPDATED };
  if (!(await canEditEvent(parsed.data.eventId))) return { ok: false, error: 'You can only edit your own events.' };
  const db = await createClient();
  const query = db
    .from('event_sponsors')
    .update({ display_mode: parsed.data.displayMode })
    .eq('event_id', parsed.data.eventId)
    .eq('tier', parsed.data.kind);
  const { data, error } =
    parsed.data.kind === 'major'
      ? await query.select('id').maybeSingle()
      : await query.eq('id', parsed.data.sponsorId!).select('id').maybeSingle();
  if (error || !data) return { ok: false, error: NOT_UPDATED };
  refresh(parsed.data.eventId);
  return { ok: true, data: undefined };
}

/** Remove the logo, banner, major sponsor, or one minor sponsor, and delete its file (E-15 to E-18). */
export async function removeEventImage(input: RemoveImageInput): Promise<ActionResult<ImageOutcome>> {
  const auth = await authorizeAdmin();
  if (!auth.ok) return auth;
  const parsed = removeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: NOT_REMOVED };
  const r = parsed.data;
  if (!(await canEditEvent(r.eventId))) return { ok: false, error: 'You can only edit your own events.' };
  const db = await createClient();
  let removed: string | null = null;
  let version: string | undefined;
  if (r.kind === 'minor') {
    const { data, error } = await db
      .from('event_sponsors')
      .delete()
      .eq('id', r.sponsorId)
      .eq('event_id', r.eventId)
      .eq('tier', 'minor')
      .select('image_path')
      .single();
    if (error || !data) return { ok: false, error: NOT_REMOVED };
    removed = data.image_path;
  } else if (r.kind === 'logo' || r.kind === 'banner') {
    const { data, error } = await db
      .rpc(r.kind === 'logo' ? 'set_event_logo' : 'set_event_banner', {
        p_event_id: r.eventId,
        p_version: r.version,
      })
      .single();
    if (error || !data) return { ok: false, error: NOT_REMOVED };
    removed = data.old_path;
    version = data.version ?? undefined;
  } else {
    const { data, error } = await db.rpc('set_major_sponsor', { p_event_id: r.eventId });
    if (error) return { ok: false, error: NOT_REMOVED };
    removed = data;
  }
  await removeFile(db, removed);
  refresh(r.eventId);
  return { ok: true, data: { version } };
}
