import 'server-only';
import { createClient } from '@/lib/supabase/server';
/** RLS only reveals links for events the organiser may edit. */
export async function linkedMobileEvents(leagueId?: string) {
  const db = await createClient();
  let query = db.from('division_mobile_links').select('league_id, divisions!inner(events!inner(id, name))');
  if (leagueId) query = query.eq('league_id', leagueId);
  const { data, error } = await query;
  if (error) throw new Error('Could not check existing links');
  return data.map((row) => ({
    leagueId: row.league_id,
    eventId: row.divisions.events.id,
    eventName: row.divisions.events.name,
  }));
}
