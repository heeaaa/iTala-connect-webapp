import { notFound } from 'next/navigation';
import { clientEnv } from '@/env.client';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin, canEditEvent } from '@/server/auth';
import type { EditorInput } from '@/lib/event-editor';
import { gamesFromRows, imageUrl } from '@/lib/public-event/model';
import { sanitizeRulesHtml } from '@/lib/rules-html';
import { EventEditor } from './event-editor';
export default async function EventEditorPage({ params, searchParams }: PageProps<'/admin/events/[eventId]'>) {
  const { eventId } = await params;
  await requireAdmin(`/admin/events/${eventId}`);
  if (!z.uuid().safeParse(eventId).success || !(await canEditEvent(eventId))) notFound();
  const db = await createClient();
  const { data: event, error } = await db
    .from('events')
    .select(
      '*, divisions(*, teams(*, players(*)), division_mobile_links(league_name, season)), games(id, division_id, day, start_time, court, group_id, team1_id, team2_id, label, type, is_playoff, bracket_game_id, team1_source, team2_source, playoff_round, position, game_scores(s1, s2)), event_sponsors(id, tier, image_path, sort_order)',
    )
    .eq('id', eventId)
    .single();
  if (error) throw new Error('Could not load the event. Please try again.');
  const input: EditorInput = {
    id: event.id,
    version: event.updated_at,
    name: event.name,
    schedule_days: event.schedule_days,
    time_start: event.time_start.slice(0, 5),
    time_end: event.time_end.slice(0, 5),
    courts: event.courts,
    court_names: event.court_names,
    timezone: event.timezone,
    theme_primary: event.theme_primary,
    theme_bg: event.theme_bg,
    theme_text: event.theme_text,
    theme_text_secondary: event.theme_text_secondary,
    theme_heading: event.theme_heading,
    rules_html: sanitizeRulesHtml(event.rules_html),
    divisions: event.divisions
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((d) => ({
        id: d.id,
        name: d.name,
        color: d.color,
        bracket_count: d.bracket_count,
        custom_games_per_team: d.custom_games_per_team,
        games_per_team: d.games_per_team ?? 0,
        teams: d.teams
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((t) => ({
            id: t.id,
            name: t.name,
            coach: t.coach,
            players: t.players
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((p) => ({ id: p.id, name: p.name, number: p.number })),
          })),
      })),
  };
  const links = Object.fromEntries(
    event.divisions.filter((d) => d.division_mobile_links).map((d) => [d.id, d.division_mobile_links!]),
  );
  const scores = new Map(event.games.map((g) => [g.id, g.game_scores]));
  const supabaseUrl = clientEnv().NEXT_PUBLIC_SUPABASE_URL;
  const sponsors = [...event.event_sponsors].sort((a, b) => a.sort_order - b.sort_order);
  const major = sponsors.find((s) => s.tier === 'major');
  const query = await searchParams;
  const imported = typeof query.imported === 'string' ? query.imported.slice(0, 200) : undefined;
  return (
    <EventEditor
      initial={input}
      links={links}
      images={{
        logo: imageUrl(supabaseUrl, event.logo_path),
        major: major ? imageUrl(supabaseUrl, major.image_path) : null,
        minors: sponsors
          .filter((s) => s.tier === 'minor')
          .map((s) => ({ id: s.id, url: imageUrl(supabaseUrl, s.image_path)! })),
      }}
      games={gamesFromRows(event.games).map((g) => ({
        ...g,
        score1: scores.get(g.id)?.s1 ?? null,
        score2: scores.get(g.id)?.s2 ?? null,
      }))}
      published={event.status !== 'draft'}
      notice={
        imported
          ? `Event created from ${imported}. Add dates and courts, then publish.`
          : query.created
            ? 'Created. Add your event details and divisions.'
            : ''
      }
    />
  );
}
