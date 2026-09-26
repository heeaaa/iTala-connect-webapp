'use client';
import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { type Game } from '@/domain/types';
import { playoffColour } from '@/lib/color';
import { formatDate, formatDayLabel, formatTime } from '@/lib/format';
import { editorGrid, slotKey } from '@/lib/schedule-grid';
import { deleteGame, saveGame } from '@/server/actions/games';
import { platformStyles as s } from '@/components/platform/platform-frame';
import { ConfirmDialog } from '../../_components/confirm-dialog';
import w from '../../admin-workspace.module.css';

export type ScheduleGame = Game & { id: string };
export interface ScheduleDivision {
  id: string;
  name: string;
  color: string;
  teams: { id: string; name: string }[];
}
export interface ScheduleEvent {
  id: string;
  days: string[];
  timeStart: string;
  timeEnd: string;
  courts: number;
  courtNames: string[];
}

const courtName = (event: ScheduleEvent, court: number) => event.courtNames[court - 1] || `Court ${court}`;

function cardColour(game: Game, divisions: readonly ScheduleDivision[]) {
  const base = divisions.find((d) => d.id === game.divisionId)?.color ?? '#888888';
  return game.type === 'semi' || game.type === 'final' ? playoffColour(base) : base;
}

function GameCard({
  game,
  divisions,
  teamName,
  onEdit,
}: {
  game: ScheduleGame;
  divisions: readonly ScheduleDivision[];
  teamName: (id: string | null) => string;
  onEdit: () => void;
}) {
  const colour = cardColour(game, divisions);
  const matchup = `${teamName(game.team1Id)} vs ${teamName(game.team2Id)}`;
  return (
    <div className={w.gameCard} style={{ borderInlineStartColor: colour, ['--card' as string]: colour }}>
      {game.label && <span className={w.gameLabel}>{game.label}</span>}
      <span>{matchup}</span>
      <button type="button" className={w.gameEdit} onClick={onEdit}>
        Edit<span className="sr-only"> {matchup}</span>
      </button>
    </div>
  );
}

type Draft = {
  id?: string;
  day: string;
  time: string;
  court: number;
  divisionId: string;
  label: string;
  team1Id: string;
  team2Id: string;
  type: Game['type'];
  detach: boolean;
};

function GameDialog({
  event,
  divisions,
  games,
  game,
  onClose,
  onSaved,
}: {
  event: ScheduleEvent;
  divisions: readonly ScheduleDivision[];
  games: readonly ScheduleGame[];
  game: ScheduleGame | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const title = useId();
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => ({
    id: game?.id,
    day: game ? (game.day ?? '') : (event.days[0] ?? ''),
    time: game?.time ?? '',
    court: game?.court ?? 1,
    divisionId: game?.divisionId ?? '',
    label: game?.label ?? '',
    team1Id: game?.team1Id ?? '',
    team2Id: game?.team2Id ?? '',
    type: game?.type ?? 'group',
    detach: false,
  }));
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const teams = divisions.flatMap((d) => d.teams.map((t) => ({ id: t.id, label: `${t.name} (${d.name})` })));
  const inBracket = Boolean(game?.playoff);
  const courts = Array.from({ length: event.courts || 3 }, (_, i) => i + 1);
  const submit = () => {
    setError('');
    if (draft.team1Id && draft.team1Id === draft.team2Id) {
      setError("A team can't play itself. Pick two different teams.");
      return;
    }
    const scheduled = Boolean(draft.day && draft.time);
    const taken =
      scheduled &&
      games.find(
        (g) => g.id !== draft.id && g.day === draft.day && g.time === draft.time && (g.court ?? 1) === draft.court,
      );
    if (taken) {
      setError(
        `That slot (${formatDate(draft.day)} ${formatTime(draft.time)} ${courtName(event, draft.court)}) is already taken.`,
      );
      return;
    }
    start(async () => {
      const result = await saveGame({
        eventId: event.id,
        id: draft.id,
        day: scheduled ? draft.day : null,
        time: scheduled ? draft.time : null,
        court: draft.court,
        divisionId: draft.divisionId || null,
        label: draft.label,
        team1Id: draft.team1Id || null,
        team2Id: draft.team2Id || null,
        type: draft.type,
        detach: draft.detach,
      });
      if (!result.ok) setError(result.error);
      else onSaved(draft.id ? 'Game saved.' : 'Game added.');
    });
  };
  const remove = () =>
    start(async () => {
      const result = await deleteGame(event.id, draft.id!);
      setConfirmDelete(false);
      if (!result.ok) setError(result.error);
      else onSaved('Game deleted.');
    });
  const select = (label: string, value: string, onChange: (v: string) => void, options: [string, string][]) => (
    <label className={w.field}>
      <span className={s.label}>{label}</span>
      <select className={s.input} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <dialog
      ref={ref}
      className={w.dialog}
      aria-labelledby={title}
      onCancel={(e) => {
        e.preventDefault();
        if (!pending) onClose();
      }}
    >
      <h2 id={title}>{game ? 'Edit game' : 'Add game'}</h2>
      <form
        data-keeps-page
        className={w.stack}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className={w.fields}>
          {select('Day', draft.day, (v) => set('day', v), [
            ['', 'Unscheduled'],
            ...event.days.map((d): [string, string] => [d, formatDayLabel(d)]),
          ])}
          <label className={w.field}>
            <span className={s.label}>Time</span>
            <input className={s.input} type="time" value={draft.time} onChange={(e) => set('time', e.target.value)} />
          </label>
          {select(
            'Court',
            String(draft.court),
            (v) => set('court', Number(v)),
            courts.map((c): [string, string] => [String(c), courtName(event, c)]),
          )}
        </div>
        <p className={w.note}>Leave the day or time blank to keep the game Unscheduled.</p>
        <div className={w.fields}>
          {select('Division', draft.divisionId, (v) => set('divisionId', v), [
            ['', 'No division'],
            ...divisions.map((d): [string, string] => [d.id, d.name || 'Untitled division']),
          ])}
          <label className={w.field}>
            <span className={s.label}>Label</span>
            <input
              className={s.input}
              value={draft.label}
              maxLength={120}
              onChange={(e) => set('label', e.target.value)}
            />
          </label>
          {select('Type', draft.type, (v) => set('type', v as Game['type']), [
            ['group', 'Group'],
            ['semi', 'Semi'],
            ['final', 'Final'],
          ])}
        </div>
        <div className={w.fields}>
          {select('Team 1', draft.team1Id, (v) => set('team1Id', v), [
            ['', 'TBD'],
            ...teams.map((t): [string, string] => [t.id, t.label]),
          ])}
          {select('Team 2', draft.team2Id, (v) => set('team2Id', v), [
            ['', 'TBD'],
            ...teams.map((t): [string, string] => [t.id, t.label]),
          ])}
        </div>
        {inBracket && (
          <div className={w.notice}>
            <p>
              This game is part of a playoff bracket. Its teams come from the standings and bracket results, which
              replace any teams picked here.
            </p>
            <label className={w.check}>
              <input type="checkbox" checked={draft.detach} onChange={(e) => set('detach', e.target.checked)} />
              Detach from the bracket and keep the teams picked here
            </label>
          </div>
        )}
        <p role="alert" className={s.formError}>
          {error}
        </p>
        <div className={w.actions}>
          <button type="button" className={`${s.button} ${s.buttonQuiet}`} onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button className={`${s.button} ${s.buttonTeal}`} disabled={pending}>
            {pending ? 'Saving…' : 'Save'}
          </button>
          {game && (
            <button type="button" className={w.danger} onClick={() => setConfirmDelete(true)} disabled={pending}>
              Delete game
            </button>
          )}
        </div>
      </form>
      {confirmDelete && (
        <ConfirmDialog
          title="Delete this game?"
          message="Its score is deleted with it."
          confirmLabel="Delete game"
          pending={pending}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={remove}
        />
      )}
    </dialog>
  );
}

