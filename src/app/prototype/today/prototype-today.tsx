'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { EventShell } from '@/components/event/event-shell';
import { EVENT_TABS, type EventTabId } from '@/components/event/tabs';
import { type FeedState, type TodayEvent, type TodayGame } from '@/components/event/today/model';
import { TodaySchedule } from '@/components/event/today/today-schedule';
import { type Clock, gameStatus } from '@/domain/game-day';
import { clockInZone } from '@/lib/event-time';

type ScoreOverride = Pick<TodayGame, 'score1' | 'score2' | 'changedAt'>;

export interface PrototypeTodayProps {
  event: TodayEvent;
  clock: Clock;
  liveClock: boolean;
  selectedDay: string | null;
  tab: EventTabId;
  feed: FeedState;
  owner: boolean;
  fontClassName: string;
}

/**
 * SIMULATED. Holds sample scores in memory: "Simulate a basket" and owner
 * score entry change them here, standing in for Supabase Realtime and the
 * set_score action until phase 4.
 */
export function PrototypeToday(props: PrototypeTodayProps) {
  const { event, liveClock, selectedDay, tab, feed, owner, fontClassName } = props;
  const [clock, setClock] = useState(props.clock);
  const [overrides, setOverrides] = useState<Record<string, ScoreOverride>>({});

  useEffect(() => {
    if (!liveClock) return;
    const id = window.setInterval(() => setClock(clockInZone(new Date(), event.timeZone)), 30_000);
    return () => window.clearInterval(id);
  }, [liveClock, event.timeZone]);

  const games = event.games.map((g) => (overrides[g.id] ? { ...g, ...overrides[g.id] } : g));
  const shown = { ...event, games };

  const setScore = (gameId: string, side: 1 | 2, score: number | null) => {
    const current = games.find((g) => g.id === gameId)!;
    setOverrides((o) => ({
      ...o,
      [gameId]: {
        score1: side === 1 ? score : current.score1,
        score2: side === 2 ? score : current.score2,
        changedAt: Date.now(),
      },
    }));
  };

  const onCourt = games.filter((g) => gameStatus(g, clock) === 'on-court' && g.team1Id && g.team2Id);
  const simulateBasket = () => {
    const g = onCourt[Math.floor(Math.random() * onCourt.length)];
    if (!g) return;
    const side = Math.random() < 0.5 ? 1 : 2;
    setScore(g.id, side, ((side === 1 ? g.score1 : g.score2) ?? 0) + (Math.random() < 0.3 ? 3 : 2));
  };

  return (
    <>
      <p className="bg-brand-accent px-4 py-2 text-sm text-brand-accent-text">
        Prototype with sample data. Not a real event.{' '}
        <a href="#prototype-controls" className="underline underline-offset-4">
          Prototype controls
        </a>
      </p>
      <EventShell name={event.name} days={event.days} theme={event.theme} tab={tab} fontClassName={fontClassName}>
        {tab === 'schedule' ? (
          <TodaySchedule
            event={shown}
            clock={clock}
            selectedDay={selectedDay}
            feed={feed}
            onScoreChange={owner ? setScore : undefined}
          />
        ) : (
          <p className="py-8">
            {EVENT_TABS.find((t) => t.id === tab)?.label} is not part of this prototype. The Schedule tab is.
          </p>
        )}
      </EventShell>
      <PrototypeControls canSimulate={onCourt.length > 0} onSimulate={simulateBasket} />
    </>
  );
}

const TIMES = [
  ['17:30', 'Before games'],
  ['19:25', 'Games on court'],
  ['21:40', 'Last games'],
  ['22:30', 'All finished'],
  ['live', 'Real clock'],
] as const;

function PrototypeControls({ canSimulate, onSimulate }: { canSimulate: boolean; onSimulate: () => void }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const link = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null) next.delete(key);
    else next.set(key, value);
    return `${pathname}?${next.toString()}`;
  };
  const group = (label: string, key: string, options: readonly (readonly [string | null, string])[]) => (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-24 text-sm font-semibold">{label}</span>
      {options.map(([value, text]) => {
        const active = (params.get(key) ?? null) === value;
        return (
          <Link
            key={text}
            href={link(key, value)}
            scroll={false}
            aria-current={active ? 'true' : undefined}
            className={`inline-flex min-h-11 items-center rounded-sm border px-3 text-sm ${
              active ? 'border-brand-accent bg-brand-accent text-brand-accent-text' : 'border-brand-border bg-brand-bg'
            }`}
          >
            {text}
          </Link>
        );
      })}
    </div>
  );

  return (
    <aside
      id="prototype-controls"
      aria-label="Prototype controls"
      className="border-t-4 border-brand-accent bg-brand-surface px-4 py-6 text-brand-text"
    >
      <div className="mx-auto grid max-w-5xl gap-3">
        <h2 className="text-lg font-semibold">Prototype controls (sample data)</h2>
        {group('Time', 'at', [[null, 'Default (7:25 pm)'], ...TIMES.map(([v, t]) => [v, t] as const)])}
        {group('Courts', 'courts', [
          [null, '2 courts'],
          ['4', '4 courts'],
        ])}
        {group('Colours', 'theme', [
          [null, 'Default event colours'],
          ['light', 'Another organiser'],
        ])}
        {group('Feed', 'feed', [
          [null, 'Live'],
          ['reconnecting', 'Reconnecting'],
        ])}
        {group('Viewer', 'owner', [
          [null, 'Spectator'],
          ['1', 'Event owner (score entry)'],
        ])}
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-24 text-sm font-semibold">Scores</span>
          <button
            type="button"
            onClick={onSimulate}
            disabled={!canSimulate}
            className="inline-flex min-h-11 items-center rounded-sm border border-brand-accent px-3 text-sm font-semibold disabled:opacity-50"
          >
            Simulate a basket
          </button>
          {!canSimulate ? <span className="text-sm text-brand-muted">No game on court at this time.</span> : null}
        </div>
      </div>
    </aside>
  );
}
