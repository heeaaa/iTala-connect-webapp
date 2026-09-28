import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const fake = vi.hoisted(() => ({ refresh: vi.fn(), approve: vi.fn(), keep: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: fake.refresh }) }));
vi.mock('@/server/actions/mobile-results', () => ({ approveResult: fake.approve, keepPublishedScore: fake.keep }));
import { ResultsView, fixtureLabel } from '@/app/admin/events/[eventId]/results/results-view';
import type { Inbox, InboxGame, InboxItem } from '@/server/mobile/results';
import type { InboxFinal } from '@/lib/mobile-results';

const game = (o: Partial<InboxGame> = {}): InboxGame => ({
  id: 'g1',
  day: '2026-09-27',
  time: '19:00',
  court: 1,
  divisionId: 'd1',
  groupId: null,
  team1Id: 't-hawks',
  team2Id: 't-owls',
  label: 'Open',
  type: 'group',
  score1: null,
  score2: null,
  ...o,
});
const final = (o: Partial<InboxFinal> = {}): InboxFinal => ({
  game_id: 'fin-1',
  league_id: 'L1',
  league_name: 'Harbour League',
  home_team_id: 'm-hawks',
  home_name: 'Harbour Hawks',
  away_team_id: 'm-owls',
  away_name: 'Night Owls',
  home_pts: 58,
  away_pts: 51,
  event_count: 48,
  finished_at: Date.parse('2026-09-27T07:05:00Z'),
  last_event_at: null,
  ...o,
});
const item = (state: InboxItem['result']['state'], o: Partial<InboxItem['result']> = {}, f = final()): InboxItem => ({
  divisionId: 'd1',
  final: f,
  published: null,
  result: {
    final: f,
    homeTeamId: 't-hawks',
    awayTeamId: 't-owls',
    candidates: [],
    pick: null,
    existing: null,
    reason: null,
    state,
    ...o,
  },
});
const inbox = (o: Partial<Inbox> = {}): Inbox => ({
  event: { id: 'e1', name: 'League Night', timezone: 'Pacific/Auckland', courtNames: ['Centre Court'] },
  divisions: [{ id: 'd1', name: 'Open', leagueName: 'Harbour League' }],
  teamNames: { 't-hawks': 'Harbour Hawks', 't-owls': 'Night Owls' },
  games: [game()],
  scored: [],
  items: [],
  notice: null,
  errors: [],
  ...o,
});

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
beforeEach(() => {
  vi.clearAllMocks();
  fake.approve.mockResolvedValue({ ok: true, data: { gameId: 'g1' } });
  fake.keep.mockResolvedValue({ ok: true, data: undefined });
});

