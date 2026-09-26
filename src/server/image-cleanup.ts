import 'server-only';
import { z } from 'zod';
import { serverEnv } from '@/env';
import { createAdminClient } from '@/lib/supabase/admin';

/** Caller must obtain ids through the user's RLS-protected cleanup queue.
 * The privileged client is used solely for deleting a deleted event's images.
 * Any failure leaves the durable queue row for a later retry.
 */
export async function cleanDeletedEventImages(eventId: string): Promise<boolean> {
  if (!z.uuid().safeParse(eventId).success) return false;
  try {
    const admin = createAdminClient();
    const { data: job, error: jobError } = await admin
      .from('event_image_cleanup')
      .select('event_id')
      .eq('event_id', eventId)
      .maybeSingle();
    if (jobError) return false;
    if (!job) return true;
    const { data: event, error: eventError } = await admin.from('events').select('id').eq('id', eventId).maybeSingle();
    if (eventError || event) return false;
    const storage = admin.storage.from(serverEnv().SUPABASE_STORAGE_BUCKET);
    const paths: string[] = [];
    async function collect(prefix: string, depth = 0) {
      if (depth > 20) throw new Error('Too many nested image folders');
      for (let offset = 0; ; offset += 100) {
        const { data, error } = await storage.list(prefix, {
          limit: 100,
          offset,
          sortBy: { column: 'name', order: 'asc' },
        });
        if (error) throw error;
        for (const item of data) {
          const path = `${prefix}/${item.name}`;
          if (item.id) paths.push(path);
          else await collect(path, depth + 1);
        }
        if (data.length < 100) break;
      }
    }
    await collect(`events/${eventId}`);
    for (let i = 0; i < paths.length; i += 100) {
      const { error } = await storage.remove(paths.slice(i, i + 100));
      if (error) throw error;
    }
    const { error } = await admin.from('event_image_cleanup').delete().eq('event_id', eventId);
    return !error;
  } catch {
    return false;
  }
}
