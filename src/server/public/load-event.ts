import 'server-only';

import { cache } from 'react';

import { serverEnv } from '@/env';
import { toHomeCards, type HomeCard, type HomeEventRow } from '@/lib/public-event/home';
import { toEventModel, type EventModel, type TeamRow, type PlayerRow } from '@/lib/public-event/model';
import { sanitizeRulesHtml } from '@/lib/rules-html';
import { createClient } from '@/lib/supabase/server';
import { canEditEvent } from '@/server/auth';

/**
 * Public reads through the visitor's own session, so RLS decides what is
 * visible: published events for everyone, drafts only for their editors
 * (PRD A-06). Nothing here uses the secret key.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class LoadError extends Error {
  constructor(what: string) {
    super(`Could not load ${what}`);
    this.name = 'LoadError';
  }
}

export interface PublicEvent {
  model: EventModel;
  /** Sanitised on render (E-71); safe to insert as HTML. */
  rulesHtml: string;
  /** Owner or superadmin: sees score inputs and draft previews (P-08, A-06). */
  canEdit: boolean;
  /** When the data was read, so the first client clock matches the server render. */
  loadedAt: number;
}

const EVENT_COLUMNS =
  'id, name, status, schedule_days, time_start, time_end, courts, court_names, timezone, logo_path, theme_primary, theme_bg, theme_text, theme_text_secondary, theme_heading, rules_html';
const GAME_COLUMNS =
  'id, division_id, day, start_time, court, group_id, team1_id, team2_id, label, type, is_playoff, bracket_game_id, team1_source, team2_source, playoff_round, position';

type TeamWithPlayers = TeamRow & { players: PlayerRow[] };

/** Null when the id is malformed or RLS hides the event (real 404, N-04). */
export const loadPublicEvent = cache(async (eventId: string): Promise<PublicEvent | null> => {
  if (!UUID.test(eventId)) return null;
  const supabase = await createClient();

  const { data: event, error } = await supabase.from('events').select(EVENT_COLUMNS).eq('id', eventId).maybeSingle();
  if (error) throw new LoadError('this event');
  if (!event) return null;

  const [divisions, games, scores, eventSponsors, platformSponsors, canEdit] = await Promise.all([
    supabase
      .from('divisions')
      .select(
        'id, name, color, sort_order, created_at, teams(id, division_id, name, coach, sort_order, created_at, players(id, team_id, name, number, sort_order))',
      )
      .eq('event_id', eventId),
    supabase.from('games').select(GAME_COLUMNS).eq('event_id', eventId),
    supabase.from('game_scores').select('game_id, s1, s2').eq('event_id', eventId),
    supabase.from('event_sponsors').select('tier, image_path, sort_order').eq('event_id', eventId),
    supabase.from('platform_sponsors').select('tier, image_path, sort_order'),
    canEditEvent(eventId),
  ]);
  for (const r of [divisions, games, scores, eventSponsors, platformSponsors]) {
    if (r.error) throw new LoadError('this event');
  }

  const divisionRows = divisions.data ?? [];
  const teams = divisionRows.flatMap((d) => (d.teams ?? []) as TeamWithPlayers[]);
  const model = toEventModel(
    {
      event,
      divisions: divisionRows.map(({ id, name, color, sort_order, created_at }) => ({
        id,
        name,
        color,
        sort_order,
        created_at,
      })),
      teams: teams.map(({ players: _players, ...t }) => t),
      players: teams.flatMap((t) => t.players ?? []),
      games: games.data ?? [],
      scores: scores.data ?? [],
      eventSponsors: eventSponsors.data ?? [],
      platformSponsors: platformSponsors.data ?? [],
    },
    serverEnv().NEXT_PUBLIC_SUPABASE_URL,
  );
  return { model, rulesHtml: sanitizeRulesHtml(event.rules_html), canEdit, loadedAt: Date.now() };
});

/** Home (H-01 to H-05): published events only, filtered by the query (H-03). */
export async function loadHomeEvents(now = new Date()): Promise<HomeCard[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('events')
    .select('id, name, schedule_days, timezone, logo_path, divisions(count)')
    .eq('status', 'published');
  if (error) throw new LoadError('events');
  return toHomeCards((data ?? []) as HomeEventRow[], serverEnv().NEXT_PUBLIC_SUPABASE_URL, now);
}

const LEGACY_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Old shared links (#/event/{firebaseId}): the new event id, or null. */
export async function findEventByLegacyId(legacyId: string): Promise<string | null> {
  if (!LEGACY_ID.test(legacyId)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from('events').select('id').eq('legacy_firebase_id', legacyId).maybeSingle();
  if (error) throw new LoadError('this event');
  return data?.id ?? null;
}
