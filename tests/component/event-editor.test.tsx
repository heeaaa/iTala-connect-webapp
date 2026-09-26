import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type Game } from '@/domain/types';
import { type ScheduleGame } from '@/app/admin/events/[eventId]/schedule-editor';
import { type EditorInput } from '@/lib/event-editor';

const fake = vi.hoisted(() => ({
  save: vi.fn(),
  publish: vi.fn(),
  refresh: vi.fn(),
  rr: vi.fn(),
  po: vi.fn(),
  upload: vi.fn(),
  removeImage: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: fake.refresh, push: vi.fn(), replace: vi.fn() }) }));
vi.mock('@/server/actions/events', () => ({ saveEvent: fake.save }));
vi.mock('@/server/actions/publish', () => ({ publishEvent: fake.publish }));
vi.mock('@/lib/compress-image', () => ({
  ImageProblem: class ImageProblem extends Error {},
  compressImage: async (f: File) => new Blob([await f.arrayBuffer()], { type: 'image/webp' }),
}));
vi.mock('@/server/actions/images', () => ({ uploadEventImage: fake.upload, removeEventImage: fake.removeImage }));
vi.mock('@/server/actions/schedule-additions', () => ({ addRoundRobin: fake.rr, addPlayoff: fake.po }));
import { EventEditor } from '@/app/admin/events/[eventId]/event-editor';
import { MatchupReport } from '@/app/admin/events/[eventId]/matchup-report';

beforeAll(() => {
  // jsdom has no layout; ProseMirror asks what is under a click.
  document.elementFromPoint = () => null;
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});

const NO_IMAGES = { logo: null, major: null, minors: [] };
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
let gameCount = 0;
const game = (a: number, b: number, extra: Partial<Game> = {}): ScheduleGame => ({
  id: uuid(900 + ++gameCount),
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
const editor = (games: ScheduleGame[] = []) =>
  render(<EventEditor initial={initial} links={{}} images={NO_IMAGES} games={games} published={false} notice="" />);

beforeEach(() => {
  vi.clearAllMocks();
  fake.save.mockResolvedValue({ ok: true, data: { version: 'v2', moved: 0 } });
  fake.publish.mockResolvedValue({ ok: true, data: { status: 'published', games: 3, version: 'v3' } });
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
    fake.publish.mockResolvedValueOnce({ ok: true, data: { status: 'published', games: 1, version: 'v3' } });
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
  it('saves with the version publishing returned, not the stale one', async () => {
    const user = userEvent.setup();
    editor();
    await user.click(screen.getByRole('button', { name: 'Publish' }));
    await screen.findByText('Published with 3 games.');
    await user.type(screen.getByLabelText('Event name'), '!');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByText('Saved');
    expect(fake.save).toHaveBeenLastCalledWith(expect.objectContaining({ version: 'v3', name: 'League night!' }));
  });
});

describe('Published editing (E-02, E-05, E-14, E-22, E-23)', () => {
  const publishedEditor = (games: ScheduleGame[] = []) =>
    render(<EventEditor initial={initial} links={{}} images={NO_IMAGES} games={games} published notice="" />);
  it('offers Save instead of Save draft and Publish', () => {
    publishedEditor();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save draft' })).not.toBeInTheDocument();
    expect(screen.getByText(/Changes to days, hours and courts save automatically/)).toBeInTheDocument();
  });
  it('autosaves a change of courts once, says how many games moved, and refreshes the schedule', async () => {
    fake.save.mockResolvedValueOnce({ ok: true, data: { version: 'v2', moved: 2 } });
    publishedEditor();
    // A controlled, clamped number input: set the whole value at once.
    fireEvent.change(screen.getByLabelText('Courts'), { target: { value: '2' } });
    expect(await screen.findByRole('status', {}, { timeout: 3000 })).toHaveTextContent(
      "Saved. 2 games moved to Unscheduled because they no longer fit the event's days, hours or courts.",
    );
    expect(fake.save).toHaveBeenCalledTimes(1);
    expect(fake.save).toHaveBeenCalledWith(expect.objectContaining({ courts: 2, court_names: ['Court 1', 'Court 2'] }));
    expect(fake.refresh).toHaveBeenCalled();
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
  });
  it('does not autosave team edits: they need Save', async () => {
    const user = userEvent.setup();
    publishedEditor();
    await user.type(screen.getByLabelText('Team 1 name'), ' B');
    await new Promise((r) => setTimeout(r, 800));
    expect(fake.save).not.toHaveBeenCalled();
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    fake.save.mockResolvedValueOnce({ ok: true, data: { version: 'v2', moved: 1 } });
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Saved. 1 game moved to Unscheduled because it no longer fits',
    );
  });
  it('a save that cannot reach the server says so, and the next Save still works', async () => {
    const user = userEvent.setup();
    publishedEditor();
    await user.type(screen.getByLabelText('Team 1 name'), ' B');
    fake.save.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not reach the server, so the event was not saved. Check your connection.',
    );
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    // The button reads "Saving…" until the failed save has finished.
    await user.click(await screen.findByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Saved');
    expect(fake.save).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('alert')).toBeEmptyDOMElement();
  });
  it('states the games that go with a removed division and the TBD left by a removed team', async () => {
    const user = userEvent.setup();
    publishedEditor([game(1, 2), game(2, 3), game(1, 3)]);
    await user.click(screen.getByRole('button', { name: /^Remove team\s*Rats$/ }));
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'The team and its players will be removed when you save. Its 2 games will show TBD in its place.',
    );
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Remove division' }));
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'Its 3 teams, their players and 3 games will be removed when you save. Scores for those games are removed too.',
    );
  });
  it('keeps the plain removal messages when there are no games', async () => {
    const user = userEvent.setup();
    publishedEditor();
    await user.click(screen.getByRole('button', { name: /^Remove team\s*Rats$/ }));
    expect(screen.getByRole('dialog')).toHaveTextContent('The team and its players will be removed when you save.');
    expect(screen.getByRole('dialog')).not.toHaveTextContent('TBD');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Remove division' }));
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'Its 3 teams and their players will be removed when you save.',
    );
  });
});

