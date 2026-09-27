'use server';
import { revalidatePath } from 'next/cache';
import { DUPLICATE, duplicateMobileTeams, linkInputSchema, type LinkInput } from '@/lib/mobile-link';
import { createClient } from '@/lib/supabase/server';
import { authorizeAdmin, canEditEvent, type ActionResult } from '@/server/auth';
import { mobileConfigured, mobileReader } from '@/server/mobile/reader';

const CHECK = 'Something on this page changed. Refresh and check the pairs again.';

/**
 * Link a division made by hand to a mobile league (PRD M-03). The league name
 * and season, and the teams it has, are read from the mobile app again rather
 * than taken from the page; every division team must belong to the division,
 * and the map must be one to one. The link and its map are replaced together.
 */
export async function saveMobileLink(input: LinkInput): Promise<ActionResult> {
  const auth = await authorizeAdmin();
  if (!auth.ok) return auth;
  if (!mobileConfigured) return { ok: false, error: 'The mobile app integration is not configured.' };
  const parsed = linkInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: CHECK };
  const { eventId, divisionId, leagueId, pairs } = parsed.data;
  if (!(await canEditEvent(eventId))) return { ok: false, error: 'You can only edit your own events.' };
  if (duplicateMobileTeams(pairs).length) return { ok: false, error: DUPLICATE };

  const db = await createClient();
  const { data: division } = await db
    .from('divisions')
    .select('id, event_id, teams(id)')
    .eq('id', divisionId)
    .maybeSingle();
  if (!division || division.event_id !== eventId) return { ok: false, error: CHECK };
  const teamIds = new Set(division.teams.map((t) => t.id));
  if (pairs.some((p) => !teamIds.has(p.teamId))) return { ok: false, error: CHECK };

  let league: { name: string; season: string } | undefined;
  let mobileTeams: Set<string>;
  try {
    const reader = mobileReader();
    const [leagues, teams] = await Promise.all([reader.listLeagues(), reader.teams(leagueId)]);
    league = leagues.find((l) => l.id === leagueId);
    mobileTeams = new Set(teams.map((t) => t.id));
  } catch {
    return { ok: false, error: 'Could not reach the mobile app. Try again in a moment.' };
  }
  if (!league) return { ok: false, error: 'That league is no longer in the mobile app. Choose another.' };
  const chosen = pairs.filter((p) => p.mobileTeamId);
  if (chosen.some((p) => !mobileTeams.has(p.mobileTeamId))) return { ok: false, error: CHECK };

  const { error } = await db.rpc('set_division_mobile_link', {
    p_division_id: divisionId,
    p_league_id: leagueId,
    p_league_name: league.name,
    p_season: league.season,
    p_teams: chosen.map((p) => ({ team_id: p.teamId, mobile_team_id: p.mobileTeamId })),
  });
  if (error)
    return { ok: false, error: error.code === '23505' ? DUPLICATE : 'Could not save the link. Please try again.' };
  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath(`/admin/events/${eventId}/results`);
  return { ok: true, data: undefined };
}
