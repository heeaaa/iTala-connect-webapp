import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type Game } from '@/domain/types';
import { type EditorInput } from '@/lib/event-editor';

const fake = vi.hoisted(() => ({ save: vi.fn(), publish: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: fake.refresh, push: vi.fn(), replace: vi.fn() }) }));
vi.mock('@/server/actions/events', () => ({ saveDraft: fake.save }));
vi.mock('@/server/actions/publish', () => ({ publishEvent: fake.publish }));
import { DraftEditor } from '@/app/admin/events/[eventId]/draft-editor';
import { MatchupReport } from '@/app/admin/events/[eventId]/matchup-report';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const team = (n: number, name: string) => ({ id: uuid(100 + n), name, coach: '', players: [] });
const division = {
  id: uuid(10),
  name: 'Open',
  color: '#6C63FF',
  bracket_count: 1,
  custom_games_per_team: false,
  games_per_team: 0,
  teams: [team(1, 'Hawks'), team(2, 'Rats'), team(3, 'Owls')],
};
const initial: EditorInput = {
  id: uuid(1),
  version: 'v1',
  name: 'League night',
  schedule_days: ['2026-10-02'],
  time_start: '09:00',
  time_end: '20:00',
  courts: 1,
  court_names: ['Court 1'],
  timezone: 'Pacific/Auckland',
  theme_primary: '#FFCC00',
  theme_bg: '#0D0D0D',
  theme_text: '#E0E0E0',
  theme_text_secondary: '#888888',
  theme_heading: '#FFFFFF',
  divisions: [division],
};
const game = (a: number, b: number, extra: Partial<Game> = {}): Game => ({
  day: null,
  time: null,
  court: null,
  divisionId: division.id,
  groupId: null,
  team1Id: uuid(100 + a),
  team2Id: uuid(100 + b),
  label: 'Open',
  type: 'group',
  score1: null,
  score2: null,
  ...extra,
});
const editor = (games: Game[] = []) =>
  render(<DraftEditor initial={initial} links={{}} games={games} readOnly={false} notice="" />);

beforeEach(() => {
  vi.clearAllMocks();
  fake.save.mockResolvedValue({ ok: true, data: 'v2' });
  fake.publish.mockResolvedValue({ ok: true, data: { status: 'published', games: 3 } });
});

describe('Team matchup report (E-30, E-31)', () => {
  it('counts group games per pair, highlights repeats and skips playoffs and TBD', () => {
    editor([
      game(1, 2),
      game(2, 1, { day: '2026-10-02', time: '09:00', court: 1 }),
      game(1, 3),
      game(1, 3, { type: 'final' }),
      game(1, 2, { team2Id: null }),
    ]);
    expect(screen.getByText('1 repeated matchup', { selector: 'span' })).toBeInTheDocument();
    const summary = screen.getByRole('list', { name: 'Open summary' });
    expect(within(summary).getByText('3 games')).toBeInTheDocument();
    expect(within(summary).getByText('1 repeated matchup')).toBeInTheDocument();
    expect(within(summary).getByText('1 pairing not scheduled')).toBeInTheDocument();
    const grid = screen.getByRole('region', { name: 'Open matchups' });
    const [, hawks, rats] = within(grid).getAllByRole('row');
    const cells = within(hawks!).getAllByRole('cell');
    expect(cells.map((c) => c.textContent)).toEqual(['- same team', '2 games, repeated', '1']);
    expect(cells[1]).toHaveAttribute('title', '2 games between these teams');
    expect(within(rats!).getAllByRole('cell')[2]).toHaveTextContent('- no games');
  });
  it('shows the empty hints and a clean summary', () => {
    const { rerender } = render(<MatchupReport divisions={[]} games={[]} />);
    expect(screen.getByText('Add a division to see its matchups.')).toBeInTheDocument();
    rerender(<MatchupReport divisions={[{ ...division, name: '', teams: [team(1, 'Solo')] }]} games={[]} />);
    expect(screen.getByRole('heading', { name: 'Untitled division' })).toBeInTheDocument();
    expect(screen.getByText('This division needs at least 2 teams.')).toBeInTheDocument();
    rerender(<MatchupReport divisions={[{ ...division, teams: [team(1, ''), team(2, 'B')] }]} games={[game(1, 2)]} />);
    expect(screen.getByText('No repeated matchups')).toBeInTheDocument();
    expect(screen.getAllByText('Unnamed team')).toHaveLength(2);
  });
});

describe('Publish (E-02, E-60 to E-62)', () => {
  it('offers Save draft and Publish on a draft, and publishes a saved draft without saving again', async () => {
    const user = userEvent.setup();
    editor();
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Publish' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Published with 3 games.');
    expect(fake.save).not.toHaveBeenCalled();
    expect(fake.publish).toHaveBeenCalledWith(initial.id, false);
    expect(fake.refresh).toHaveBeenCalled();
  });
  it('saves unsaved edits first and does not publish when the save fails', async () => {
    const user = userEvent.setup();
    editor();
    await user.type(screen.getByLabelText('Event name'), ' 2026');
    fake.save.mockResolvedValueOnce({ ok: false, error: 'Check the event details: bad' });
    await user.click(screen.getByRole('button', { name: 'Publish' }));
    expect(await screen.findByText('Check the event details: bad')).toBeInTheDocument();
    expect(fake.publish).not.toHaveBeenCalled();
    fake.publish.mockResolvedValueOnce({ ok: true, data: { status: 'published', games: 1 } });
    await user.click(screen.getByRole('button', { name: 'Publish' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Published with 1 game.');
    expect(fake.save).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'League night 2026' }));
    expect(fake.save.mock.invocationCallOrder[1]).toBeLessThan(fake.publish.mock.invocationCallOrder[0]!);
  });
  it('shows validation errors from the server', async () => {
    const user = userEvent.setup();
    fake.publish.mockResolvedValueOnce({ ok: false, error: 'Please add at least one division.' });
    editor();
    await user.click(screen.getByRole('button', { name: 'Publish' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Please add at least one division.');
    expect(fake.refresh).not.toHaveBeenCalled();
  });
  it('asks before clearing recorded scores, and only clears on Continue', async () => {
    const user = userEvent.setup();
    fake.publish.mockResolvedValueOnce({ ok: true, data: { status: 'confirm', scores: 2 } });
    editor();
    await user.click(screen.getByRole('button', { name: 'Publish' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('2 recorded scores will be cleared. Continue?');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(fake.publish).toHaveBeenCalledTimes(1);
    fake.publish.mockResolvedValueOnce({ ok: true, data: { status: 'confirm', scores: null } });
    await user.click(screen.getByRole('button', { name: 'Publish' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent(
      'Could not check whether this event has recorded scores',
    );
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Published with 3 games.');
    expect(fake.publish).toHaveBeenLastCalledWith(initial.id, true);
  });
  it('hides Save draft and Publish on a published event', () => {
    render(<DraftEditor initial={initial} links={{}} games={[]} readOnly notice="" />);
    expect(screen.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save draft' })).not.toBeInTheDocument();
  });
});