describe('Round robin and playoff on a published event (E-21, E-63, E-64)', () => {
  const publishedEditor = (value: EditorInput = initial) =>
    render(<EventEditor initial={value} links={{}} images={NO_IMAGES} games={[]} published notice="" />);
  const dialog = (name: RegExp) => screen.getByRole('dialog', { name });

  it('shows Custom games/team before publishing, and the two additions after', () => {
    editor();
    expect(screen.getByLabelText('Custom games/team')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^\+ Round robin/ })).not.toBeInTheDocument();
    cleanup();
    publishedEditor();
    expect(screen.queryByLabelText('Custom games/team')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^\+ Round robin/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^\+ Playoff/ })).toBeInTheDocument();
  });

  it('saves unsaved edits first, adds the round robin, and reports it in the dialog', async () => {
    const user = userEvent.setup();
    fake.save.mockResolvedValueOnce({ ok: true, data: { version: 'v2', moved: 0 } });
    fake.rr.mockResolvedValueOnce({ ok: true, data: { added: 3, unscheduled: 1, moved: 1 } });
    publishedEditor();
    await user.click(screen.getByRole('button', { name: '+ Add team' }));
    await user.type(screen.getByLabelText('Team 4 name'), 'Kea');
    await user.click(screen.getByRole('button', { name: /^\+ Round robin/ }));
    const rr = dialog(/Add round robin · Open/);
    expect(rr).toHaveTextContent('4 teams. A full round robin is 6 games (3 per team).');
    expect(within(rr).getByLabelText('Custom games/team')).not.toBeChecked();
    await user.click(within(rr).getByRole('button', { name: 'Add games' }));
    expect(await within(rr).findByRole('status')).toHaveTextContent(
      "3 games added. 1 could not fit and is in the Unscheduled row. 1 game moved to Unscheduled because it no longer fits the event's days, hours or courts.",
    );
    expect(fake.save).toHaveBeenCalledWith(expect.objectContaining({ version: 'v1' }));
    expect(fake.save.mock.invocationCallOrder[0]).toBeLessThan(fake.rr.mock.invocationCallOrder[0]!);
    expect(fake.rr).toHaveBeenCalledWith({ eventId: uuid(1), divisionId: uuid(10), custom: false, gamesPerTeam: 0 });
    const done = within(rr).getByRole('button', { name: 'Done' });
    expect(done).toHaveFocus();
    // Focus lands on Done, so the result is its description too (read out even where a new status is not).
    expect(done).toHaveAccessibleDescription(/^3 games added\./);
    await user.click(done);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^\+ Round robin/ })).toHaveFocus();
  });

  it('checks the custom number, then keeps the stored choice so a later Save does not undo it', async () => {
    const user = userEvent.setup();
    fake.rr.mockResolvedValueOnce({ ok: true, data: { added: 2, unscheduled: 0, moved: 0 } });
    publishedEditor();
    await user.click(screen.getByRole('button', { name: /^\+ Round robin/ }));
    const rr = dialog(/Add round robin/);
    await user.click(within(rr).getByLabelText('Custom games/team'));
    const count = within(rr).getByLabelText('Games per team');
    expect(count).toHaveValue(3); // min(3, max) with max 3 for three teams
    expect(rr).toHaveTextContent('Between 1 and 3. Leave the box unticked for a full round robin.');
    fireEvent.change(count, { target: { value: '4' } });
    await user.click(within(rr).getByRole('button', { name: 'Add games' }));
    expect(within(rr).getByRole('alert')).toHaveTextContent(
      'With 3 teams each team can play at most 3 games without a repeat matchup.',
    );
    expect(fake.rr).not.toHaveBeenCalled();
    fireEvent.change(count, { target: { value: '2' } });
    await user.click(within(rr).getByRole('button', { name: 'Add games' }));
    expect(await within(rr).findByRole('status')).toHaveTextContent('2 games added.');
    // Nothing unsaved: the editor was clean, and the division's new choice is part of what is stored.
    expect(fake.save).not.toHaveBeenCalled();
    await user.click(within(rr).getByRole('button', { name: 'Done' }));
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
    fake.save.mockResolvedValueOnce({ ok: true, data: { version: 'v2', moved: 0 } });
    await user.type(screen.getByLabelText('Team 1 name'), ' B');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(fake.save).toHaveBeenCalledWith(
      expect.objectContaining({
        divisions: [expect.objectContaining({ custom_games_per_team: true, games_per_team: 2 })],
      }),
    );
  });

  it('a full round robin after a saved custom number stores 0, which a later Save keeps', async () => {
    const user = userEvent.setup();
    fake.rr.mockResolvedValueOnce({ ok: true, data: { added: 1, unscheduled: 0, moved: 0 } });
    publishedEditor({ ...initial, divisions: [{ ...division, custom_games_per_team: true, games_per_team: 1 }] });
    await user.click(screen.getByRole('button', { name: /^\+ Round robin/ }));
    const rr = dialog(/Add round robin/);
    expect(within(rr).getByLabelText('Custom games/team')).toBeChecked();
    expect(within(rr).getByLabelText('Games per team')).toHaveValue(1);
    await user.click(within(rr).getByLabelText('Custom games/team'));
    await user.click(within(rr).getByRole('button', { name: 'Add games' }));
    await within(rr).findByRole('status');
    expect(fake.rr).toHaveBeenCalledWith(expect.objectContaining({ custom: false, gamesPerTeam: 0 }));
    await user.click(within(rr).getByRole('button', { name: 'Done' }));
    fake.save.mockResolvedValueOnce({ ok: true, data: { version: 'v2', moved: 0 } });
    await user.type(screen.getByLabelText('Team 1 name'), ' B');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(fake.save).toHaveBeenCalledWith(
      expect.objectContaining({
        divisions: [expect.objectContaining({ custom_games_per_team: false, games_per_team: 0 })],
      }),
    );
  });

  it('gives focus back to Add playoff when the server refuses', async () => {
    const user = userEvent.setup();
    let refuse!: (v: unknown) => void;
    fake.po.mockReturnValueOnce(new Promise((resolve) => (refuse = resolve)));
    publishedEditor();
    await user.click(screen.getByRole('button', { name: /^\+ Playoff/ }));
    const po = dialog(/Add playoff/);
    await user.click(within(po).getByRole('button', { name: 'Add playoff' }));
    expect(within(po).getByRole('button', { name: 'Adding…' })).toBeDisabled();
    // A browser drops focus to the page from a button that becomes disabled; jsdom keeps it
    // there (and will not blur a disabled button), so move it to the page the same way.
    document.body.tabIndex = -1;
    act(() => document.body.focus());
    expect(document.activeElement).toBe(document.body);
    await act(async () => refuse({ ok: false, error: 'You can only edit your own events.' }));
    expect(within(po).getByRole('alert')).toHaveTextContent('You can only edit your own events.');
    expect(within(po).getByRole('button', { name: 'Add playoff' })).toHaveFocus();
    document.body.removeAttribute('tabindex');
  });

  it('adds nothing when the other changes cannot be saved', async () => {
    const user = userEvent.setup();
    fake.save.mockResolvedValueOnce({ ok: false, error: 'This event changed in another window.' });
    publishedEditor();
    await user.type(screen.getByLabelText('Team 1 name'), ' B');
    await user.click(screen.getByRole('button', { name: /^\+ Playoff/ }));
    const po = dialog(/Add playoff · Open/);
    await user.click(within(po).getByRole('button', { name: 'Add playoff' }));
    expect(await within(po).findByRole('alert')).toHaveTextContent(
      'Your other changes could not be saved, so nothing was added.',
    );
    expect(fake.po).not.toHaveBeenCalled();
  });

  it('asks how many teams advance, checks the range and reports the playoff', async () => {
    const user = userEvent.setup();
    fake.po.mockResolvedValueOnce({ ok: true, data: { added: 2, unscheduled: 0, moved: 0 } });
    publishedEditor();
    await user.click(screen.getByRole('button', { name: /^\+ Playoff/ }));
    const po = dialog(/Add playoff/);
    const count = within(po).getByLabelText('How many teams advance to the playoff bracket? (max 3)');
    expect(count).toHaveValue(3);
    fireEvent.change(count, { target: { value: '5' } });
    await user.click(within(po).getByRole('button', { name: 'Add playoff' }));
    expect(within(po).getByRole('alert')).toHaveTextContent('Choose between 2 and 3 teams.');
    fireEvent.change(count, { target: { value: '3' } });
    await user.click(within(po).getByRole('button', { name: 'Add playoff' }));
    expect(await within(po).findByRole('status')).toHaveTextContent('2 playoff games added!');
    expect(fake.po).toHaveBeenCalledWith({ eventId: uuid(1), divisionId: uuid(10), teams: 3 });
  });

  it('explains when a division has too few teams or the event has no dates, with only Close', async () => {
    const user = userEvent.setup();
    publishedEditor({ ...initial, schedule_days: [], divisions: [{ ...division, teams: [team(1, 'Hawks')] }] });
    await user.click(screen.getByRole('button', { name: /^\+ Playoff/ }));
    expect(within(dialog(/Add playoff/)).getByRole('alert')).toHaveTextContent('Need at least 2 teams.');
    expect(within(dialog(/Add playoff/)).queryByRole('button', { name: 'Add playoff' })).not.toBeInTheDocument();
    await user.click(within(dialog(/Add playoff/)).getByRole('button', { name: 'Close' }));
    await user.click(screen.getByRole('button', { name: /^\+ Round robin/ }));
    expect(within(dialog(/Add round robin/)).getByRole('alert')).toHaveTextContent(
      'This division needs at least 2 teams.',
    );
    cleanup();
    publishedEditor({ ...initial, schedule_days: [] });
    await user.click(screen.getByRole('button', { name: /^\+ Round robin/ }));
    expect(within(dialog(/Add round robin/)).getByRole('alert')).toHaveTextContent(
      'Select at least one event date first.',
    );
  });
});

