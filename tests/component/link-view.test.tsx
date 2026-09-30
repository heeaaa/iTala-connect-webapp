import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const fake = vi.hoisted(() => ({ push: vi.fn(), save: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: fake.push }) }));
vi.mock('@/server/actions/mobile-link', () => ({ saveMobileLink: fake.save }));
import { LinkView, type LinkPageData } from '@/app/admin/events/[eventId]/divisions/[divisionId]/mobile-link/link-view';
import { DUPLICATE } from '@/lib/mobile-link';

const data = (o: Partial<LinkPageData> = {}): LinkPageData => ({
  eventId: 'e1',
  eventName: 'League Night',
  eventStatus: 'draft',
  divisionId: 'd1',
  divisionName: 'Open',
  currentLeagueId: null,
  currentLeagueName: null,
  teams: [
    { id: 't-hawks', name: 'Harbour Hawks' },
    { id: 't-owls', name: 'Night Owls' },
    { id: 't-kea', name: 'Kea' },
  ],
  others: [],
  leagues: [
    { id: 'league-open', name: 'Harbour League', season: '2026', is_archived: false, is_closed: false },
    { id: 'league-old', name: 'Autumn', season: '2025', is_archived: true, is_closed: true },
  ],
  leagueId: 'league-open',
  mobileTeams: [
    { id: 'm-hawks', name: 'Harbour Hawks BC' },
    { id: 'm-owls', name: 'Night Owls' },
  ],
  otherLinkCount: 0,
  existing: {},
  unreachable: false,
  ...o,
});
const pick = (team: string) => screen.getByRole('combobox', { name: `Mobile team for ${team}` });

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
  vi.clearAllMocks();
  fake.save.mockResolvedValue({ ok: true, data: undefined });
});

