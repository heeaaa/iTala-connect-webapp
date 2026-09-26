import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// jsdom cannot run a real drag (no layout, no popover), so dnd-kit's React
// layer is replaced by a provider that captures its handlers. The tests hand
// it the drop events dnd-kit would send and check what the organiser sees.
// Real mouse, touch and keyboard dragging is proven in Chromium (Playwright).
type Handler = (event: unknown, manager?: unknown) => void;
const dnd = vi.hoisted(() => ({ handlers: {} as Record<string, Handler> }));
vi.mock('@dnd-kit/react', async (real) => ({
  ...(await real<object>()),
  DragDropProvider: ({ children, ...handlers }: { children: unknown } & Record<string, Handler>) => {
    Object.assign(dnd.handlers, handlers);
    return children;
  },
  useDraggable: () => ({ ref: () => {}, handleRef: () => {}, isDragging: false }),
  useDroppable: () => ({ ref: () => {}, isDropTarget: false }),
}));
const fake = vi.hoisted(() => ({ drop: vi.fn(), save: vi.fn(), changed: vi.fn() }));
vi.mock('@/server/actions/games', () => ({ saveGame: fake.save, deleteGame: vi.fn(), dropGame: fake.drop }));
import { ScheduleEditor, type ScheduleDivision, type ScheduleGame } from '@/app/admin/events/[eventId]/schedule-editor';
import { type DropTarget } from '@/lib/schedule-grid';

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const SAT = '2026-10-03';
const event = { id: uuid(1), days: [SAT], timeStart: '09:00', timeEnd: '14:00', courts: 2, courtNames: [] };
const team = (n: number, name: string) => ({ id: uuid(100 + n), name });
const divisions: ScheduleDivision[] = [
  { id: uuid(10), name: 'Open', color: '#6C63FF', teams: [team(1, 'Hawks'), team(2, 'Owls'), team(3, 'Kea')] },
];
const game = (n: number, time: string | null, court: number | null, t1: number, t2: number): ScheduleGame => ({
  id: uuid(200 + n),
  day: time ? SAT : null,
  time,
  court,
  divisionId: uuid(10),
  groupId: null,
  team1Id: uuid(100 + t1),
  team2Id: uuid(100 + t2),
  label: 'Open',
  type: 'group',
  score1: null,
  score2: null,
});
// Hawks v Owls at 9:00, Hawks v Kea at 13:00, Owls v Kea unscheduled.
const games = [game(1, '09:00', 1, 1, 2), game(2, '13:00', 2, 1, 3), game(3, null, null, 2, 3)];

const cell = (time: string, court: number) => {
  const table = screen.getByRole('region', { name: 'Sat 03/10/2026 schedule' });
  const row = within(table)
    .getAllByRole('row')
    .find((r) => within(r).queryByRole('rowheader')?.textContent === time)!;
  return within(row).getAllByRole('cell')[court - 1]!;
};
const slot = (time: string, court: number): DropTarget => ({ kind: 'slot', day: SAT, time, court });
const drop = (gameId: string, target: DropTarget | null, canceled = false, manager?: unknown) =>
  act(() =>
    dnd.handlers.onDragEnd!(
      { canceled, operation: { source: { id: gameId }, target: target && { data: target } } },
      manager,
    ),
  );
const deferred = () => {
  let resolve!: (v: unknown) => void;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};
const status = () => screen.getByText((_, el) => el?.getAttribute('aria-live') === 'polite');
const renderGrid = (list = games) =>
  render(<ScheduleEditor event={event} divisions={divisions} games={list} onChanged={fake.changed} />);

beforeEach(() => {
  vi.clearAllMocks();
  fake.drop.mockResolvedValue({ ok: true, data: undefined });
  fake.save.mockResolvedValue({ ok: true, data: { id: uuid(201) } });
});

