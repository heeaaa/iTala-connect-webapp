'use client';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from 'react';
import { createPortal } from 'react-dom';
import { Accessibility, Feedback, StyleInjector, defaultPreset } from '@dnd-kit/dom';
import {
  DragDropProvider,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  type DragDropEventHandlers,
} from '@dnd-kit/react';
import { restBreaks } from '@/domain/schedule-edit';
import { type Game } from '@/domain/types';
import { playoffColour } from '@/lib/color';
import { formatDate, formatDayLabel, formatTime } from '@/lib/format';
import {
  applyDrop,
  editorGrid,
  nextTarget,
  ownTarget,
  planDrop,
  slotKey,
  targetId,
  type DropPlan,
  type DropTarget,
  type EditorGrid,
} from '@/lib/schedule-grid';
import { deleteGame, dropGame, saveGame, type DropInput } from '@/server/actions/games';
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

const UNSCHEDULED: DropData = { kind: 'unscheduled', label: 'Unscheduled' };

function GripIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 10 16" width="10" height="16" fill="currentColor">
      {[2, 8, 14].flatMap((y) => [2, 8].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" />))}
    </svg>
  );
}

/**
 * A game card. Its Move button is the drag handle for mouse, touch (press
 * and hold) and keyboard (E-45). Cards in the Unscheduled row are also drop
 * targets, so a scheduled game dropped on one swaps with it; in the grid the
 * cell is the target.
 */
function GameCard({
  game,
  divisions,
  matchup,
  name,
  onEdit,
  droppable,
  locked,
}: {
  game: ScheduleGame;
  divisions: readonly ScheduleDivision[];
  matchup: string;
  /** The matchup with its label, for announcements. */
  name: string;
  onEdit: () => void;
  droppable: boolean;
  locked: boolean;
}) {
  const colour = cardColour(game, divisions);
  const unscheduled = !game.day || !game.time;
  const source = useMemo((): DragData => ({ name, unscheduled }), [name, unscheduled]);
  const drag = useDraggable({ id: game.id, data: source, disabled: locked });
  const target = useMemo(
    (): DropData => ({ kind: 'game', id: game.id, label: `${name}, unscheduled` }),
    [game.id, name],
  );
  const drop = useDroppable({ id: targetId(target), data: target, disabled: !droppable });
  const { ref: dragRef, handleRef } = drag;
  const { ref: dropRef } = drop;
  const ref = useCallback(
    (element: Element | null) => {
      dragRef(element);
      dropRef(element);
    },
    [dragRef, dropRef],
  );
  return (
    <div
      ref={ref}
      data-game={game.id}
      data-drop-target={drop.isDropTarget || undefined}
      className={w.gameCard}
      style={{ borderInlineStartColor: colour, ['--card' as string]: colour }}
    >
      {game.label && <span className={w.gameLabel}>{game.label}</span>}
      <span>{matchup}</span>
      <div className={w.gameActions}>
        <button ref={handleRef} type="button" className={w.gameMove} data-move={game.id}>
          <GripIcon />
          Move<span className="sr-only"> {matchup}</span>
        </button>
        <button type="button" className={w.gameEdit} onClick={onEdit} disabled={locked}>
          Edit<span className="sr-only"> {matchup}</span>
        </button>
      </div>
    </div>
  );
}

/** A grid cell: the drop target for its day, time and court, empty or not. */
function SlotCell({
  day,
  time,
  court,
  label,
  occupantId,
  children,
}: {
  day: string;
  time: string;
  court: number;
  label: string;
  occupantId: string | undefined;
  children: ReactNode;
}) {
  const target = useMemo(
    (): DropData => ({ kind: 'slot', day, time, court, label, occupantId }),
    [day, time, court, label, occupantId],
  );
  const { ref, isDropTarget } = useDroppable({ id: targetId(target), data: target });
  return (
    <td ref={ref} data-drop-target={isDropTarget || undefined}>
      {children}
    </td>
  );
}

