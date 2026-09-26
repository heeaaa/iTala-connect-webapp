'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { serverEnv } from '@/env';
import { IMAGE_LIMIT, TOO_LARGE, platformImagePath, sniffImageType, uploadFailed } from '@/lib/event-images';
import { isEmptyRules, sanitizeRulesHtml } from '@/lib/rules-html';
import { createClient } from '@/lib/supabase/server';
import { authorizeSuperadmin, type ActionResult } from '@/server/auth';

type Db = Awaited<ReturnType<typeof createClient>>;

const tiers = z.enum(['primary', 'secondary']);
const NOT_STORED = 'only PNG, JPEG or WebP images can be stored.';
const NOT_SAVED = 'it could not be saved to the platform. Please try again.';
const NOT_REMOVED = 'Could not remove the sponsor. Refresh and try again.';

const bucket = (db: Db) => db.storage.from(serverEnv().SUPABASE_STORAGE_BUCKET);

/** Platform sponsors show on every event page (P-01); the settings page lists them. */
function refreshSponsors() {
  revalidatePath('/admin/settings');
  revalidatePath('/(public)/events/[eventId]', 'page');
}

/**
 * Add one platform sponsor (PRD S-01). As for event images, the browser has
 * already resized it, the bytes decide the type, and the file is written with
 * the superadmin's session (storage RLS). Each sponsor is its own row, so two
 * uploads at once can never overwrite each other (the old list could).
 */
export async function uploadPlatformSponsor(form: FormData): Promise<ActionResult> {
  const auth = await authorizeSuperadmin();
  if (!auth.ok) return auth;
  const tier = tiers.safeParse(form.get('tier'));
  const file = form.get('file');
  if (!tier.success || !(file instanceof Blob) || file.size === 0)
    return { ok: false, error: uploadFailed('no image was received.') };
  if (file.size > IMAGE_LIMIT) return { ok: false, error: uploadFailed(TOO_LARGE) };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImageType(bytes);
  if (!type) return { ok: false, error: uploadFailed(NOT_STORED) };

  const db = await createClient();
  const path = platformImagePath(tier.data, type, crypto.randomUUID());
  const upload = await bucket(db).upload(path, bytes, { contentType: type, cacheControl: '31536000', upsert: false });
  if (upload.error) return { ok: false, error: uploadFailed('the image store did not accept it. Please try again.') };

  // Next in line within its tier. Two uploads at the same moment may share a
  // number; both are kept and shown, in upload order.
  const { data: last } = await db
    .from('platform_sponsors')
    .select('sort_order')
    .eq('tier', tier.data)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await db
    .from('platform_sponsors')
    .insert({ tier: tier.data, image_path: path, sort_order: (last?.sort_order ?? -1) + 1 });
  if (error) {
    await bucket(db).remove([path]);
    return { ok: false, error: uploadFailed(NOT_SAVED) };
  }
  refreshSponsors();
  return { ok: true, data: undefined };
}

/** Remove one platform sponsor and delete its file (the old app left the file behind). */
export async function removePlatformSponsor(sponsorId: string): Promise<ActionResult> {
  const auth = await authorizeSuperadmin();
  if (!auth.ok) return auth;
  const id = z.uuid().safeParse(sponsorId);
  if (!id.success) return { ok: false, error: NOT_REMOVED };
  const db = await createClient();
  const { data, error } = await db.from('platform_sponsors').delete().eq('id', id.data).select('image_path').single();
  if (error || !data) return { ok: false, error: NOT_REMOVED };
  await bucket(db).remove([data.image_path]);
  refreshSponsors();
  return { ok: true, data: undefined };
}

/**
 * Save the default rules that new events start with (PRD S-02). Cleaned to
 * the rules allow-list first (E-71). Rules with no text are stored empty,
 * which means new events get the built-in iTala rules.
 */
export async function saveDefaultRules(html: string): Promise<ActionResult> {
  const auth = await authorizeSuperadmin();
  if (!auth.ok) return auth;
  const parsed = z.string().max(200_000).safeParse(html);
  if (!parsed.success) return { ok: false, error: 'The rules are too long to save.' };
  const clean = sanitizeRulesHtml(parsed.data);
  const db = await createClient();
  const { data, error } = await db
    .from('platform_settings')
    .update({ default_rules_html: isEmptyRules(clean) ? '' : clean })
    .eq('id', true)
    .select('id');
  if (error || !data?.length) return { ok: false, error: 'Could not save the default rules. Please try again.' };
  revalidatePath('/admin/settings');
  return { ok: true, data: undefined };
}