describe('dropping games (E-45)', () => {
  it('moves a game to a free cell at once, saves it, then reports the move', async () => {
    const pending = deferred();
    fake.drop.mockReturnValue(pending.promise);
    const view = renderGrid();
    await drop(uuid(201), slot('10:00', 1));
    expect(cell('10:00 am', 1)).toHaveTextContent('Hawks vs Owls');
    expect(cell('9:00 am', 1)).toHaveTextContent('- free');
    expect(status()).toHaveTextContent('Saving…');
    expect(fake.drop).toHaveBeenCalledWith({
      kind: 'move',
      eventId: uuid(1),
      gameId: uuid(201),
      day: SAT,
      time: '10:00',
      court: 1,
    });
    // The action's revalidation brings the stored schedule with its result.
    view.rerender(
      <ScheduleEditor
        event={event}
        divisions={divisions}
        games={[game(1, '10:00', 1, 1, 2), games[1]!, games[2]!]}
        onChanged={fake.changed}
      />,
    );
    await act(async () => pending.resolve({ ok: true, data: undefined }));
    expect(status()).toHaveTextContent('Moved Hawks vs Owls (Open) to Sat 03/10/2026 10:00 am, Court 1.');
    expect(cell('10:00 am', 1)).toHaveTextContent('Hawks vs Owls');
    expect(fake.changed).not.toHaveBeenCalled();
  });

  it('swaps with a game, unschedules on the Unscheduled row, and swaps an unscheduled game in', async () => {
    renderGrid();
    await drop(uuid(201), slot('13:00', 2));
    expect(fake.drop).toHaveBeenLastCalledWith({
      kind: 'swap',
      eventId: uuid(1),
      gameId: uuid(201),
      otherId: uuid(202),
      gameSlot: { day: SAT, time: '09:00', court: 1 },
      otherSlot: { day: SAT, time: '13:00', court: 2 },
    });
    expect(status()).toHaveTextContent('Swapped Hawks vs Owls (Open) and Hawks vs Kea (Open).');
    await drop(uuid(202), { kind: 'unscheduled' });
    expect(fake.drop).toHaveBeenLastCalledWith({ kind: 'unschedule', eventId: uuid(1), gameId: uuid(202) });
    expect(status()).toHaveTextContent('Moved Hawks vs Kea (Open) to Unscheduled.');
    await drop(uuid(203), slot('09:00', 1));
    expect(fake.drop).toHaveBeenLastCalledWith({
      kind: 'swap',
      eventId: uuid(1),
      gameId: uuid(203),
      otherId: uuid(201),
      gameSlot: { day: null, time: null, court: null },
      otherSlot: { day: SAT, time: '09:00', court: 1 },
    });
  });

  it('warns, without refusing, when a move leaves a team under two hours of rest', async () => {
    renderGrid();
    await drop(uuid(202), slot('10:00', 2));
    expect(fake.drop).toHaveBeenCalled();
    expect(status()).toHaveTextContent(
      'Moved Hawks vs Kea (Open) to Sat 03/10/2026 10:00 am, Court 2.' +
        'Rest warning: Hawks now play at 9:00 am and 10:00 am on Sat 03/10/2026, less than 2 hours apart.',
    );
    expect(status().parentElement).toHaveAttribute('data-tone', 'warning');
  });

  it('puts the game back and says why when the save is refused, and the notice can be dismissed', async () => {
    const user = userEvent.setup();
    fake.drop.mockResolvedValue({ ok: false, error: 'That slot (03/10/2026 10:00 am Court 1) is already taken.' });
    renderGrid();
    await drop(uuid(201), slot('10:00', 1));
    expect(cell('9:00 am', 1)).toHaveTextContent('Hawks vs Owls');
    expect(cell('10:00 am', 1)).toHaveTextContent('- free');
    expect(status()).toHaveTextContent('That slot (03/10/2026 10:00 am Court 1) is already taken.');
    expect(status().parentElement).toHaveAttribute('data-tone', 'error');
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(status()).toHaveTextContent('');
    expect(document.activeElement).toBe(within(cell('9:00 am', 1)).getByRole('button', { name: /^Move/ }));
    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument();
  });

  it('locks Edit while a drop saves, and a dialog save clears the drop notice', async () => {
    const user = userEvent.setup();
    const pending = deferred();
    fake.drop.mockReturnValue(pending.promise);
    renderGrid();
    await drop(uuid(201), slot('10:00', 1));
    expect(within(cell('10:00 am', 1)).getByRole('button', { name: /^Edit/ })).toBeDisabled();
    await act(async () => pending.resolve({ ok: true, data: undefined }));
    expect(status()).toHaveTextContent('Moved Hawks vs Owls (Open)');
    await user.click(within(cell('9:00 am', 1)).getByRole('button', { name: /^Edit/ }));
    await user.click(within(screen.getByRole('dialog', { name: 'Edit game' })).getByRole('button', { name: 'Save' }));
    expect(fake.changed).toHaveBeenCalledWith('Game saved.');
    expect(status()).toHaveTextContent('');
  });

  it('gives dnd-kit the nonce of the page it loaded with, not a later request', () => {
    const script = document.createElement('script');
    script.setAttribute('nonce', 'page-load-nonce');
    document.head.append(script);
    try {
      renderGrid();
      const plugins = (dnd.handlers as Record<string, unknown>).plugins as { options?: { nonce?: string } }[];
      expect(plugins.some((p) => p.options?.nonce === 'page-load-nonce')).toBe(true);
    } finally {
      script.remove();
    }
  });

  it('puts the game back when the server cannot be reached', async () => {
    fake.drop.mockRejectedValue(new TypeError('Failed to fetch'));
    renderGrid();
    await drop(uuid(201), slot('10:00', 1));
    expect(cell('9:00 am', 1)).toHaveTextContent('Hawks vs Owls');
    expect(status()).toHaveTextContent('Could not reach the server, so the game was not moved. Check your connection.');
    expect(status().parentElement).toHaveAttribute('data-tone', 'error');
  });

  it('does nothing for a cancelled drag, its own slot, no target, or two unscheduled games', async () => {
    renderGrid([...games, game(4, null, null, 1, 2)]);
    await drop(uuid(201), slot('10:00', 1), true);
    await drop(uuid(201), slot('09:00', 1));
    await drop(uuid(201), null);
    await drop(uuid(203), { kind: 'game', id: uuid(204) });
    expect(fake.drop).not.toHaveBeenCalled();
    expect(screen.queryByText('Saving…')).not.toBeInTheDocument();
  });
});

