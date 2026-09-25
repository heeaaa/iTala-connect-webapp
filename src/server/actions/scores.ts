'use server';

import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';
import { authorizeAdmin, type ActionResult } from '@/server/auth';

import { SAVE_SCORE_FAILED } from './score-messages';

const score = z.number().int().min(0).max(999).nullable();

const saveScoreSchema = z.object({
  gameId: z.uuid(),
  score1: score,
  score2: score,
});

export type SaveScoreInput = z.input<typeof saveScoreSchema>;

/**
 * Owner score entry on the public page (PRD P-08). Both sides are sent
 * together; both blank clears the score. set_score checks event ownership
 * in Postgres and removes any mobile provenance, so a hand-edited score is
 * never shown as approved from the mobile app.
 */
export async function saveScore(input: SaveScoreInput): Promise<ActionResult> {
  const auth = await authorizeAdmin();
  if (!auth.ok) return auth;
  const parsed = saveScoreSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Scores must be whole numbers from 0 to 999.' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('set_score', {
    p_game_id: parsed.data.gameId,
    // The generated type marks these non-null; set_score treats both null as "clear".
    p_s1: parsed.data.score1 as number,
    p_s2: parsed.data.score2 as number,
  });
  if (error)
    return {
      ok: false,
      error: error.code === '42501' ? 'You can only enter scores for your own events.' : SAVE_SCORE_FAILED,
    };
  return { ok: true, data: undefined };
}