function UnscheduledRow({ count, children }: { count: number; children: ReactNode }) {
  // Low priority, so a card inside the row wins when the pointer is over it.
  const { ref, isDropTarget } = useDroppable({ id: targetId(UNSCHEDULED), data: UNSCHEDULED, collisionPriority: 1 });
  return (
    <section
      ref={ref}
      aria-label="Unscheduled games"
      data-drop-target={isDropTarget || undefined}
      className={w.unscheduled}
    >
      <h3>
        Unscheduled <span className={w.summaryMeta}>{count}</span>
      </h3>
      {children}
    </section>
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

/** Draggable data: what the screen reader announcements need about the game. */
type DragData = { name: string; unscheduled: boolean };
/** Droppable data: the target plus how it is announced. */
type DropData = DropTarget & { label: string; occupantId?: string };

type Status = { tone: 'done' | 'warning' | 'error'; lines: string[]; gameId: string };

/** Tab cancels a keyboard drag instead of dropping (dnd-kit's default), so leaving the grid never moves a game. */
const SENSORS = [
  PointerSensor,
  KeyboardSensor.configure({
    keyboardCodes: { ...KeyboardSensor.defaults.keyboardCodes, end: ['Space', 'Enter'], cancel: ['Escape', 'Tab'] },
  }),
];

/**
 * The nonce of the page's own Content-Security-Policy, for the styles
 * dnd-kit injects while dragging. It comes from the document's scripts, not
 * from props: the proxy mints a fresh nonce for every request, including
 * the RSC fetches of client-side navigations and Server Action refreshes,
 * while the page keeps the policy it loaded with.
 */
function documentNonce() {
  if (typeof document === 'undefined') return undefined;
  const script = document.querySelector<HTMLScriptElement>('script[nonce]');
  return script?.nonce || script?.getAttribute('nonce') || undefined;
}

const INSTRUCTIONS =
  'To move this game, press Space or Enter, use the arrow keys to choose a slot, then press Space or Enter to drop it there. Press Escape to cancel.';

type Handlers = DragDropEventHandlers;
const dragData = (source: { data: unknown } | null | undefined) => source?.data as DragData | undefined;
const dropData = (target: { data: unknown } | null | undefined) => target?.data as DropData | undefined;
/** Whether dropping here leaves the game where it is (its own slot or card, or one unscheduled game on another). */
const staysPut = (source: { id: unknown; data: unknown }, target: DropData) =>
  target.occupantId === source.id ||
  (target.kind === 'game' && target.id === source.id) ||
  (dragData(source)?.unscheduled === true && (target.kind === 'game' || target.kind === 'unscheduled'));

/** NZ English announcements for the dnd-kit live region, built only from drag and drop data. */
const announcements = {
  dragstart: ({ operation: { source } }: Parameters<Handlers['onDragStart']>[0]) =>
    source ? `Picked up ${dragData(source)?.name}.` : undefined,
  dragover: ({ operation: { source, target } }: Parameters<Handlers['onDragOver']>[0]) => {
    const data = dropData(target);
    if (!source) return undefined;
    if (!data) return `${dragData(source)?.name} is not over a slot.`;
    if (staysPut(source, data)) return `${data.label}. It stays where it is.`;
    if (data.kind === 'unscheduled') return `${data.label}. Drop to clear its time slot.`;
    return `${data.label}. ${data.occupantId || data.kind === 'game' ? 'Drop to swap.' : 'Drop to move here.'}`;
  },
  dragend: ({ operation: { source, target }, canceled }: Parameters<Handlers['onDragEnd']>[0]) => {
    const data = dropData(target);
    if (!source) return undefined;
    const name = dragData(source)?.name;
    if (canceled) return `Move cancelled. ${name} stays where it was.`;
    if (!data || staysPut(source, data)) return `${name} stays where it was.`;
    return `Dropped ${name} on ${data.label}. Saving.`;
  },
};

function dropInput(eventId: string, plan: DropPlan<ScheduleGame>): DropInput {
  if (plan.kind === 'move')
    return { kind: 'move', eventId, gameId: plan.game.id, day: plan.day, time: plan.time, court: plan.court };
  const slot = (g: Game) => ({ day: g.day, time: g.time, court: g.court });
  if (plan.kind === 'swap')
    return {
      kind: 'swap',
      eventId,
      gameId: plan.game.id,
      otherId: plan.other.id,
      gameSlot: slot(plan.game),
      otherSlot: slot(plan.other),
    };
  return { kind: 'unschedule', eventId, gameId: plan.game.id };
}

/**
 * Schedule editor for a published event (PRD E-40 to E-50): a grid per day,
 * the Unscheduled row, the game dialog and drag and drop (E-45). Every
 * change is its own saved action (E-05), so the grid always shows what is
 * stored; a drop shows at once and settles when the save returns.
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
  const [shown, showDrop] = useOptimistic(games, (current: readonly ScheduleGame[], plan: DropPlan<ScheduleGame>) =>
    applyDrop(current, plan),
  );
  const [saving, startDrop] = useTransition();
  const [status, setStatus] = useState<Status | null>(null);
  /** A keyboard move's current target; null while the pointer drives. */
  const keyboard = useRef<DropTarget | null>(null);
  /** After a keyboard drop the card re-renders in its new cell; its Move button takes focus back. */
  const refocus = useRef<string | null>(null);
  const names = new Map(divisions.flatMap((d) => d.teams.map((t) => [t.id, t.name])));
  const teamName = (id: string | null) => (id ? (names.get(id) ?? 'TBD') : 'TBD');
  const matchup = (g: Game) => `${teamName(g.team1Id)} vs ${teamName(g.team2Id)}`;
  const gameName = (g: Game) => (g.label ? `${matchup(g)} (${g.label})` : matchup(g));
  const slotName = (day: string, time: string, court: number) =>
    `${formatDayLabel(day)} ${formatTime(time)}, ${courtName(event, court)}`;
  const grid: EditorGrid<ScheduleGame> = editorGrid(event, shown);

  const plugins = useMemo(
    () => [
      ...defaultPreset.plugins,
      Accessibility.configure({ announcements, screenReaderInstructions: { draggable: INSTRUCTIONS } }),
      // Platform screens allow no motion beyond colour transitions (DESIGN.md), so a card lands without animating.
      Feedback.configure({ dropAnimation: null, keyboardTransition: null }),
      StyleInjector.configure({ nonce: documentNonce() }),
    ],
    [],
  );

  const moveButton = (id: string) => document.querySelector<HTMLElement>(`[data-move="${CSS.escape(id)}"]`);
  /** Focus lost with the re-rendered card lands on the page itself; only then does it go back to the Move button. */
  const focusLost = () => !document.activeElement || document.activeElement === document.body;
  const focusMove = (id: string) => {
    if (focusLost()) moveButton(id)?.focus();
  };
  useEffect(() => {
    const id = refocus.current;
    if (!id) return;
    // Once the organiser has moved focus elsewhere, stop following the card.
    if (!focusLost() && document.activeElement !== moveButton(id)) refocus.current = null;
    else focusMove(id);
    if (!saving) refocus.current = null;
  });

  const commit = (plan: DropPlan<ScheduleGame>) => {
    const after = applyDrop(shown, plan);
    const moved = plan.kind === 'swap' ? [plan.game.id, plan.other.id] : [plan.game.id];
    const warnings = restBreaks(shown, after, moved).map(
      (b) =>
        `Rest warning: ${teamName(b.teamId)} now play at ${formatTime(b.times[0])} and ${formatTime(b.times[1])} on ${formatDayLabel(b.day)}, less than 2 hours apart.`,
    );
    const done =
      plan.kind === 'move'
        ? `Moved ${gameName(plan.game)} to ${slotName(plan.day, plan.time, plan.court)}.`
        : plan.kind === 'swap'
          ? `Swapped ${gameName(plan.game)} and ${gameName(plan.other)}.`
          : `Moved ${gameName(plan.game)} to Unscheduled.`;
    startDrop(async () => {
      showDrop(plan);
      let result: Awaited<ReturnType<typeof dropGame>>;
      try {
        result = await dropGame(dropInput(event.id, plan));
      } catch {
        // Offline or the server could not be reached: the card goes back.
        result = { ok: false, error: 'Could not reach the server, so the game was not moved. Check your connection.' };
      }
      setStatus(
        result.ok
          ? { tone: warnings.length ? 'warning' : 'done', lines: [done, ...warnings], gameId: plan.game.id }
          : { tone: 'error', lines: [result.error], gameId: plan.game.id },
      );
    });
  };

  const onDragStart: Handlers['onDragStart'] = (e, manager) => {
    const game = shown.find((g) => g.id === e.operation.source?.id);
    keyboard.current = e.nativeEvent instanceof KeyboardEvent && game ? ownTarget(game) : null;
    if (keyboard.current) void manager.actions.setDropTarget(targetId(keyboard.current));
  };
  // Keyboard moves step from cell to cell (nextTarget) instead of nudging
  // the card a few pixels, so collisions are left out of keyboard drags.
  const onCollision: Handlers['onCollision'] = (e, manager) => {
    if (manager.dragOperation.activatorEvent instanceof KeyboardEvent) e.preventDefault();
  };
  const onDragMove: Handlers['onDragMove'] = (e, manager) => {
    if (!keyboard.current || !(e.nativeEvent instanceof KeyboardEvent) || !e.by) return;
    e.preventDefault();
    const { x, y } = e.by;
    const next = nextTarget(grid, keyboard.current, y < 0 ? 'up' : y > 0 ? 'down' : x < 0 ? 'left' : 'right');
    keyboard.current = next;
    const element = manager.registry.droppables.get(targetId(next))?.element;
    if (!element) return;
    element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const box = element.getBoundingClientRect();
    void manager.actions.setDropTarget(targetId(next));
    manager.actions.move({ to: { x: box.left + box.width / 2, y: box.top + box.height / 2 }, propagate: false });
  };
  const onDragEnd: Handlers['onDragEnd'] = (e, manager) => {
    const byKeyboard = keyboard.current !== null;
    keyboard.current = null;
    const id = String(e.operation.source?.id ?? '');
    const plan = e.canceled ? null : planDrop(grid, shown, id, dropData(e.operation.target) ?? null);
    if (byKeyboard) {
      // dnd-kit only restores focus after a drop animation, and this page has
      // none, so the Move button takes it back once dnd-kit has put the card
      // back in the page; a saved move keeps following the card through the
      // renders that follow.
      if (plan) refocus.current = id;
      const settle = (frames: number) =>
        requestAnimationFrame(() =>
          manager.dragOperation.status.idle || frames > 30 ? focusMove(id) : settle(frames + 1),
        );
      settle(0);
    }
    if (plan) commit(plan);
  };

  const card = (g: ScheduleGame, droppable: boolean) => (
    <GameCard
      key={g.id}
      game={g}
      divisions={divisions}
      matchup={matchup(g)}
      name={gameName(g)}
      droppable={droppable}
      locked={saving}
      onEdit={() => setEditing(g)}
    />
  );
  return (
    <DragDropProvider
      plugins={plugins}
      sensors={SENSORS}
      onDragStart={onDragStart}
      onCollision={onCollision}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
    >
      <div className={w.stack}>
        <div className={w.actions}>
          <button type="button" className={`${s.button} ${s.buttonQuiet}`} onClick={() => setEditing('new')}>
            + Add game
          </button>
        </div>
        <p className={w.note}>
          Drag a game by its Move button to swap it with another game, move it to a free slot, or drop it on
          Unscheduled. Each move saves straight away.
        </p>
        <UnscheduledRow count={grid.unscheduled.length}>
          {grid.unscheduled.length ? (
            <div className={w.unscheduledList}>{grid.unscheduled.map((g) => card(g, true))}</div>
          ) : (
            <p className={w.note}>Drop a game here to clear its time slot.</p>
          )}
        </UnscheduledRow>
        {grid.days.map(({ day, times, slots }) => (
          <section key={day} aria-label={formatDayLabel(day)}>
            <h3>{formatDayLabel(day)}</h3>
            <div
              className={`${w.matchupScroll} ${w.scheduleScroll}`}
              tabIndex={0}
              role="region"
              aria-label={`${formatDayLabel(day)} schedule`}
            >
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
                          <SlotCell
                            key={i}
                            day={day}
                            time={time}
                            court={i + 1}
                            label={`${slotName(day, time, i + 1)}, ${g ? gameName(g) : 'free'}`}
                            occupantId={g?.id}
                          >
                            {g ? (
                              card(g, false)
                            ) : (
                              <span className={w.emptySlot}>
                                -<span className="sr-only"> free</span>
                              </span>
                            )}
                          </SlotCell>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
        <div className={saving || status ? w.scheduleStatus : undefined} data-tone={saving ? 'done' : status?.tone}>
          <p aria-live="polite" className={w.scheduleStatusText}>
            {saving ? 'Saving…' : status?.lines.map((line) => <span key={line}>{line}</span>)}
          </p>
          {status && !saving && (
            <button
              type="button"
              className={w.gameEdit}
              onClick={() => {
                // Focus goes back to the game the notice is about, not to the page.
                moveButton(status.gameId)?.focus();
                setStatus(null);
              }}
            >
              Dismiss
            </button>
          )}
        </div>
        {editing &&
          createPortal(
            <GameDialog
              event={event}
              divisions={divisions}
              games={shown}
              game={editing === 'new' ? null : editing}
              onClose={() => setEditing(null)}
              onSaved={(message) => {
                setEditing(null);
                setStatus(null);
                onChanged(message);
              }}
            />,
            document.body,
          )}
      </div>
    </DragDropProvider>
  );
}
