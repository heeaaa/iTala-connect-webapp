import 'server-only';

import type { createClient } from '@/lib/supabase/server';

type Db = Awaited<ReturnType<typeof createClient>>;

/**
 * The database refused an address as taken: by the functions' own check (hint
 * event_slug_taken) or, when two saves race, by the unique index.
 */
export function slugTaken(error: { code?: string; hint?: string; message?: string }): boolean {
  return (
    error.code === '23505' &&
    (error.hint === 'event_slug_taken' || /events_slug_key|event_slugs_pkey/.test(error.message ?? ''))
  );
}

/** What to tell the organiser when their address is taken, with the first free one to try. */
export async function slugTakenMessage(db: Db, slug: string, eventId?: string): Promise<string> {
  const { data } = await db.rpc('free_event_slug', { p_slug: slug, p_event_id: eventId });
  return data && data !== slug
    ? `Another event already uses that web address. Try ${data}.`
    : 'Another event already uses that web address. Choose another.';
}
