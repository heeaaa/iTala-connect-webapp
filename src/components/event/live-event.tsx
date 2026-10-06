'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { clockInZone } from '@/lib/event-time';
import { scoredGames, toTodayEvent, type EventModel, type Score } from '@/lib/public-event/model';
import { createClient } from '@/lib/supabase/client';
import { saveScore } from '@/server/actions/scores';

import styles from './event-content.module.css';
import { StandingsTab } from './event-tabs-content';
import { type FeedState } from './today/model';
import { TodaySchedule } from './today/today-schedule';

/** Owner score entry waits this long after the last keystroke (P-08). */
const SAVE_DELAY_MS = 700;
/** Schedule edits arrive in bursts (publish, drag and drop); refresh once. */
const REFRESH_DELAY_MS = 400;

export interface LiveEventProps {
  model: EventModel;
  tab: 'schedule' | 'standings';
  selectedDay: string | null;
  canEdit: boolean;
  /** Server render time, so the first client clock matches the server's. */
  renderedAt: number;
}

type ScoreRow = { game_id?: string; s1?: number | null; s2?: number | null };

/**
 * Live client island for the Schedule and Standings tabs (P-07). Scores
 * change in place over Realtime (with the paint-in); schedule changes
 * re-render on the server. Standings and playoff teams are recomputed here
 * from the same src/domain code the server uses.
 */
export function LiveEvent({ model, tab, selectedDay, canEdit, renderedAt }: LiveEventProps) {
  const router = useRouter();
  const [overrides, setOverrides] = useState<Record<string, Score>>({});
  const [changedAt, setChangedAt] = useState<Record<string, number>>({});
  const [feed, setFeed] = useState<FeedState>('live');
  const [clock, setClock] = useState(() => clockInZone(new Date(renderedAt), model.timeZone));
  const [saveError, setSaveError] = useState<string | null>(null);
  const [unlockedGames, setUnlockedGames] = useState<Set<string>>(() => new Set());
  const [pendingGames, setPendingGames] = useState<Set<string>>(() => new Set());
  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const saveQueues = useRef(new Map<string, Promise<void>>());
  const editVersions = useRef(new Map<string, number>());
  // The last score the server confirmed (a save or Realtime) per game, so a failed
  // save puts back what is stored rather than the previous keystroke.
  const confirmed = useRef(new Map<string, Score>());

  const gameIds = useMemo(() => new Set(model.games.map((g) => g.id)), [model.games]);
  const scores = useMemo(() => ({ ...model.scores, ...overrides }), [model.scores, overrides]);

  useEffect(() => {
    const id = window.setInterval(() => setClock(clockInZone(new Date(), model.timeZone)), 30_000);
    return () => window.clearInterval(id);
  }, [model.timeZone]);

  useEffect(() => {
    const supabase = createClient();
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase
      .channel(`event-${model.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_scores', filter: `event_id=eq.${model.id}` },
        (payload) => {
          const row = (payload.eventType === 'DELETE' ? payload.old : payload.new) as ScoreRow;
          // DELETE payloads carry only the key and are not filtered by event.
          if (!row.game_id || !gameIds.has(row.game_id)) return;
          const next: Score =
            payload.eventType === 'DELETE'
              ? { score1: null, score2: null }
              : { score1: row.s1 ?? null, score2: row.s2 ?? null };
          confirmed.current.set(row.game_id, next);
          setOverrides((o) => ({ ...o, [row.game_id!]: next }));
          setChangedAt((c) => ({ ...c, [row.game_id!]: Date.now() }));
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'games', filter: `event_id=eq.${model.id}` },
        () => {
          clearTimeout(refreshTimer);
          refreshTimer = setTimeout(() => router.refresh(), REFRESH_DELAY_MS);
        },
      )
      .subscribe((status) => setFeed(status === 'SUBSCRIBED' ? 'live' : 'reconnecting'));
    return () => {
      clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [model.id, gameIds, router]);

  const onScoreChange = (gameId: string, side: 1 | 2, value: number | null) => {
    const before = scores[gameId] ?? { score1: null, score2: null };
    const next: Score = side === 1 ? { ...before, score1: value } : { ...before, score2: value };
    const editVersion = (editVersions.current.get(gameId) ?? 0) + 1;
    editVersions.current.set(gameId, editVersion);
    setOverrides((o) => ({ ...o, [gameId]: next }));
    setPendingGames((ids) => new Set(ids).add(gameId));
    setSaveError(null);
    const timers = saveTimers.current;
    clearTimeout(timers.get(gameId));
    timers.set(
      gameId,
      setTimeout(() => {
        timers.delete(gameId);
        const prior = saveQueues.current.get(gameId) ?? Promise.resolve();
        const saving = prior.then(async () => {
          const result = await saveScore({ gameId, score1: next.score1, score2: next.score2 }).catch(() => ({
            ok: false as const,
            error: 'Could not save the score. Check your connection and try again.',
          }));
          if (result.ok) confirmed.current.set(gameId, next);
          if (editVersions.current.get(gameId) !== editVersion) return;
          setPendingGames((ids) => {
            const nextIds = new Set(ids);
            nextIds.delete(gameId);
            return nextIds;
          });
          if (!result.ok) {
            setSaveError(result.error);
            const stored = confirmed.current.get(gameId) ?? model.scores[gameId] ?? { score1: null, score2: null };
            setOverrides((o) => ({ ...o, [gameId]: stored }));
            // Keep the boxes open to try again, even if the stored score is complete.
            setUnlockedGames((ids) => new Set(ids).add(gameId));
          } else {
            setUnlockedGames((ids) => {
              const nextIds = new Set(ids);
              nextIds.delete(gameId);
              return nextIds;
            });
          }
        });
        saveQueues.current.set(gameId, saving);
      }, SAVE_DELAY_MS),
    );
  };

  const names = useMemo(() => new Map(model.teams.map((t) => [t.id, t.name])), [model.teams]);

  return (
    <>
      {saveError ? (
        <p role="alert" className={styles.saveError}>
          {saveError}
        </p>
      ) : null}
      {tab === 'schedule' ? (
        <TodaySchedule
          event={toTodayEvent(model, scores, changedAt)}
          clock={clock}
          selectedDay={selectedDay}
          feed={feed}
          onScoreChange={canEdit ? onScoreChange : undefined}
          unlockedGames={unlockedGames}
          pendingGames={pendingGames}
          onToggleLock={
            canEdit
              ? (gameId, locked) =>
                  setUnlockedGames((ids) => {
                    const nextIds = new Set(ids);
                    if (locked) nextIds.add(gameId);
                    else nextIds.delete(gameId);
                    return nextIds;
                  })
              : undefined
          }
        />
      ) : (
        <StandingsTab
          divisions={model.divisions}
          games={scoredGames(model, scores)}
          teamName={(id) => names.get(id) ?? 'Unknown team'}
        />
      )}
    </>
  );
}