describe('Results inbox (M-04, M-05)', () => {
  it('groups results in the old order with counts, and words each card', () => {
    const g = game();
    render(
      <ResultsView
        inbox={inbox({
          items: [
            item('review', { reason: 'no stats were recorded for this game' }, final({ game_id: 'r', event_count: 0 })),
            item('proposed', { pick: { gameId: 'g1', game: g, sameDay: false } }),
            {
              ...item(
                'drifted',
                { existing: { gameId: 'g1', source: {} as never } },
                final({ game_id: 'd', home_pts: 60 }),
              ),
              published: { s1: 58, s2: 51, eventCount: 40 },
            },
          ],
        })}
      />,
    );
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(['Ready to approve (1)', 'Changed since you approved them (1)', 'Needs a look (1)']);
    const ready = screen.getByRole('region', { name: 'Ready to approve (1)' });
    expect(within(ready).getByText('Harbour Hawks 58 - 51 Night Owls')).toBeInTheDocument();
    expect(within(ready).getByText('Harbour League · finished 27/09/2026 8:05 pm · 48 stats')).toBeInTheDocument();
    expect(
      within(ready).getByText(
        'Fixture: Harbour Hawks vs Night Owls · Sun 27/09/2026 7:00 pm · Centre Court. Note: a different day',
      ),
    ).toBeInTheDocument();
    expect(within(ready).getByRole('button', { name: 'Approve Harbour Hawks 58 - 51 Night Owls' })).toBeInTheDocument();
    expect(within(ready).queryByRole('combobox')).not.toBeInTheDocument();
    const changed = screen.getByRole('region', { name: 'Changed since you approved them (1)' });
    expect(
      within(changed).getByText('Published 58-51, the mobile app now says 60-51 (40 to 48 stats)'),
    ).toBeInTheDocument();
    expect(screen.getByText('No stats were recorded for this game.')).toBeInTheDocument();
    expect(screen.getByText('Linked: Open (Harbour League).')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to event' })).toHaveAttribute('href', '/admin/events/e1');
  });

  it('says when nothing is waiting, shows a refusal, and reports a division the mobile app did not answer for', () => {
    const { unmount } = render(<ResultsView inbox={inbox()} />);
    expect(screen.getByRole('heading', { name: 'Nothing waiting' })).toBeInTheDocument();
    expect(screen.getByText('No finished games in the linked leagues.')).toBeInTheDocument();
    unmount();
    render(
      <ResultsView
        inbox={inbox({
          divisions: [],
          notice: 'No division in this event is linked to a mobile app league yet.',
          errors: ["Could not read Open's finished games from the mobile app. Refresh to try again."],
        })}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'No division in this event is linked to a mobile app league yet.',
    );
    expect(screen.getByRole('alert')).toHaveTextContent("Could not read Open's finished games");
    expect(screen.queryByRole('heading', { name: 'Nothing waiting' })).not.toBeInTheDocument();
  });

  it('confirms a new link from the wizard and moves focus to it, and says nothing otherwise', () => {
    const { unmount } = render(<ResultsView inbox={inbox()} linked />);
    const line = screen.getByText('Linked. Results for this division will now appear in Pending results.');
    expect(line).toHaveFocus();
    unmount();
    render(<ResultsView inbox={inbox()} />);
    expect(screen.queryByText(/^Linked\. Results/)).not.toBeInTheDocument();
    expect(document.body).toHaveFocus();
  });

  it('refreshes from the mobile app on request', async () => {
    const user = userEvent.setup();
    render(<ResultsView inbox={inbox()} />);
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(fake.refresh).toHaveBeenCalledTimes(1);
  });

  it('labels a fixture with its teams, day, time and court, and TBD for what is not set', () => {
    const base = inbox();
    expect(fixtureLabel(base, game({ court: 2 }))).toBe(
      'Harbour Hawks vs Night Owls · Sun 27/09/2026 7:00 pm · Court 2',
    );
    expect(fixtureLabel(base, game({ day: null, court: null, team2Id: null }))).toBe('Harbour Hawks vs TBD · TBD');
  });
});

describe('Results inbox actions (M-06)', () => {
  const g1 = game();
  const g2 = game({ id: 'g2', day: '2026-09-28', time: '10:00' });
  const g3 = game({ id: 'g3', team1Id: 't-owls', team2Id: 't-hawks', day: '2026-09-29' });
  const withGames = (items: InboxItem[], scored: string[] = []) => inbox({ games: [g1, g2, g3], scored, items });
  const status = () => screen.getByText((_, el) => el?.getAttribute('aria-live') === 'polite');

  it('approves the proposed fixture with ids only, says so and moves focus to the message', async () => {
    const user = userEvent.setup();
    render(<ResultsView inbox={withGames([item('proposed', { pick: { gameId: 'g1', game: g1, sameDay: true } })])} />);
    await user.click(screen.getByRole('button', { name: 'Approve Harbour Hawks 58 - 51 Night Owls' }));
    expect(fake.approve).toHaveBeenCalledWith({ eventId: 'e1', mobileGameId: 'fin-1', gameId: 'g1', mode: 'approve' });
    expect(status()).toHaveTextContent(
      'Approved: Harbour Hawks 58 - 51 Night Owls on Harbour Hawks vs Night Owls · Sun 27/09/2026 7:00 pm · Centre Court.',
    );
    expect(status()).toHaveFocus();
  });

  it('re-approves or keeps the published score of a changed result', async () => {
    const user = userEvent.setup();
    const drifted = {
      ...item('drifted', { existing: { gameId: 'g1', source: {} as never } }),
      published: { s1: 58, s2: 51, eventCount: 48 },
    };
    render(<ResultsView inbox={withGames([drifted], ['g1'])} />);
    await user.click(screen.getByRole('button', { name: 'Re-approve Harbour Hawks 58 - 51 Night Owls' }));
    expect(fake.approve).toHaveBeenCalledWith({
      eventId: 'e1',
      mobileGameId: 'fin-1',
      gameId: 'g1',
      mode: 'reapprove',
    });
    await user.click(screen.getByRole('button', { name: 'Keep published score for Harbour Hawks 58 - 51 Night Owls' }));
    expect(fake.keep).toHaveBeenCalledWith({ eventId: 'e1', mobileGameId: 'fin-1' });
    expect(status()).toHaveTextContent('Kept the published score.');
    // A changed result is not offered for attaching.
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('attaches to an unscored fixture only after asking, and Cancel changes nothing', async () => {
    const user = userEvent.setup();
    render(<ResultsView inbox={withGames([item('ambiguous')], ['g2'])} />);
    const picker = screen.getByRole('combobox', { name: 'Attach Harbour Hawks 58 - 51 Night Owls to a fixture' });
    // g2 already holds a score, so it is not offered.
    expect(
      within(picker)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual([
      'Attach to a fixture…',
      'Harbour Hawks vs Night Owls · Sun 27/09/2026 7:00 pm · Centre Court',
      'Night Owls vs Harbour Hawks · Tue 29/09/2026 7:00 pm · Centre Court',
    ]);
    await user.selectOptions(picker, 'g3');
    const ask = screen.getByRole('dialog', { name: 'Attach this result to the chosen fixture?' });
    expect(ask).toHaveTextContent('Harbour Hawks 58 - 51 Night Owls onto Night Owls vs Harbour Hawks');
    await user.click(within(ask).getByRole('button', { name: 'Cancel' }));
    expect(fake.approve).not.toHaveBeenCalled();
    expect(picker).toHaveValue('');
    await user.selectOptions(picker, 'g3');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Attach' }));
    expect(fake.approve).toHaveBeenCalledWith({ eventId: 'e1', mobileGameId: 'fin-1', gameId: 'g3', mode: 'attach' });
  });

  it('offers nothing to press on a result that needs a look or is still settling', () => {
    render(
      <ResultsView
        inbox={withGames([
          item('review', { reason: 'no stats were recorded for this game' }, final({ game_id: 'r', event_count: 0 })),
          item('settling', { reason: 'the last stat arrived less than 5 minutes ago' }, final({ game_id: 's' })),
        ])}
      />,
    );
    expect(screen.queryByRole('button', { name: /^Approve/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('shows a refusal and leaves focus on the button', async () => {
    const user = userEvent.setup();
    fake.approve.mockResolvedValueOnce({
      ok: false,
      error: 'Link both teams for this division before approving this result.',
    });
    render(<ResultsView inbox={withGames([item('proposed', { pick: { gameId: 'g1', game: g1, sameDay: true } })])} />);
    const button = screen.getByRole('button', { name: /^Approve/ });
    await user.click(button);
    expect(status()).toHaveTextContent('Link both teams for this division before approving this result.');
    expect(status()).toHaveAttribute('data-tone', 'error');
    expect(button).toHaveFocus();
    fake.approve.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await user.click(button);
    expect(status()).toHaveTextContent('Could not reach the server. Check your connection.');
  });
});
