import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { Admin } from '@/server/auth';
import type { ReportGame, ReportSource } from './model';

/** Only events this admin can manage; published events owned by someone else are excluded. */
export async function listReportEvents(admin: Admin) {
  const db = await createClient();
  let query = db.from('events').select('id, name, status, owner_id').order('created_at', { ascending: false });
  if (admin.role !== 'superadmin') query = query.eq('owner_id', admin.id);
  const { data, error } = await query;
  if (error) throw new Error('Could not load manageable events');
  return data;
}

/** Report source reads existing Connect rows only. Caller must check canEditEvent first. */
export async function loadConnectReportSource(
  eventId: string,
  readAt = new Date().toISOString(),
): Promise<ReportSource> {
  const db = await createClient();
  const { data: event, error: eventError } = await db
    .from('events')
    .select(
      'id, name, timezone, divisions(id, name, teams(id, name)), games(id, division_id, day, start_time, type, is_playoff, team1_id, team2_id)',
    )
    .eq('id', eventId)
    .maybeSingle();
  if (eventError || !event) throw new Error('Event unavailable');
  const gameIds = event.games.map((game) => game.id);
  const sourceReads = [];
  for (let offset = 0; offset < gameIds.length; offset += 100) {
    sourceReads.push(
      db
        .from('score_sources')
        .select('game_id, mobile_game_id')
        .in('game_id', gameIds.slice(offset, offset + 100)),
    );
  }
  const [{ data: scores, error: scoresError }, ...sourcePages] = await Promise.all([
    db.from('game_scores').select('game_id, s1, s2').eq('event_id', eventId),
    ...sourceReads,
  ]);
  if (scoresError || !scores || sourcePages.some((page) => page.error || !page.data))
    throw new Error('Could not read report scores or provenance');
  const sources = sourcePages.flatMap((page) => page.data ?? []);
  const scoreByGame = new Map(scores.map((s) => [s.game_id, s]));
  const mobileByGame = new Map(sources.map((s) => [s.game_id, s.mobile_game_id]));
  const games: ReportGame[] = event.games.map((g) => {
    const score = scoreByGame.get(g.id);
    return {
      id: g.id,
      divisionId: g.division_id ?? '',
      date: g.day ?? '',
      startTime: g.start_time ?? '',
      type: g.is_playoff || g.type !== 'group' ? 'playoff' : 'group',
      homeTeamId: g.team1_id,
      awayTeamId: g.team2_id,
      homeScore: score?.s1 ?? null,
      awayScore: score?.s2 ?? null,
      mobileGameId: mobileByGame.get(g.id) ?? null,
      mobileFinal: false,
      mobileEvents: [],
      manifests: [],
    };
  });
  return {
    event: { id: event.id, name: event.name, timezone: event.timezone },
    divisions: event.divisions.map((d) => ({ id: d.id, name: d.name })),
    teams: event.divisions.flatMap((d) => d.teams.map((t) => ({ id: t.id, divisionId: d.id, name: t.name }))),
    players: [],
    games,
    readAt,
  };
}
