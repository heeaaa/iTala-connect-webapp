import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const fake = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: fake.refresh }) }));
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

beforeEach(() => vi.clearAllMocks());

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
