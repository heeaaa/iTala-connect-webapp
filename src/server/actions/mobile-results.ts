'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { orient, toMs } from '@/domain/mobile-matching';
import { createClient } from '@/lib/supabase/server';
import { authorizeAdmin, canEditEvent, type ActionResult } from '@/server/auth';
import { mobileConfigured } from '@/server/mobile/reader';
import { loadInbox, type InboxItem } from '@/server/mobile/results';

const CHANGED = 'This result has changed in the mobile app or on the schedule. Refresh and check it again.';
const NOT_SAVED = 'Could not save the score. Refresh and try again.';

const iso = (v: number | string | null | undefined) => {
  const ms = toMs(v);
  return ms === null ? null : new Date(ms).toISOString();
};

/** What the approval records about the mobile game: the version approved now (M-06). */
const sourceOf = (item: InboxItem, method: 'mobile' | 'attach') => ({
  mobile_game_id: item.final.game_id,
  league_id: item.final.league_id ?? null,
  home_pts: item.final.home_pts,
  away_pts: item.final.away_pts,
  event_count: item.final.event_count ?? 0,
  last_event_at: iso(item.final.last_event_at),
  finished_at: iso(item.final.finished_at),
  method,
});

function refresh(eventId: string) {
  revalidatePath(`/admin/events/${eventId}/results`);
  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath(`/events/${eventId}`);
}

/** The inbox as it is now, for an event the caller may edit; never what the browser remembers. */
async function current(eventId: string, mobileGameId: string) {
  const auth = await authorizeAdmin();
  if (!auth.ok) return auth;
  if (!mobileConfigured) return { ok: false as const, error: 'The mobile app integration is not configured.' };
  if (!(await canEditEvent(eventId))) return { ok: false as const, error: 'You can only edit your own events.' };
  const inbox = await loadInbox(eventId);
  if (!inbox || inbox.notice) return { ok: false as const, error: inbox?.notice ?? CHANGED };
  const item = inbox.items.find((i) => i.final.game_id === mobileGameId);
  if (!item) return { ok: false as const, error: CHANGED };
  return { ok: true as const, data: { inbox, item } };
}

const approveSchema = z.object({
  eventId: z.uuid(),
  mobileGameId: z.string().min(1).max(200),
  gameId: z.uuid(),
  mode: z.enum(['approve', 'reapprove', 'attach']),
});
export type ApproveInput = z.input<typeof approveSchema>;

/**
 * Approve a mobile result onto a fixture (PRD M-06): Approve takes the proposed
 * fixture, Re-approve the one approved before, Attach any unscored fixture in the
 * division (for proposed, ambiguous and unmatched results only, never review or
 * settling). The server reads the result again and decides the orientation by
 * team, never position; the score and its provenance are written together.
 */
export async function approveResult(input: ApproveInput): Promise<ActionResult<{ gameId: string }>> {
  const parsed = approveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: CHANGED };
  const { eventId, mobileGameId, gameId, mode } = parsed.data;
  const found = await current(eventId, mobileGameId);
  if (!found.ok) return found;
  const { inbox, item } = found.data;
  const m = item.result;

  const allowed =
    mode === 'approve'
      ? m.state === 'proposed' && m.pick?.gameId === gameId
      : mode === 'reapprove'
        ? m.state === 'drifted' && m.existing?.gameId === gameId
        : ['proposed', 'ambiguous', 'unmatched'].includes(m.state) &&
          inbox.games.some((g) => g.id === gameId && g.divisionId === item.divisionId) &&
          !inbox.scored.includes(gameId);
  if (!allowed) return { ok: false, error: CHANGED };
  if (!m.homeTeamId || !m.awayTeamId)
    return { ok: false, error: 'Link both teams for this division before approving this result.' };
  if (item.final.home_pts === null || item.final.away_pts === null) return { ok: false, error: CHANGED };

  let score;
  try {
    score = orient(
      inbox.games.find((g) => g.id === gameId),
      m.homeTeamId,
      m.awayTeamId,
      Number(item.final.home_pts),
      Number(item.final.away_pts),
    );
  } catch (e) {
    return { ok: false, error: e instanceof Error ? `${e.message}.` : CHANGED };
  }
  const db = await createClient();
  const { error } = await db.rpc('approve_mobile_result', {
    p_game_id: gameId,
    p_s1: score.score1!,
    p_s2: score.score2!,
    p_source: sourceOf(item, mode === 'attach' ? 'attach' : 'mobile'),
  });
  if (error) return { ok: false, error: NOT_SAVED };
  refresh(eventId);
  return { ok: true, data: { gameId } };
}

const keepSchema = z.object({ eventId: z.uuid(), mobileGameId: z.string().min(1).max(200) });

/**
 * Keep the published score of a result that changed after approval (PRD M-06),
 * recording the mobile app's version now so the same change is not raised again.
 */
export async function keepPublishedScore(input: z.input<typeof keepSchema>): Promise<ActionResult> {
  const parsed = keepSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: CHANGED };
  const found = await current(parsed.data.eventId, parsed.data.mobileGameId);
  if (!found.ok) return found;
  const { item } = found.data;
  if (item.result.state !== 'drifted' || !item.result.existing) return { ok: false, error: CHANGED };
  const db = await createClient();
  const { error } = await db.rpc('dismiss_mobile_result', {
    p_game_id: item.result.existing.gameId,
    p_source: sourceOf(item, 'mobile'),
  });
  if (error) return { ok: false, error: 'Could not save. Refresh and try again.' };
  refresh(parsed.data.eventId);
  return { ok: true, data: undefined };
}
