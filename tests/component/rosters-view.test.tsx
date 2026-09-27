import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const fake = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: fake.refresh }) }));
import { RostersView } from '@/app/admin/events/[eventId]/divisions/[divisionId]/mobile-rosters/rosters-view';
import type { RosterComparison } from '@/server/mobile/rosters';

/* Compare rosters (PRD M-11): what the page says, read only. */

const base = { event: { id: 'e1', name: 'League Night' }, division: { id: 'd1', name: 'Open' } };
const league = { name: 'Harbour League', season: '2026' };
const ready: RosterComparison = {
  ...base,
  state: 'ready',
  league,
  unpairedMobile: ['Southern Stars'],
  teams: [
    {
      id: 't-hawks',
      name: 'Harbour Hawks',
      mobile: { id: 'm1', name: 'Harbour Hawks BC', teamOnly: false },
      connect: [
        { number: '04', name: 'Ari' },
        { number: '', name: 'Kai' },
      ],
      mobileRoster: [
        { number: '04', name: 'Ari' },
        { number: '', name: 'kai' },
      ],
      same: true,
      note: 'Same in both (2 players)',
    },
    {
      id: 't-owls',
      name: 'Night Owls',
      mobile: { id: 'm2', name: 'Night Owls', teamOnly: true },
      connect: [{ number: '99', name: 'Unlisted' }],
      mobileRoster: [],
      same: false,
      note: 'The lists differ (1 in iTala Connect, 0 in the mobile app)',
    },
    { id: 't-kea', name: 'Kea', mobile: null, connect: [], mobileRoster: null, same: null, note: null },
  ],
};

beforeEach(() => vi.clearAllMocks());

describe('RostersView (M-11)', () => {
  it('shows each team as two lists with one note, and a summary of the paired teams', () => {
    render(<RostersView comparison={ready} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Compare “Open” rosters' })).toBeInTheDocument();
    expect(screen.getByText(/^Read only\. Linked to Harbour League \(2026\)\./)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('1 of 2 paired teams differs. 1 not paired.');

    const hawks = screen.getByRole('region', { name: 'Harbour Hawks' });
    expect(within(hawks).getByText('Same in both (2 players)')).toHaveAttribute('data-roster', 'same');
    expect(within(hawks).getByRole('heading', { level: 3, name: 'iTala Connect · 2 players' })).toBeInTheDocument();
    expect(
      within(hawks).getByRole('heading', { level: 3, name: 'Mobile app: Harbour Hawks BC · 2 players' }),
    ).toBeInTheDocument();
    const [connect, mobile] = within(hawks).getAllByRole('table');
    expect(
      within(connect!)
        .getAllByRole('row')
        .map((r) => r.textContent),
    ).toEqual(['NumberPlayer', '04Ari', '-Kai']);
    expect(
      within(mobile!)
        .getAllByRole('row')
        .map((r) => r.textContent),
    ).toEqual(['NumberPlayer', '04Ari', '-kai']);
    expect(within(connect!).getByLabelText('No number')).toHaveTextContent('-');

    const owls = screen.getByRole('region', { name: 'Night Owls' });
    expect(
      within(owls).getByText(
        'The lists differ (1 in iTala Connect, 0 in the mobile app). The mobile app keeps no roster for this team (team only).',
      ),
    ).toHaveAttribute('data-roster', 'differs');
    expect(within(owls).getByText('No players.')).toBeInTheDocument();

    const kea = screen.getByRole('region', { name: 'Kea' });
    expect(within(kea).getByText(/^Not paired with a mobile team/)).toHaveAttribute('data-roster', 'unpaired');
    expect(within(kea).getByRole('link', { name: 'Pair it' })).toHaveAttribute(
      'href',
      '/admin/events/e1/divisions/d1/mobile-link',
    );
    expect(
      within(kea)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent),
    ).toEqual(['iTala Connect · 0 players']);
    expect(
      screen.getByText('In the mobile league but not paired with a team here: Southern Stars.'),
    ).toBeInTheDocument();
  });

  it('has nothing that changes data: only Refresh and links', async () => {
    const user = userEvent.setup();
    render(<RostersView comparison={ready} />);
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Refresh']);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(fake.refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'Back to event' })).toHaveAttribute('href', '/admin/events/e1');
  });

  it('says so when every paired team is the same, or none is paired', () => {
    const same = { ...ready, unpairedMobile: [], teams: [ready.teams[0]!] } as RosterComparison;
    const { unmount } = render(<RostersView comparison={same} />);
    expect(screen.getByRole('status')).toHaveTextContent('The paired team is the same in both.');
    unmount();
    render(<RostersView comparison={{ ...ready, unpairedMobile: [], teams: [ready.teams[2]!] } as RosterComparison} />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'No team in this division is paired with a mobile team yet. 1 not paired.',
    );
  });

  it('explains a division that is not linked, a league that is gone, and a mobile app that does not answer', () => {
    const { unmount } = render(<RostersView comparison={{ ...base, state: 'not_linked' }} />);
    expect(screen.getByRole('heading', { name: 'Not linked to the mobile app' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Link to mobile app' })).toHaveAttribute(
      'href',
      '/admin/events/e1/divisions/d1/mobile-link',
    );
    expect(screen.queryByRole('button', { name: 'Refresh' })).not.toBeInTheDocument();
    unmount();
    const gone = render(<RostersView comparison={{ ...base, state: 'league_gone', league }} />);
    expect(
      screen.getByText(/linked to Harbour League \(2026\), which the mobile app no longer has/),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Choose another league' })).toBeInTheDocument();
    gone.unmount();
    render(<RostersView comparison={{ ...base, state: 'unreachable', league }} />);
    expect(screen.getByRole('heading', { name: 'Could not reach the mobile app' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
  });
});
