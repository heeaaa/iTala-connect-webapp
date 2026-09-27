'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { platformStyles as s, TitlePlate } from '@/components/platform/platform-frame';
import { formatDayLabel, formatTime } from '@/lib/format';
import { GROUPS, detailLine, driftLine, resultLine } from '@/lib/mobile-results';
import { approveResult, keepPublishedScore, type ApproveInput } from '@/server/actions/mobile-results';
import type { Inbox, InboxGame, InboxItem } from '@/server/mobile/results';
import { ConfirmDialog } from '../../../_components/confirm-dialog';
import w from '../../../admin-workspace.module.css';

type Result = { ok: true } | { ok: false; error: string };
type Status = { tone: 'done' | 'error'; text: string } | null;

/** "Harbour Hawks vs Night Owls · Sat 27/09/2026 10:00 am · Court 1" (the old fixtureLabel). */
export function fixtureLabel(inbox: Pick<Inbox, 'teamNames' | 'event'>, g: InboxGame) {
  const team = (id: string | null) => (id && inbox.teamNames[id]) || 'TBD';
  const when = g.day ? `${formatDayLabel(g.day)}${g.time ? ` ${formatTime(g.time)}` : ''}` : 'TBD';
  const court = g.court ? ` · ${inbox.event.courtNames[g.court - 1] || `Court ${g.court}`}` : '';
  return `${team(g.team1Id)} vs ${team(g.team2Id)} · ${when}${court}`;
}

const keyOf = (item: InboxItem) => `${item.divisionId}-${item.final.game_id}`;
/** Attach is offered for these only: never for review or settling, which are not results (M-06). */
const ATTACHABLE = new Set(['proposed', 'ambiguous', 'unmatched']);

interface CardProps {
  inbox: Inbox;
  item: InboxItem;
  busy: boolean;
  attachValue: string;
  onApprove: (item: InboxItem, gameId: string, mode: ApproveInput['mode']) => void;
  onKeep: (item: InboxItem) => void;
  onAttach: (item: InboxItem, gameId: string) => void;
}

function ResultCard({ inbox, item, busy, attachValue, onApprove, onKeep, onAttach }: CardProps) {
  const { final: f, result: m } = item;
  const name = resultLine(f);
  const open = ATTACHABLE.has(m.state)
    ? inbox.games.filter((g) => g.divisionId === item.divisionId && !inbox.scored.includes(g.id))
    : [];
  return (
    <li className={w.result}>
      <div className={w.resultText}>
        <p className={w.resultScore}>{name}</p>
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
      {m.state === 'proposed' || m.state === 'drifted' || open.length ? (
        <div className={w.resultControls}>
          {m.state === 'proposed' && m.pick ? (
            <button
              type="button"
              className={`${s.button} ${s.buttonLive}`}
              aria-label={`Approve ${name}`}
              aria-disabled={busy}
              onClick={() => onApprove(item, m.pick!.gameId, 'approve')}
            >
              Approve
            </button>
          ) : null}
          {m.state === 'drifted' && m.existing ? (
            <>
              <button
                type="button"
                className={`${s.button} ${s.buttonLive}`}
                aria-label={`Re-approve ${name}`}
                aria-disabled={busy}
                onClick={() => onApprove(item, m.existing!.gameId, 'reapprove')}
              >
                Re-approve
              </button>
              <button
                type="button"
                className={`${s.button} ${s.buttonQuiet}`}
                aria-label={`Keep published score for ${name}`}
                aria-disabled={busy}
                onClick={() => onKeep(item)}
              >
                Keep published score
              </button>
            </>
          ) : null}
          {open.length ? (
            <select
              className={s.input}
              aria-label={`Attach ${name} to a fixture`}
              value={attachValue}
              onChange={(e) => {
                if (e.currentTarget.value && !busy) onAttach(item, e.currentTarget.value);
              }}
            >
              <option value="">Attach to a fixture…</option>
              {open.map((g) => (
                <option key={g.id} value={g.id}>
                  {fixtureLabel(inbox, g)}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/**
 * The results inbox (PRD M-04 to M-06): the linked leagues' finished games,
 * matched to fixtures and grouped as the old inbox grouped them. Nothing is
 * approved automatically; the server checks every approval again.
 */
export function ResultsView({ inbox, linked = false }: { inbox: Inbox; linked?: boolean }) {
  const router = useRouter();
  const [refreshing, refresh] = useTransition();
  const [busy, run] = useTransition();
  const [status, setStatus] = useState<Status>(null);
  const [attach, setAttach] = useState<{ item: InboxItem; gameId: string } | null>(null);
  const statusLine = useRef<HTMLParagraphElement>(null);
  const idBase = useId();
  // Arriving from the link wizard: the confirmation takes focus so it is read out.
  useEffect(() => {
    if (linked) statusLine.current?.focus();
  }, [linked]);
  const groups = GROUPS.map((g) => ({ ...g, items: inbox.items.filter((i) => i.result.state === g.state) })).filter(
    (g) => g.items.length,
  );

  const act = (task: () => Promise<Result>, done: string) =>
    run(async () => {
      let result: Result;
      try {
        result = await task();
      } catch {
        result = { ok: false, error: 'Could not reach the server. Check your connection.' };
      }
      if (result.ok) {
        setStatus({ tone: 'done', text: done });
        // The card moves to another group; the message takes focus so nothing is lost.
        statusLine.current?.focus();
      } else setStatus({ tone: 'error', text: result.error });
    });

  const approve = (item: InboxItem, gameId: string, mode: ApproveInput['mode']) => {
    if (busy) return;
    const game = inbox.games.find((g) => g.id === gameId);
    act(
      () => approveResult({ eventId: inbox.event.id, mobileGameId: item.final.game_id, gameId, mode }),
      `Approved: ${resultLine(item.final)}${game ? ` on ${fixtureLabel(inbox, game)}` : ''}.`,
    );
  };

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
      <p ref={statusLine} tabIndex={-1} aria-live="polite" className={w.imageStatus} data-tone={status?.tone}>
        {status?.text ?? (linked ? 'Linked. Results for this division will now appear in Pending results.' : '')}
      </p>
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
              <ResultCard
                key={keyOf(item)}
                inbox={inbox}
                item={item}
                busy={busy}
                attachValue={attach && keyOf(attach.item) === keyOf(item) ? attach.gameId : ''}
                onApprove={approve}
                onKeep={(it) => {
                  if (!busy)
                    act(
                      () => keepPublishedScore({ eventId: inbox.event.id, mobileGameId: it.final.game_id }),
                      `Kept the published score. ${resultLine(it.final)} will not be raised again unless it changes.`,
                    );
                }}
                onAttach={(it, gameId) => setAttach({ item: it, gameId })}
              />
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
      {attach ? (
        <ConfirmDialog
          title="Attach this result to the chosen fixture?"
          message={`${resultLine(attach.item.final)} onto ${
            inbox.games.find((g) => g.id === attach.gameId)
              ? fixtureLabel(
                  inbox,
                  inbox.games.find((g) => g.id === attach.gameId)!,
                )
              : 'that fixture'
          }.`}
          confirmLabel="Attach"
          onCancel={() => setAttach(null)}
          onConfirm={() => {
            const { item, gameId } = attach;
            setAttach(null);
            approve(item, gameId, 'attach');
          }}
        />
      ) : null}
    </section>
  );
}
