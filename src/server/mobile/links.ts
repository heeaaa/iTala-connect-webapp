import 'server-only';
import { createClient } from '@/lib/supabase/server';
/** RLS only reveals links for events the organiser may edit. */
export async function linkedMobileEvents(leagueId?: string) {
  const db = await createClient();
  let query = db
    .from('division_mobile_links')
    .select('division_id, league_id, divisions!inner(events!inner(id, name))');
  if (leagueId) query = query.eq('league_id', leagueId);
  const { data, error } = await query;
  if (error) throw new Error('Could not check existing links');
  return data.map((row) => ({
    leagueId: row.league_id,
    divisionId: row.division_id,
    eventId: row.divisions.events.id,
    eventName: row.divisions.events.name,
  }));
}

/** Count all links without revealing event details outside the current admin's RLS view. */
export async function mobileLeagueLinkCount(leagueId: string): Promise<number> {
  const db = await createClient();
  const { data, error } = await db.rpc('mobile_league_link_count', { p_league_id: leagueId });
  if (error || data === null) throw new Error('Could not check existing links');
  return data;
}
