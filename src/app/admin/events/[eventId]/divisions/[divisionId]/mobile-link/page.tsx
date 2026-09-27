import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';
import { canEditEvent, requireAdmin } from '@/server/auth';
import { mobileConfigured, mobileReader } from '@/server/mobile/reader';

import { LinkView, type LinkPageData } from './link-view';

export const metadata: Metadata = { title: 'Link to the mobile app' };

// The link wizard (PRD M-03): owner or superadmin, and only when the mobile integration is on (M-01).
export default async function MobileLinkPage({
  params,
  searchParams,
}: PageProps<'/admin/events/[eventId]/divisions/[divisionId]/mobile-link'>) {
  const { eventId, divisionId } = await params;
  await requireAdmin(`/admin/events/${eventId}/divisions/${divisionId}/mobile-link`);
  const ids = z.object({ eventId: z.uuid(), divisionId: z.uuid() });
  if (!mobileConfigured || !ids.safeParse({ eventId, divisionId }).success || !(await canEditEvent(eventId)))
    notFound();

  const db = await createClient();
  const { data: event } = await db
    .from('events')
    .select(
      'id, name, divisions(id, name, teams(id, name, sort_order, created_at), division_mobile_links(league_id, division_mobile_team_links(team_id, mobile_team_id)))',
    )
    .eq('id', eventId)
    .maybeSingle();
  const division = event?.divisions.find((d) => d.id === divisionId);
  if (!event || !division) notFound();

  const link = division.division_mobile_links;
  const existing = Object.fromEntries(
    (link?.division_mobile_team_links ?? []).map((t) => [t.team_id, t.mobile_team_id]),
  );
  const teams = [...division.teams]
    .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
    .map((t) => ({ id: t.id, name: t.name }));
  const others = event.divisions
    .filter((d) => d.id !== divisionId && d.division_mobile_links)
    .map((d) => ({ name: d.name, leagueId: d.division_mobile_links!.league_id }));

  const base = { eventId, eventName: event.name, divisionId, divisionName: division.name, teams, others };
  let data: LinkPageData;
  try {
    const reader = mobileReader();
    const leagues = await reader.listLeagues();
    const asked = typeof (await searchParams).league === 'string' ? String((await searchParams).league) : '';
    const leagueId = leagues.some((l) => l.id === asked) ? asked : (link?.league_id ?? '');
    const mobileTeams = leagueId ? await reader.teams(leagueId) : [];
    data = {
      ...base,
      leagues: leagues.map((l) => ({
        id: l.id,
        name: l.name,
        season: l.season,
        is_archived: l.is_archived,
        is_closed: l.is_closed,
      })),
      leagueId,
      mobileTeams: mobileTeams.map((t) => ({ id: t.id, name: t.name })),
      // Pairs a person chose count only for the league they were chosen for.
      existing: leagueId && leagueId === link?.league_id ? existing : {},
      unreachable: false,
    };
  } catch {
    data = { ...base, leagues: [], leagueId: '', mobileTeams: [], existing: {}, unreachable: true };
  }
  // A new league starts a fresh form: the pairs belong to the league they were chosen for.
  return <LinkView key={data.leagueId} data={data} />;
}