describe('keyboard drags (E-45)', () => {
  const manager = (activatorEvent: Event | null = new KeyboardEvent('keydown')) => ({
    actions: { setDropTarget: vi.fn(async () => false), move: vi.fn() },
    registry: { droppables: { get: () => ({ element: document.createElement('td') }) } },
    dragOperation: { activatorEvent, status: { idle: true } },
  });
  const arrow = (by: { x: number; y: number }, nativeEvent: Event = new KeyboardEvent('keydown')) => ({
    nativeEvent,
    by,
    preventDefault: vi.fn(),
  });

  it('starts on the game, steps cell by cell with the arrow keys, and keeps collisions out', () => {
    renderGrid();
    const m = manager();
    act(() =>
      dnd.handlers.onDragStart!(
        { nativeEvent: new KeyboardEvent('keydown'), operation: { source: { id: uuid(201) } } },
        m,
      ),
    );
    expect(m.actions.setDropTarget).toHaveBeenLastCalledWith(`slot:${SAT}|09:00|1`);
    const down = arrow({ x: 0, y: 10 });
    act(() => dnd.handlers.onDragMove!(down, m));
    expect(down.preventDefault).toHaveBeenCalled();
    expect(m.actions.setDropTarget).toHaveBeenLastCalledWith(`slot:${SAT}|10:00|1`);
    expect(m.actions.move).toHaveBeenLastCalledWith({ to: { x: 0, y: 0 }, propagate: false });
    act(() => dnd.handlers.onDragMove!(arrow({ x: 10, y: 0 }), m));
    expect(m.actions.setDropTarget).toHaveBeenLastCalledWith(`slot:${SAT}|10:00|2`);
    act(() => dnd.handlers.onDragMove!(arrow({ x: -10, y: 0 }), m));
    act(() => dnd.handlers.onDragMove!(arrow({ x: 0, y: -10 }), m));
    act(() => dnd.handlers.onDragMove!(arrow({ x: 0, y: -10 }), m));
    expect(m.actions.setDropTarget).toHaveBeenLastCalledWith('unscheduled');
    const collision = { preventDefault: vi.fn() };
    dnd.handlers.onCollision!(collision, m);
    expect(collision.preventDefault).toHaveBeenCalled();
  });

  it('leaves pointer drags to dnd-kit', () => {
    renderGrid();
    const m = manager(new Event('pointerdown'));
    act(() =>
      dnd.handlers.onDragStart!({ nativeEvent: new Event('pointerdown'), operation: { source: { id: uuid(201) } } }, m),
    );
    const move = arrow({ x: 0, y: 10 }, new Event('pointermove'));
    dnd.handlers.onDragMove!(move, m);
    expect(move.preventDefault).not.toHaveBeenCalled();
    const collision = { preventDefault: vi.fn() };
    dnd.handlers.onCollision!(collision, m);
    expect(collision.preventDefault).not.toHaveBeenCalled();
    expect(m.actions.setDropTarget).not.toHaveBeenCalled();
  });

  it('never pulls focus back from where the organiser moved it while the save runs', async () => {
    const pending = deferred();
    fake.drop.mockReturnValue(pending.promise);
    const view = renderGrid();
    const m = manager();
    act(() =>
      dnd.handlers.onDragStart!(
        { nativeEvent: new KeyboardEvent('keydown'), operation: { source: { id: uuid(201) } } },
        m,
      ),
    );
    await drop(uuid(201), slot('10:00', 1), false, m);
    expect(document.activeElement).toBe(within(cell('10:00 am', 1)).getByRole('button', { name: /^Move/ }));
    const elsewhere = screen.getByRole('button', { name: '+ Add game' });
    elsewhere.focus();
    // The event editor re-renders (for example while the organiser types) during the save.
    view.rerender(
      <ScheduleEditor event={{ ...event }} divisions={divisions} games={[...games]} onChanged={fake.changed} />,
    );
    expect(document.activeElement).toBe(elsewhere);
    await act(async () => pending.resolve({ ok: false, error: 'Could not move the game.' }));
    expect(document.activeElement).toBe(elsewhere);
  });

  it('gives focus back to the Move button when a keyboard drag is cancelled', async () => {
    renderGrid();
    const m = manager();
    act(() =>
      dnd.handlers.onDragStart!(
        { nativeEvent: new KeyboardEvent('keydown'), operation: { source: { id: uuid(202) } } },
        m,
      ),
    );
    await drop(uuid(202), slot('10:00', 1), true, m);
    await act(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    expect(document.activeElement).toBe(within(cell('1:00 pm', 2)).getByRole('button', { name: /^Move/ }));
    expect(fake.drop).not.toHaveBeenCalled();
  });

  it('keeps focus on the moved game after a keyboard drop, in its new cell and if it goes back', async () => {
    const pending = deferred();
    fake.drop.mockReturnValue(pending.promise);
    renderGrid();
    const m = manager();
    act(() =>
      dnd.handlers.onDragStart!(
        { nativeEvent: new KeyboardEvent('keydown'), operation: { source: { id: uuid(201) } } },
        m,
      ),
    );
    act(() => dnd.handlers.onDragMove!(arrow({ x: 0, y: 10 }), m));
    await drop(uuid(201), slot('10:00', 1), false, m);
    // The card re-renders in its new cell; its Move button has focus there.
    expect(document.activeElement).toBe(within(cell('10:00 am', 1)).getByRole('button', { name: /^Move/ }));
    await act(async () => pending.resolve({ ok: false, error: 'Could not move the game.' }));
    // Refused: the card goes back, and focus goes with it.
    expect(document.activeElement).toBe(within(cell('9:00 am', 1)).getByRole('button', { name: /^Move/ }));
  });
});