/**
 * Schedule editor for a published event (PRD E-40 to E-50): a grid per day,
 * the Unscheduled row, and the game dialog. Every change is its own saved
 * action (E-05), so the grid always shows what is stored.
 */
export function ScheduleEditor({
  event,
  divisions,
  games,
  onChanged,
}: {
  event: ScheduleEvent;
  divisions: readonly ScheduleDivision[];
  games: readonly ScheduleGame[];
  onChanged: (message: string) => void;
}) {
  const [editing, setEditing] = useState<ScheduleGame | 'new' | null>(null);
  const names = new Map(divisions.flatMap((d) => d.teams.map((t) => [t.id, t.name])));
  const teamName = (id: string | null) => (id ? (names.get(id) ?? 'TBD') : 'TBD');
  const grid = editorGrid(event, games);
  const card = (g: ScheduleGame) => (
    <GameCard key={g.id} game={g} divisions={divisions} teamName={teamName} onEdit={() => setEditing(g)} />
  );
  return (
    <div className={w.stack}>
      <div className={w.actions}>
        <button type="button" className={`${s.button} ${s.buttonQuiet}`} onClick={() => setEditing('new')}>
          + Add game
        </button>
      </div>
      <section aria-label="Unscheduled games" className={w.unscheduled}>
        <h3>
          Unscheduled <span className={w.summaryMeta}>{grid.unscheduled.length}</span>
        </h3>
        {grid.unscheduled.length ? (
          <div className={w.unscheduledList}>{grid.unscheduled.map(card)}</div>
        ) : (
          <p className={w.note}>Drop a game here to clear its time slot.</p>
        )}
      </section>
      {grid.days.map(({ day, times, slots }) => (
        <section key={day} aria-label={formatDayLabel(day)}>
          <h3>{formatDayLabel(day)}</h3>
          <div className={w.matchupScroll} tabIndex={0} role="region" aria-label={`${formatDayLabel(day)} schedule`}>
            <table className={w.scheduleTable}>
              <thead>
                <tr>
                  <th scope="col">Time</th>
                  {Array.from({ length: grid.courts }, (_, i) => (
                    <th key={i} scope="col">
                      {courtName(event, i + 1)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {times.map((time) => (
                  <tr key={time}>
                    <th scope="row">{formatTime(time)}</th>
                    {Array.from({ length: grid.courts }, (_, i) => {
                      const g = slots.get(slotKey(time, i + 1));
                      return (
                        <td key={i}>
                          {g ? (
                            card(g)
                          ) : (
                            <span className={w.emptySlot}>
                              -<span className="sr-only"> free</span>
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      {editing &&
        createPortal(
          <GameDialog
            event={event}
            divisions={divisions}
            games={games}
            game={editing === 'new' ? null : editing}
            onClose={() => setEditing(null)}
            onSaved={(message) => {
              setEditing(null);
              onChanged(message);
            }}
          />,
          document.body,
        )}
    </div>
  );
}