describe('LinkView (M-03)', () => {
  it('fills the pairs in from names, says who is unpaired, saves the pairs and goes to the results', async () => {
    const user = userEvent.setup();
    render(<LinkView data={data()} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Link “Open” to the mobile app' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to event' })).toHaveAttribute('href', '/admin/events/e1');
    expect(screen.getByRole('combobox', { name: 'Mobile app league' })).toHaveValue('league-open');
    expect(screen.getByRole('option', { name: 'Autumn (2025) · archived' })).toBeInTheDocument();
    expect(pick('Harbour Hawks')).toHaveValue('m-hawks');
    expect(pick('Night Owls')).toHaveValue('m-owls');
    expect(pick('Kea')).toHaveValue('');
    expect(
      screen.getByText('1 team not paired. Results involving them will be listed but cannot be approved.'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save link' }));
    expect(fake.save).toHaveBeenCalledWith({
      eventId: 'e1',
      divisionId: 'd1',
      leagueId: 'league-open',
      expectedLeagueId: null,
      confirmReplace: false,
      pairs: [
        { teamId: 't-hawks', mobileTeamId: 'm-hawks' },
        { teamId: 't-owls', mobileTeamId: 'm-owls' },
        { teamId: 't-kea', mobileTeamId: '' },
      ],
    });
    expect(fake.push).toHaveBeenCalledWith('/admin/events/e1/results?linked=1');
  });

  it('keeps the pairs a person chose over name guesses, and the hint follows each change', async () => {
    const user = userEvent.setup();
    render(<LinkView data={data({ existing: { 't-hawks': 'm-owls', 't-owls': '' } })} />);
    expect(pick('Harbour Hawks')).toHaveValue('m-owls');
    // A blank saved pair is a gap, so the name guess fills it in.
    expect(pick('Night Owls')).toHaveValue('m-owls');
    await user.selectOptions(pick('Night Owls'), '');
    expect(screen.getByText(/^2 teams not paired\./)).toBeInTheDocument();
    await user.selectOptions(pick('Kea'), 'm-hawks');
    expect(screen.getByText(/^1 team not paired\./)).toBeInTheDocument();
  });

  it('refuses two teams on one mobile team without asking the server, and keeps focus on Save', async () => {
    const user = userEvent.setup();
    render(<LinkView data={data()} />);
    await user.selectOptions(pick('Kea'), 'm-hawks');
    const save = screen.getByRole('button', { name: 'Save link' });
    await user.click(save);
    expect(screen.getByRole('alert')).toHaveTextContent(DUPLICATE);
    expect(fake.save).not.toHaveBeenCalled();
    expect(save).toHaveFocus();
    // The two pairs in the way are marked and described by the message; the others are not.
    for (const team of ['Harbour Hawks', 'Kea']) {
      expect(pick(team)).toHaveAttribute('aria-invalid', 'true');
      expect(pick(team)).toHaveAccessibleDescription(DUPLICATE);
    }
    expect(pick('Night Owls')).not.toHaveAttribute('aria-invalid');
    // Fixing the pair clears the marks at once, and saving clears the message.
    await user.selectOptions(pick('Kea'), '');
    expect(pick('Harbour Hawks')).not.toHaveAttribute('aria-invalid');
    expect(pick('Harbour Hawks')).not.toHaveAccessibleDescription();
    await user.click(save);
    expect(screen.getByRole('alert')).toBeEmptyDOMElement();
    expect(fake.save).toHaveBeenCalledTimes(1);
  });

  it('shows a refusal from the server, and says so when the server cannot be reached', async () => {
    const user = userEvent.setup();
    fake.save.mockResolvedValueOnce({
      ok: false,
      error: 'That league is no longer in the mobile app. Choose another.',
    });
    render(<LinkView data={data()} />);
    const save = screen.getByRole('button', { name: 'Save link' });
    await user.click(save);
    expect(screen.getByRole('alert')).toHaveTextContent('That league is no longer in the mobile app. Choose another.');
    expect(fake.push).not.toHaveBeenCalled();
    fake.save.mockRejectedValueOnce(new Error('offline'));
    await user.click(save);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not reach the server. Check your connection.');
    expect(save).toHaveFocus();
  });

  it('saves once while a save is running', async () => {
    const user = userEvent.setup();
    let finish = () => {};
    fake.save.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = () => resolve({ ok: true, data: undefined });
      }),
    );
    render(<LinkView data={data()} />);
    await user.click(screen.getByRole('button', { name: 'Save link' }));
    const busy = await screen.findByRole('button', { name: 'Saving…' });
    expect(busy).toHaveAttribute('aria-disabled', 'true');
    await user.click(busy);
    expect(fake.save).toHaveBeenCalledTimes(1);
    finish();
    await vi.waitFor(() => expect(fake.push).toHaveBeenCalledTimes(1));
  });

  it('notes another division on the same league, and shows no pairs until a league is chosen', () => {
    const { unmount } = render(<LinkView data={data({ others: [{ name: 'Women', leagueId: 'league-open' }] })} />);
    expect(screen.getByText('Note: “Women” is already linked to this same league.')).toBeInTheDocument();
    unmount();
    render(<LinkView data={data({ leagueId: '', mobileTeams: [] })} />);
    expect(screen.getByRole('combobox', { name: 'Mobile app league' })).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Show its teams' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save link' })).not.toBeInTheDocument();
  });

  it('lists every division team even when the league has no teams yet', () => {
    render(<LinkView data={data({ mobileTeams: [] })} />);
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(rows).toHaveLength(4);
    expect(pick('Harbour Hawks')).toHaveValue('');
    expect(screen.getByText(/^3 teams not paired\./)).toBeInTheDocument();
  });

  it('says when the mobile app does not answer, without a form', () => {
    render(<LinkView data={data({ unreachable: true, leagues: [], leagueId: '', mobileTeams: [] })} />);
    expect(screen.getByRole('heading', { name: 'Could not reach the mobile app' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to event' })).toBeInTheDocument();
  });

  it('names both leagues and waits for confirmation before replacing a link', async () => {
    const user = userEvent.setup();
    render(<LinkView data={data({ currentLeagueId: 'league-old', currentLeagueName: 'Autumn' })} />);
    await user.click(screen.getByRole('button', { name: 'Save link' }));
    expect(fake.save).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toHaveTextContent('Autumn');
    expect(screen.getByRole('dialog')).toHaveTextContent('Harbour League');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(fake.save).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Save link' }));
    await user.click(screen.getByRole('button', { name: 'Replace link' }));
    expect(fake.save).toHaveBeenCalledWith(
      expect.objectContaining({ expectedLeagueId: 'league-old', confirmReplace: true }),
    );
  });
});
