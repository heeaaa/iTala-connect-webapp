import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EventShell } from '@/components/event/event-shell';
import { type TodayEvent } from '@/components/event/today/model';
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

describe('Today screen: the time column shows real start times (reported 05/10/2026)', () => {
  // One court with games 65 minutes apart. The old hourly ruler, counted
  // from the first game, read 2:10, 3:10, 4:10, 5:10 and 6:10 pm beside them.
  const SUNDAY = '2026-10-11';
  const TIMES = ['13:10', '14:15', '15:20', '16:25', '17:30'];
  const LABELS = ['1:10 pm', '2:15 pm', '3:20 pm', '4:25 pm', '5:30 pm'];

  /** Each slot is a start time on Main Gym, or [time, court]. */
  type Slot = string | [string, number];

  function sundayLeague(slots: Slot[] = TIMES, clock = at('12:00', '2026-10-05')): TodayEvent {
    const base = sampleLeague({ courts: 2, clock });
    const teams = base.teams.filter((t) => t.divisionId === 'open');
    return {
      ...base,
      days: ['2026-10-04', SUNDAY],
      courtNames: ['Main Gym', 'Side Gym'],
      games: slots.map((slot, i) => ({
        id: `sunday-${i}`,
        day: SUNDAY,
        time: typeof slot === 'string' ? slot : slot[0],
        court: typeof slot === 'string' ? 1 : slot[1],
        team1Id: teams[i % 4]!.id,
        team2Id: teams[(i + 1) % 4]!.id,
        score1: null,
        score2: null,
        divisionId: 'open',
        label: "Men's Open - Group A",
        type: 'group',
      })),
    };
  }

  function renderSunday(slots: Slot[] = TIMES, clock = at('12:00', '2026-10-05')) {
    render(<TodaySchedule event={sundayLeague(slots, clock)} clock={clock} selectedDay={null} feed="live" />);
    return screen.getByRole('region', { name: 'Games by time and court' });
  }

  /** Each time-column label's grid rows, top to bottom. */
  function labelRanges(grid: HTMLElement) {
    return [...grid.querySelectorAll<HTMLElement>('[aria-hidden="true"]')]
      .filter((el) => el.firstElementChild?.tagName === 'TIME')
      .map((el) => el.style.gridRow);
  }

  /** [first row, rows spanned] of a game cell. */
  function cellRows(card: HTMLElement): [number, number] {
    const [first, span] = card.style.gridRow.split('/');
    return [Number(first), Number(span!.replace('span', ''))];
  }

  /** Times printed in the grid's time column, top to bottom (not the cards' own text, not the now tag). */
  function columnTimes(grid: HTMLElement) {
    return within(grid)
      .getAllByText(/^\d{1,2}:\d{2} [ap]m$/)
      .filter((el) => !el.closest('article') && !el.closest('[class*="nowLine"]'))
      .map((el) => el.textContent);
  }

  it('labels each game with its own start time, and nothing else', () => {
    const grid = renderSunday();
    expect(columnTimes(grid)).toEqual(LABELS);
  });

  it('puts every label on the grid row where its games start, running to the next start', () => {
    const grid = renderSunday();
    const rowStart = (el: Element) => Number((el as HTMLElement).style.gridRow.split('/')[0]);
    const labelRows = within(grid)
      .getAllByText(/^\d{1,2}:\d{2} [ap]m$/)
      .filter((el) => !el.closest('article'))
      .map((el) => rowStart(el.closest('[style*="grid-row"]')!));
    const cardRows = within(grid)
      .getAllByRole('article')
      .map((card) => rowStart(card));
    expect(labelRows).toEqual(cardRows);
    // Line 1 is the court header; 5-minute rows from 1:10 pm, the last ending after 6:30 pm.
    expect(labelRanges(grid)).toEqual(['2 / 15', '15 / 28', '28 / 41', '41 / 54', '54 / 66']);
  });

  it('lists the cards in reading order, time then court, whatever order the games were stored in', () => {
    const grid = renderSunday([
      ['15:20', 1],
      ['13:10', 2],
      ['14:15', 1],
      ['13:10', 1],
    ]);
    const lead = (card: HTMLElement) => card.textContent?.match(/^\d{1,2}:\d{2} [ap]m, \w+ Gym/)?.[0];
    expect(within(grid).getAllByRole('article').map(lead)).toEqual([
      '1:10 pm, Main Gym',
      '1:10 pm, Side Gym',
      '2:15 pm, Main Gym',
      '3:20 pm, Main Gym',
    ]);
  });

  it('says when and where each game is for screen readers', () => {
    const grid = renderSunday();
    const cards = within(grid).getAllByRole('article');
    const lead = (card: HTMLElement) => card.textContent?.match(/^\d{1,2}:\d{2} [ap]m, Main Gym/)?.[0] ?? null;
    expect(cards.map(lead)).toEqual(LABELS.map((t) => `${t}, Main Gym`));
  });

  it('bands the start time whose games are on court, for their 60-minute slot', () => {
    const grid = renderSunday(TIMES, at('14:40', SUNDAY));
    const current = within(grid)
      .getAllByText(/^\d{1,2}:\d{2} [ap]m$/)
      .filter((el) => el.closest('[data-current]'));
    expect(current.map((el) => el.textContent)).toEqual(['2:15 pm']);
    const label = current[0]!.closest<HTMLElement>('[style*="grid-row"]')!;
    expect(label.style.gridRow).toBe('15 / 28');
    // 2:15 to 3:15 pm; the label itself runs on to the 3:20 pm start.
    expect(grid.querySelector<HTMLElement>('[class*="timeBand"]')!.style.gridRow).toBe('15 / 27');
    expect(screen.getByText('2:40 pm', { selector: 'time' }).parentElement).toHaveTextContent(/^Now\s*2:40 pm$/);
  });

  it('bands nothing in the changeover between games, while the now line still shows', () => {
    const grid = renderSunday(TIMES, at('15:17', SUNDAY));
    expect(grid.querySelector('[class*="timeBand"]')).toBeNull();
    expect(grid.querySelector('[data-current]')).toBeNull();
    expect(screen.getByText('3:17 pm', { selector: 'time' }).parentElement).toHaveTextContent(/^Now\s*3:17 pm$/);
  });

  it('never draws a game over the next one on its court when games are 45 minutes apart', () => {
    const grid = renderSunday(['18:00', '18:45', '19:30', '20:15']);
    expect(columnTimes(grid)).toEqual(['6:00 pm', '6:45 pm', '7:30 pm', '8:15 pm']);
    const rows = within(grid).getAllByRole('article').map(cellRows);
    rows.slice(1).forEach(([first], i) => expect(rows[i]![0] + rows[i]![1]).toBeLessThanOrEqual(first));
    // The last game keeps its full 60-minute slot: 12 five-minute rows.
    expect(rows.at(-1)![1]).toBe(12);
  });

  it('keeps a whole number of rows when a game starts on an odd minute', () => {
    const grid = renderSunday(['13:10', '14:13']);
    expect(columnTimes(grid)).toEqual(['1:10 pm', '2:13 pm']);
    const inner = grid.firstElementChild as HTMLElement;
    expect(inner.style.getPropertyValue('--rows')).toBe('25');
    // The last label runs past the last row (25 rows after the header: line 27).
    expect(labelRanges(grid)).toEqual(['2 / 14', '14 / 27']);
  });

  it('stacks two starts from the same five minutes in one label, one per court', () => {
    const grid = renderSunday([
      ['13:10', 1],
      ['13:12', 2],
    ]);
    const [first, second] = within(grid)
      .getAllByText(/^\d{1,2}:\d{2} [ap]m$/)
      .filter((el) => !el.closest('article'));
    expect([first!.textContent, second!.textContent]).toEqual(['1:10 pm', '1:12 pm']);
    expect(first!.parentElement).toBe(second!.parentElement);
    const cards = within(grid).getAllByRole('article');
    expect(cards.map((card) => card.textContent?.match(/^\d{1,2}:\d{2} [ap]m, \w+ Gym/)?.[0])).toEqual([
      '1:10 pm, Main Gym',
      '1:12 pm, Side Gym',
    ]);
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
  it('links to all public events and applies the selected banner crop above the title', () => {
    render(
      <EventShell
        name="One day"
        days={['2026-10-09']}
        theme={{ primary: '#FFCC00', bg: '#0D0D0D', text: '#E0E0E0', textSecondary: '#888888', heading: '#FFFFFF' }}
        tab="schedule"
        bannerUrl="https://x.test/banner.webp"
        bannerFocus="right"
        fontClassName=""
      >
        <p>content</p>
      </EventShell>,
    );
    expect(screen.getByRole('link', { name: 'All events' })).toHaveAttribute('href', '/');
    expect(document.querySelector('img[src="https://x.test/banner.webp"]')).toHaveAttribute('data-focus', 'right');
    expect(screen.getByRole('heading', { name: 'One day' })).toBeInTheDocument();
  });
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