describe('Images and rules in the editor (E-15, E-70)', () => {
  const publishedEditor = () =>
    render(<EventEditor initial={initial} links={{}} images={NO_IMAGES} games={[]} published notice="" />);

  it('a logo upload moves the save token on, and unsaved edits stay unsaved', async () => {
    const user = userEvent.setup();
    fake.upload.mockResolvedValueOnce({ ok: true, data: { version: 'v7' } });
    fake.save.mockResolvedValueOnce({ ok: true, data: { version: 'v8', moved: 0 } });
    publishedEditor();
    await user.type(screen.getByLabelText('Team 1 name'), ' B');
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    await user.upload(
      screen.getByLabelText('Upload logo'),
      new File([new Uint8Array([1])], 'logo.png', { type: 'image/png' }),
    );
    expect(await screen.findByText('Logo saved.')).toBeInTheDocument();
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(fake.save).toHaveBeenCalledWith(expect.objectContaining({ version: 'v7' }));
  });
  it('an image change waits for a save in flight, then sends the version that save returned', async () => {
    const user = userEvent.setup();
    let finish: (v: unknown) => void = () => {};
    fake.save.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    fake.upload.mockResolvedValueOnce({ ok: true, data: {} });
    publishedEditor();
    await user.type(screen.getByLabelText('Team 1 name'), ' B');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await user.upload(
      screen.getByLabelText('Upload logo'),
      new File([new Uint8Array([1])], 'logo.png', { type: 'image/png' }),
    );
    expect(fake.upload).not.toHaveBeenCalled();
    await act(async () => finish({ ok: true, data: { version: 'v2', moved: 0 } }));
    expect(await screen.findByText('Logo saved.')).toBeInTheDocument();
    expect((fake.upload.mock.lastCall![0] as FormData).get('version')).toBe('v2');
  });
  it('a stale or refused image change leaves the version alone, so the next Save still finds the conflict', async () => {
    const user = userEvent.setup();
    // Another window saved first: the logo changes, but no version comes back (set_event_logo returns null).
    fake.upload.mockResolvedValueOnce({ ok: true, data: {} });
    fake.upload.mockResolvedValueOnce({ ok: false, error: 'You can only edit your own events.' });
    publishedEditor();
    const logo = () => new File([new Uint8Array([1])], 'logo.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Upload logo'), logo());
    expect(await screen.findByText('Logo saved.')).toBeInTheDocument();
    await user.upload(screen.getByLabelText('Upload logo'), logo());
    expect(await screen.findByText('You can only edit your own events.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Team 1 name'), ' B');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(fake.save).toHaveBeenCalledWith(expect.objectContaining({ version: initial.version }));
  });

  it('a rules edit is unsaved until Save, which sends the rules', async () => {
    const user = userEvent.setup();
    fake.save.mockResolvedValueOnce({ ok: true, data: { version: 'v2', moved: 0 } });
    render(
      <EventEditor
        initial={{ ...initial, rules_html: '<p>Two halves</p>' }}
        links={{}}
        images={NO_IMAGES}
        games={[]}
        published
        notice=""
      />,
    );
    const rules = await screen.findByRole('textbox', { name: 'Event rules' });
    expect(rules).toHaveTextContent('Two halves');
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
    await user.click(rules);
    await user.keyboard('{Control>}a{/Control}');
    await user.click(screen.getByRole('button', { name: 'Bold' }));
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(fake.save).toHaveBeenCalledWith(
      expect.objectContaining({ rules_html: '<p><strong>Two halves</strong></p>' }),
    );
  });
});
