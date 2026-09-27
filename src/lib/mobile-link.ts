import { z } from 'zod';
import { proposeTeamPairs } from '@/domain/mobile-matching';

/**
 * The link wizard (PRD M-03): which mobile team each division team is, one to
 * one. Pure, so the form and the Server Action agree on the rules and wording.
 */

export const DUPLICATE =
  'Two teams in this division are pointing at the same team in the mobile app. Each mobile team can be matched to one division team only, or results will be attached to the wrong fixture. Please fix the duplicates.';

export const linkInputSchema = z.object({
  eventId: z.uuid(),
  divisionId: z.uuid(),
  leagueId: z.string().min(1).max(200),
  pairs: z.array(z.object({ teamId: z.uuid(), mobileTeamId: z.string().max(200) })).max(200),
});
export type LinkInput = z.input<typeof linkInputSchema>;

/**
 * Where the form starts: a pair a person already chose wins (when the link is
 * to this same league), and the name proposal only fills the gaps, so opening
 * the wizard again never quietly re-pairs a team.
 */
export function startingPairs(
  teams: readonly { id: string; name: string }[],
  mobileTeams: readonly { id: string; name: string }[],
  existing: Readonly<Record<string, string>>,
): Record<string, string> {
  const known = new Set(mobileTeams.map((t) => t.id));
  const proposal = proposeTeamPairs(teams, mobileTeams).pairs;
  return Object.fromEntries(
    teams.map((t) => [t.id, (existing[t.id] && known.has(existing[t.id]!) ? existing[t.id] : proposal[t.id]) ?? '']),
  );
}

/** Mobile team ids chosen for more than one division team. */
export function duplicateMobileTeams(pairs: readonly { mobileTeamId: string }[]): string[] {
  const seen = new Set<string>();
  const twice = new Set<string>();
  for (const { mobileTeamId } of pairs) {
    if (!mobileTeamId) continue;
    if (seen.has(mobileTeamId)) twice.add(mobileTeamId);
    seen.add(mobileTeamId);
  }
  return [...twice];
}

/** "2 teams not paired. Results involving them will be listed but cannot be approved." */
export const unpairedHint = (count: number) =>
  count
    ? `${count} team${count === 1 ? '' : 's'} not paired. Results involving them will be listed but cannot be approved.`
    : '';

/** "Harbour League (2026) · archived", as the old league picker listed them. */
export const leagueLabel = (l: { name: string; season?: string | null; is_archived?: boolean; is_closed?: boolean }) =>
  `${l.name}${l.season ? ` (${l.season})` : ''}${l.is_archived ? ' · archived' : l.is_closed ? ' · closed' : ''}`;
