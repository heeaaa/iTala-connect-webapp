import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EventShell } from '@/components/event/event-shell';
import { TodaySchedule } from '@/components/event/today/today-schedule';
import { toMinutes } from '@/domain/game-day';
import { SAMPLE_GAME_DAY, sampleLeague } from '@/prototype/league-night';

vi.mock('next/navigation', () => ({
  usePathname: () => '/events/sample',
  useSearchParams: () => new URLSearchParams('tab=schedule'),
}));

const at = (hhmm: string, date = SAMPLE_GAME_DAY) => ({ date, minutes: toMinutes(hhmm) });

function renderToday(hhmm = '19:25', over: Partial<Parameters<typeof TodaySchedule>[0]> = {}) {
  const clock = at(hhmm);
  const event = sampleLeague({ courts: 2, clock });
  return render(<TodaySchedule event={event} clock={clock} selectedDay={null} feed="live" {...over} />);
}

function court(name: string) {
  return screen.getByRole('region', { name });
}

beforeEach(() => window.localStorage.clear());

describe('Today screen: courts on a game day', () => {
  it('opens on tonight with each court showing its game on court and the score', () => {
    renderToday('19:25');
    expect(screen.getByRole('link', { current: 'page' })).toHaveTextContent('TonightFri 25/09/2026');
    expect(screen.getByRole('status')).toHaveTextContent('Live. Scores update automatically.');

    const c1 = court('Court 1');
    expect(within(c1).getByText('On court')).toBeInTheDocument();
    expect(within(c1).getByText('started 7:00 pm')).toBeInTheDocument();
    expect(within(c1).getByText('Commercial Drive Owls')).toBeInTheDocument();
    // Stations under the court: the last result and the next game.
    expect(within(c1).getByText('Final').closest('div')).toHaveTextContent('6:00 pm');
    expect(within(c1).getByText('Up next').closest('div')).toHaveTextContent('8:00 pm');
  });

  it('never labels a finished game without both scores as Final on the court panel (review fix 1)', () => {
    renderToday('19:25');
    // Court 2's 6:00 pm game has no scores yet in the sample data.
    const c2 = court('Court 2');
    const row = within(c2).getByText('Awaiting score').closest('div')!;
    expect(row).toHaveTextContent('6:00 pm');
    expect(row).toHaveTextContent(/Kits Ravens\s*vs\s*Main St Mambas/);
    expect(row.textContent).not.toContain(',');
    expect(within(c2).queryByText('Final')).not.toBeInTheDocument();
    // A scored result still reads as a Final with a comma between the sides.
    expect(within(court('Court 1')).getByText('Final').closest('div')).toHaveTextContent(
      'Harbour Hawks66,Burnaby Bolts49',
    );
  });

  it('shows Semis / Finals in the key only on a day with playoff games', () => {
    const clock = at('19:25');
    const event = sampleLeague({ courts: 2, clock });
    const { unmount } = render(<TodaySchedule event={event} clock={clock} selectedDay={null} feed="live" />);
    const key = screen.getByRole('list', { name: 'Key' });
    expect(key).toHaveTextContent("Men's Open");
    expect(key).not.toHaveTextContent('Semis / Finals');
    unmount();
    render(<TodaySchedule event={event} clock={clock} selectedDay="2026-10-09" feed="live" />);
    expect(screen.getByRole('list', { name: 'Key' })).toHaveTextContent('Semis / Finals');
  });

  it('marks a finished game with no score as awaiting score', () => {
    renderToday('19:25');
    const cells = screen.getAllByRole('article');
    expect(cells.some((c) => c.textContent?.includes('Awaiting score'))).toBe(true);
  });

  it('before the first game, each court waits for its first game with the start time', () => {
    renderToday('17:30');
    const c1 = court('Court 1');
    expect(within(c1).getAllByText('Up next')[0]).toBeInTheDocument();
    // The start time is painted at centre court.
    expect(
      within(c1).getByText((_, el) => el?.tagName === 'P' && el.textContent === 'Starts 6:00 pm'),
    ).toBeInTheDocument();
    expect(within(c1).getByText('Then').closest('div')).toHaveTextContent('7:00 pm');
  });

  it('after the last game, courts show the final and nothing else to come', () => {
    renderToday('22:30');
    const c1 = court('Court 1');
    expect(within(c1).getByText('No more games on this court.')).toBeInTheDocument();
    expect(screen.queryByText(/^Now /)).not.toBeInTheDocument();
  });

  it('says when scores may be out of date', () => {
    renderToday('19:25', { feed: 'reconnecting' });
    expect(screen.getByRole('status')).toHaveTextContent('Reconnecting. Scores may be out of date.');
  });

  it('draws the now line only inside tonight', () => {
    renderToday('19:25');
    expect(screen.getByText('7:25 pm', { selector: 'time' }).parentElement).toHaveTextContent(/^Now\s*7:25 pm$/);
  });
});

