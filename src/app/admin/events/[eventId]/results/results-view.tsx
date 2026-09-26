'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useTransition } from 'react';
import { platformStyles as s, TitlePlate } from '@/components/platform/platform-frame';
import { formatDayLabel, formatTime } from '@/lib/format';
import { GROUPS, detailLine, driftLine, resultLine } from '@/lib/mobile-results';
import type { Inbox, InboxGame, InboxItem } from '@/server/mobile/results';
import w from '../../../admin-workspace.module.css';

/** "Harbour Hawks vs Night Owls · Sat 27/09/2026 10:00 am · Court 1" (the old fixtureLabel). */
export function fixtureLabel(inbox: Pick<Inbox, 'teamNames' | 'event'>, g: InboxGame) {
  const team = (id: string | null) => (id && inbox.teamNames[id]) || 'TBD';
  const when = g.day ? `${formatDayLabel(g.day)}${g.time ? ` ${formatTime(g.time)}` : ''}` : 'TBD';
  const court = g.court ? ` · ${inbox.event.courtNames[g.court - 1] || `Court ${g.court}`}` : '';
  return `${team(g.team1Id)} vs ${team(g.team2Id)} · ${when}${court}`;
}

function ResultCard({ inbox, item }: { inbox: Inbox; item: InboxItem }) {
  const { final: f, result: m } = item;
  return (
    <li className={w.result}>
      <div className={w.resultText}>
        <p className={w.resultScore}>{resultLine(f)}</p>
        <p className={w.note}>{detailLine(f, inbox.event.timezone)}</p>
        {m.state === 'proposed' && m.pick ? (
          <p className={w.note}>
            Fixture: {fixtureLabel(inbox, m.pick.game)}
            {m.pick.sameDay ? '' : '. Note: a different day'}
          </p>
        ) : null}
        {m.state === 'drifted' && item.published ? <p className={w.note}>{driftLine(item.published, f)}</p> : null}
        {m.reason ? <p className={w.note}>{m.reason[0]!.toUpperCase() + m.reason.slice(1)}.</p> : null}
      </div>
    </li>
  );
}

/**
 * The results inbox (PRD M-04, M-05): the linked leagues' finished games,
 * matched to fixtures and grouped as the old inbox grouped them. Nothing is
 * approved automatically.
 */
export function ResultsView({ inbox }: { inbox: Inbox }) {
  const router = useRouter();
  const [refreshing, refresh] = useTransition();
  const idBase = useId();
  const groups = GROUPS.map((g) => ({ ...g, items: inbox.items.filter((i) => i.result.state === g.state) })).filter(
    (g) => g.items.length,
  );
  return (
    <section aria-labelledby={`${idBase}-title`}>
      <TitlePlate id={`${idBase}-title`} title="Pending results" sub={inbox.event.name} />
      <div className={w.actions}>
        <button
          type="button"
          className={`${s.button} ${s.buttonQuiet}`}
          aria-disabled={refreshing}
          onClick={() => {
            if (!refreshing) refresh(() => router.refresh());
          }}
        >
          {refreshing ? 'Reading the mobile app…' : 'Refresh'}
        </button>
        <Link href={`/admin/events/${inbox.event.id}`} className={`${s.button} ${s.buttonQuiet}`}>
          Back to event
        </Link>
      </div>
      {inbox.divisions.length ? (
        <p className={w.note}>
          Linked: {inbox.divisions.map((d) => `${d.name} (${d.leagueName || 'mobile league'})`).join(', ')}.
        </p>
      ) : null}
      {inbox.notice ? (
        <p role="status" className={w.notice}>
          {inbox.notice}
        </p>
      ) : null}
      {inbox.errors.map((e) => (
        <p key={e} role="alert" className={s.error}>
          {e}
        </p>
      ))}
      {groups.map((g) => (
        <section key={g.state} aria-labelledby={`${idBase}-${g.state}`} className={w.section}>
          <h2 id={`${idBase}-${g.state}`}>
            {g.title} ({g.items.length})
          </h2>
          <ul className={w.resultList}>
            {g.items.map((item) => (
              <ResultCard key={`${item.divisionId}-${item.final.game_id}`} inbox={inbox} item={item} />
            ))}
          </ul>
        </section>
      ))}
      {!groups.length && !inbox.notice && !inbox.errors.length ? (
        <div className={w.section}>
          <h2>Nothing waiting</h2>
          <p className={w.note}>No finished games in the linked leagues.</p>
        </div>
      ) : null}
    </section>
  );
}
