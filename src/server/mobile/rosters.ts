import 'server-only';
import { rosterNote, sameRoster, sortRoster, type RosterPlayer } from '@/lib/mobile-rosters';
import { createClient } from '@/lib/supabase/server';
import { mobileReader } from './reader';

/**
 * Compare rosters (PRD M-11), read only. iTala Connect is read through the
 * signed-in person's session (so the usual access rules apply) and the
 * mobile app through the GET-only reader. Nothing is written anywhere.
 */

export interface RosterTeam {
  id: string;
  name: string;
  /** The paired mobile team, or null when this team is not paired. */
  mobile: { id: string; name: string; teamOnly: boolean } | null;
  connect: RosterPlayer[];
  /** Null when not paired. */
  mobileRoster: RosterPlayer[] | null;
  same: boolean | null;
  note: string | null;
}

interface Base {
  event: { id: string; name: string };
  division: { id: string; name: string };
}

export type RosterComparison =
  | (Base & { state: 'not_linked' })
  | (Base & { state: 'league_gone'; league: { name: string; season: string | null } })
  | (Base & { state: 'unreachable'; league: { name: string; season: string | null } })
  | (Base & {
      state: 'ready';
      league: { name: string; season: string | null };
      teams: RosterTeam[];
      /** Mobile teams in the league that no division team is paired with. */
      unpairedMobile: string[];
    });

const byOrder = <T extends { sort_order: number; created_at?: string }>(a: T, b: T) =>
  a.sort_order - b.sort_order || (a.created_at ?? '').localeCompare(b.created_at ?? '');

const roster = (players: readonly { number: string; name: string }[]) =>
  sortRoster(players.map((p) => ({ number: p.number, name: p.name })));

/** The comparison for one division, or null when there is no such division for this event. */
export async function loadRosterComparison(eventId: string, divisionId: string): Promise<RosterComparison | null> {
  const db = await createClient();
  const { data: event } = await db
    .from('events')
    .select(
      'id, name, divisions(id, name, teams(id, name, sort_order, created_at, players(name, number)), division_mobile_links(league_id, league_name, season, division_mobile_team_links(team_id, mobile_team_id)))',
    )
    .eq('id', eventId)
    .maybeSingle();
  const division = event?.divisions.find((d) => d.id === divisionId);
  if (!event || !division) return null;
  const base: Base = { event: { id: event.id, name: event.name }, division: { id: division.id, name: division.name } };
  const link = division.division_mobile_links;
  if (!link) return { ...base, state: 'not_linked' };
  const league = { name: link.league_name, season: link.season };

  let mobileTeams: { id: string; name: string; team_only: boolean; players: { number: string; name: string }[] }[];
  try {
    mobileTeams = (await mobileReader().preview(link.league_id)).teams;
  } catch (error) {
    const gone = error instanceof Error && error.message === 'Mobile league no longer exists';
    return gone ? { ...base, state: 'league_gone', league } : { ...base, state: 'unreachable', league };
  }

  const pairs = new Map(link.division_mobile_team_links.map((p) => [p.team_id, p.mobile_team_id]));
  const mobileById = new Map(mobileTeams.map((t) => [t.id, t]));
  const teams: RosterTeam[] = [...division.teams].sort(byOrder).map((t) => {
    const connect = roster(t.players);
    const paired = mobileById.get(pairs.get(t.id) ?? '');
    if (!paired) return { id: t.id, name: t.name, mobile: null, connect, mobileRoster: null, same: null, note: null };
    const mobileRoster = roster(paired.players);
    return {
      id: t.id,
      name: t.name,
      mobile: { id: paired.id, name: paired.name, teamOnly: paired.team_only },
      connect,
      mobileRoster,
      same: sameRoster(connect, mobileRoster),
      note: rosterNote(connect, mobileRoster),
    };
  });
  const pairedIds = new Set(teams.map((t) => t.mobile?.id).filter(Boolean));
  const unpairedMobile = mobileTeams.filter((m) => !pairedIds.has(m.id)).map((m) => m.name);
  return { ...base, state: 'ready', league, teams, unpairedMobile };
}