describe('Today screen: your team (PRD P-04, remembered on this device)', () => {
  it('answers when and where the team plays next, remembers it, and steps other games back', async () => {
    const user = userEvent.setup();
    const { unmount } = renderToday('19:25');

    await user.click(screen.getByRole('button', { name: 'Kits Ravens' }));
    const answer = screen.getByRole('heading', { name: 'Your team: Kits Ravens' }).parentElement!;
    expect(answer).toHaveTextContent('Next: 8:00 pm');
    expect(answer).toHaveTextContent('Court 2, vs Burnaby Bolts');

    const cells = screen.getAllByRole('article');
    const mine = cells.filter((c) => c.dataset.match === 'true');
    expect(mine.length).toBe(2);
    expect(cells.filter((c) => c.dataset.match === 'false').length).toBe(cells.length - 2);

    unmount();
    renderToday('19:25');
    expect(screen.getByRole('heading', { name: 'Your team: Kits Ravens' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.queryByRole('heading', { name: /Your team/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole('article').every((c) => c.dataset.match === undefined)).toBe(true);
  });

  it('says so when the team plays on court now', async () => {
    const user = userEvent.setup();
    renderToday('19:25');
    await user.click(screen.getByRole('button', { name: 'Fraser Lynx' }));
    expect(screen.getByRole('heading', { name: 'Your team: Fraser Lynx' }).parentElement).toHaveTextContent(
      'On court now Court 2, vs Trout Lake Otters',
    );
  });

  it('can change team, and shows the next game day when none is left tonight', async () => {
    const user = userEvent.setup();
    renderToday('21:40');
    await user.click(screen.getByRole('button', { name: 'Harbour Hawks' }));
    await user.click(screen.getByRole('button', { name: 'Change team' }));
    await user.click(screen.getByRole('button', { name: 'Burnaby Bolts' }));
    expect(screen.getByRole('heading', { name: 'Your team: Burnaby Bolts' }).parentElement).toHaveTextContent(
      'Next: Fri 02/10/2026, 6:00 pm',
    );
  });

  it('ignores a stored team that is not in this event', () => {
    window.localStorage.setItem('itala:team:sample-eastside-friday', 'someone-else');
    renderToday('19:25');
    expect(screen.queryByRole('heading', { name: /Your team/ })).not.toBeInTheDocument();
  });

  it('says when the team has no game on the chosen day', async () => {
    const user = userEvent.setup();
    const clock = at('19:25');
    const event = sampleLeague({ courts: 2, clock });
    // Playoff day: every team is still TBD.
    render(<TodaySchedule event={event} clock={clock} selectedDay="2026-10-09" feed="live" />);
    await user.click(screen.getByRole('button', { name: 'Kits Ravens' }));
    expect(screen.getByText('No Kits Ravens games on Fri 09/10/2026.')).toBeInTheDocument();
  });

  it('works when storage is blocked', async () => {
    const user = userEvent.setup();
    const blocked = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(blocked);
    renderToday('19:25');
    await user.click(screen.getByRole('button', { name: 'Kits Ravens' }));
    expect(screen.getByRole('heading', { name: 'Your team: Kits Ravens' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.queryByRole('heading', { name: /Your team/ })).not.toBeInTheDocument();
  });
});

describe('Today screen: other days and empty states', () => {
  it('shows another day as a grid without court panels', () => {
    const clock = at('19:25');
    const event = sampleLeague({ courts: 2, clock });
    render(<TodaySchedule event={event} clock={clock} selectedDay="2026-10-09" feed="live" />);
    expect(screen.getByRole('heading', { name: 'Games on Fri 09/10/2026' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Court 1' })).not.toBeInTheDocument();
    expect(screen.getByText('Showing Fri 09/10/2026')).toBeInTheDocument();
    expect(screen.getAllByText('TBD').length).toBeGreaterThan(0);
  });

  it('opens on the next game day between game days', () => {
    const clock = at('12:00', '2026-09-28');
    const event = sampleLeague({ courts: 2, clock });
    render(<TodaySchedule event={event} clock={clock} selectedDay={null} feed="live" />);
    expect(screen.getByText('Next game day: Fri 02/10/2026')).toBeInTheDocument();
  });

  it('says there is no schedule yet for an event with no days', () => {
    const clock = at('19:25');
    const event = { ...sampleLeague({ courts: 2, clock }), days: [], games: [] };
    render(<TodaySchedule event={event} clock={clock} selectedDay={null} feed="live" />);
    expect(screen.getByText('No schedule yet.')).toBeInTheDocument();
  });

  it('says there are no games on an event day with nothing scheduled, and lists unscheduled games', () => {
    const clock = at('19:25');
    const base = sampleLeague({ courts: 2, clock });
    const event = {
      ...base,
      games: base.games
        .filter((g) => g.day !== SAMPLE_GAME_DAY)
        .concat({ ...base.games[0]!, id: 'loose', day: null, time: null, court: null }),
    };
    render(<TodaySchedule event={event} clock={clock} selectedDay={null} feed="live" />);
    expect(screen.getByText('No games on Fri 25/09/2026.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Unscheduled' })).toBeInTheDocument();
  });
});

describe('Today screen: owner score entry (PRD P-08)', () => {
  it('sends whole numbers, clears on blank, and ignores anything else', async () => {
    const user = userEvent.setup();
    const onScoreChange = vi.fn();
    renderToday('19:25', { onScoreChange });
    const input = screen.getByRole('textbox', { name: "Harbour Hawks score, 6:00 pm Men's Open - Group A" });

    await user.clear(input);
    expect(onScoreChange).toHaveBeenLastCalledWith(expect.any(String), 1, null);
    await user.type(input, '7');
    expect(onScoreChange).toHaveBeenLastCalledWith(expect.any(String), 1, 7);
    onScoreChange.mockClear();
    await user.type(input, '-');
    await user.type(input, 'e');
    expect(onScoreChange).not.toHaveBeenCalled();
  });
});

describe('EventShell (PRD P-01 to P-03)', () => {
  it('sets the organiser colours as event tokens and keeps the tab in the URL', () => {
    const { container } = render(
      <EventShell
        name="Eastside Friday League"
        days={['2026-10-09', '2026-09-11']}
        theme={{ primary: '#C8102E', bg: '#FFFFFF', text: '#1A1A1A', textSecondary: 'bad', heading: '#0B2545' }}
        tab="teams"
        fontClassName="fonts"
      >
        <p>content</p>
      </EventShell>,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.getPropertyValue('--ev-accent')).toBe('#C8102E');
    expect(root.style.getPropertyValue('--ev-on-accent')).toBe('#FFFFFF');
    // An invalid stored colour falls back to the default for that slot.
    expect(root.style.getPropertyValue('--ev-muted')).toBe('#888888');
    expect(screen.getByText('11/09/2026 to 09/10/2026')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Teams' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Standings' })).toHaveAttribute('href', '/events/sample?tab=standings');
    expect(screen.getByText('Powered by iTala Connect')).toBeInTheDocument();
  });

  it('shows a single date for a one-day event', () => {
    render(
      <EventShell
        name="One day"
        days={['2026-10-09']}
        theme={{ primary: '#FFCC00', bg: '#0D0D0D', text: '#E0E0E0', textSecondary: '#888888', heading: '#FFFFFF' }}
        tab="schedule"
        fontClassName=""
      >
        <p>content</p>
      </EventShell>,
    );
    expect(screen.getByText('09/10/2026')).toBeInTheDocument();
  });
});
