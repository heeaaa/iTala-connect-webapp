import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const fake = vi.hoisted(() => ({ save: vi.fn(), remove: vi.fn(), changed: vi.fn() }));
vi.mock('@/server/actions/games', () => ({ saveGame: fake.save, deleteGame: fake.remove }));
import { ScheduleEditor, type ScheduleDivision, type ScheduleGame } from '@/app/admin/events/[eventId]/schedule-editor';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const event = {
  id: uuid(1),
  days: ['2026-10-03'],
  timeStart: '09:00',
  timeEnd: '11:00',
  courts: 2,
  courtNames: ['Court 1', 'West court'],
};
const divisions: ScheduleDivision[] = [
  {
    id: uuid(10),
    name: 'Open',
    color: '#6C63FF',
    teams: [
      { id: uuid(101), name: 'Hawks' },
      { id: uuid(102), name: 'Owls' },
    ],
  },
];
const game = (n: number, extra: Partial<ScheduleGame> = {}): ScheduleGame => ({
  id: uuid(200 + n),
  day: '2026-10-03',
  time: '09:00',
  court: 1,
  divisionId: uuid(10),
  groupId: null,
  team1Id: uuid(101),
  team2Id: uuid(102),
  label: 'Open',
  type: 'group',
  score1: null,
  score2: null,
  ...extra,
});
const games = [
  game(1),
  game(2, {
    time: '10:00',
    court: 2,
    type: 'final',
    label: 'Open - Finals',
    team1Id: null,
    team2Id: null,
    playoff: {
      bracketGameId: 'po_1',
      round: 1,
      team1Source: { type: 'seed', rank: 1 },
      team2Source: { type: 'seed', rank: 2 },
    },
  }),
  game(3, { day: null, time: null, court: null }),
];
// Edit buttons of the day table, in slot order (the Unscheduled row renders first on the page).
const dayCards = () =>
  within(screen.getByRole('region', { name: 'Sat 03/10/2026 schedule' })).getAllByRole('button', { name: /^Edit/ });
const renderGrid = () =>
  render(<ScheduleEditor event={event} divisions={divisions} games={games} onChanged={fake.changed} />);

beforeEach(() => {
  vi.clearAllMocks();
  fake.save.mockResolvedValue({ ok: true, data: { id: uuid(300) } });
  fake.remove.mockResolvedValue({ ok: true, data: undefined });
});

describe('Schedule grid (E-40 to E-44)', () => {
  it('shows a table per day with court names, hourly rows, cards and the Unscheduled row', () => {
    renderGrid();
    const table = screen.getByRole('region', { name: 'Sat 03/10/2026 schedule' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['Time', 'Court 1', 'West court']);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((r) => within(r).getByRole('rowheader').textContent)).toEqual(['9:00 am', '10:00 am']);
    expect(rows[0]).toHaveTextContent('Hawks vs Owls');
    expect(rows[0]).toHaveTextContent('- free');
    expect(rows[1]).toHaveTextContent('Open - FinalsTBD vs TBD');
    const unscheduled = screen.getByRole('region', { name: 'Unscheduled games' });
    expect(within(unscheduled).getByRole('heading')).toHaveTextContent('Unscheduled 1');
  });
  it('paints semi and final cards in the playoff colour, group cards in the division colour', () => {
    renderGrid();
    const [group, final] = dayCards().map((b) => b.closest<HTMLElement>('[data-game]')!);
    expect(group!.style.borderInlineStartColor).toBe('rgb(108, 99, 255)');
    expect(final!.style.borderInlineStartColor).toBe('rgb(168, 139, 235)');
  });
  it('explains the empty Unscheduled row', () => {
    render(<ScheduleEditor event={event} divisions={divisions} games={[game(1)]} onChanged={fake.changed} />);
    expect(screen.getByText('Drop a game here to clear its time slot.')).toBeInTheDocument();
  });
});

describe('Game dialog (E-46 to E-50)', () => {
  it('edits a game and reports the saved change', async () => {
    const user = userEvent.setup();
    renderGrid();
    await user.click(dayCards()[0]!);
    const dialog = screen.getByRole('dialog', { name: 'Edit game' });
    expect(within(dialog).getByLabelText('Team 1')).toHaveValue(uuid(101));
    expect(
      within(within(dialog).getByLabelText('Team 2')).getByRole('option', { name: 'Owls (Open)' }),
    ).toBeInTheDocument();
    await user.selectOptions(within(dialog).getByLabelText('Court'), 'West court');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(fake.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: uuid(201),
        eventId: uuid(1),
        day: '2026-10-03',
        time: '09:00',
        court: 2,
        detach: false,
      }),
    );
    expect(fake.changed).toHaveBeenCalledWith('Game saved.');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('refuses a team playing itself and a taken slot, naming the court', async () => {
    const user = userEvent.setup();
    renderGrid();
    await user.click(screen.getByRole('button', { name: '+ Add game' }));
    const dialog = screen.getByRole('dialog', { name: 'Add game' });
    await user.selectOptions(within(dialog).getByLabelText('Team 1'), 'Hawks (Open)');
    await user.selectOptions(within(dialog).getByLabelText('Team 2'), 'Hawks (Open)');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent("A team can't play itself. Pick two different teams.");
    await user.selectOptions(within(dialog).getByLabelText('Team 2'), 'TBD');
    await user.type(within(dialog).getByLabelText('Time'), '1000');
    await user.selectOptions(within(dialog).getByLabelText('Court'), 'West court');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'That slot (03/10/2026 10:00 am West court) is already taken.',
    );
    expect(fake.save).not.toHaveBeenCalled();
  });
  it('adds an unscheduled game when the day is left Unscheduled', async () => {
    const user = userEvent.setup();
    renderGrid();
    await user.click(screen.getByRole('button', { name: '+ Add game' }));
    const dialog = screen.getByRole('dialog', { name: 'Add game' });
    await user.selectOptions(within(dialog).getByLabelText('Day'), 'Unscheduled');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(fake.save).toHaveBeenCalledWith(expect.objectContaining({ id: undefined, day: null, time: null }));
    expect(fake.changed).toHaveBeenCalledWith('Game added.');
    expect(within(dialog).queryByRole('button', { name: 'Delete game' })).not.toBeInTheDocument();
  });
  it('shows server errors in the dialog and keeps it open', async () => {
    const user = userEvent.setup();
    fake.save.mockResolvedValueOnce({ ok: false, error: 'Could not save the game. Refresh and try again.' });
    renderGrid();
    await user.click(dayCards()[0]!);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Could not save the game. Refresh and try again.')).toBeInTheDocument();
    expect(fake.changed).not.toHaveBeenCalled();
  });
  it('explains bracket games and offers to detach them', async () => {
    const user = userEvent.setup();
    renderGrid();
    await user.click(dayCards()[1]!);
    const dialog = screen.getByRole('dialog', { name: 'Edit game' });
    expect(dialog).toHaveTextContent('This game is part of a playoff bracket.');
    await user.click(within(dialog).getByLabelText('Detach from the bracket and keep the teams picked here'));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(fake.save).toHaveBeenCalledWith(expect.objectContaining({ id: uuid(202), detach: true, type: 'final' }));
  });
  it('asks before deleting a game and its score', async () => {
    const user = userEvent.setup();
    renderGrid();
    await user.click(dayCards()[0]!);
    await user.click(screen.getByRole('button', { name: 'Delete game' }));
    const confirm = screen.getByRole('dialog', { name: 'Delete this game?' });
    expect(confirm).toHaveTextContent('Its score is deleted with it.');
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    expect(fake.remove).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Delete game' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Delete this game?' })).getByRole('button', { name: 'Delete game' }),
    );
    expect(fake.remove).toHaveBeenCalledWith(uuid(1), uuid(201));
    expect(fake.changed).toHaveBeenCalledWith('Game deleted.');
  });
});
