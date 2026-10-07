import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const fake = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: fake.push }) }));

import { builderOptions, stateFromQuery } from '@/features/reports/builder-options';
import { ReportBuilder } from '@/features/reports/report-builder';
import { SAMPLE_REPORT_EVENT, sampleReportSource } from '@/prototype/report-sample';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const OPEN = uuid(11);
const WOMEN = uuid(12);
const options = builderOptions(sampleReportSource());
const events = [
  { id: SAMPLE_REPORT_EVENT, name: 'Te Whānau League 2026' },
  { id: uuid(2), name: 'Winter Cup' },
];

function show(query: Record<string, string> = {}, chosen = true) {
  render(
    <ReportBuilder
      events={events}
      eventId={chosen ? SAMPLE_REPORT_EVENT : ''}
      options={chosen ? options : null}
      initial={stateFromQuery(query)}
    />,
  );
  return userEvent.setup();
}
const select = (name: string) => screen.getByRole('combobox', { name });
const optionsOf = (name: string) =>
  within(select(name))
    .getAllByRole('option')
    .map((o) => o.textContent);
const pushed = () => new URL(String(fake.push.mock.lastCall?.[0]), 'http://x');

beforeEach(() => fake.push.mockReset());

describe('Report form', () => {
  it('asks for an event first, and loads its lists as soon as one is chosen', async () => {
    const user = show({}, false);
    expect(screen.getByText('Choose an event to see its leagues, teams and games.')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'League / division' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show report' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choose an event.');
    expect(select('Event')).toHaveFocus();
    expect(fake.push).not.toHaveBeenCalled();

    await user.selectOptions(select('Event'), 'Winter Cup');
    expect(fake.push).toHaveBeenCalledTimes(1);
    expect(pushed().pathname).toBe('/admin/reports');
    expect(Object.fromEntries(pushed().searchParams)).toEqual({ template: 'results', event: uuid(2) });
    expect(screen.getByText('Loading this event’s leagues, teams and games…')).toBeInTheDocument();
  });

  it('narrows the teams, games and players as soon as the league changes', async () => {
    const user = show({ template: 'player-log' });
    expect(optionsOf('Team')).toHaveLength(7);
    await user.selectOptions(select('Team'), 'Harbour Hawks');
    expect(optionsOf('Player')).toEqual(['Choose a player', 'Bea Cooper', 'Jo Lee']);

    await user.selectOptions(select('League / division'), WOMEN);
    expect(optionsOf('Team')).toEqual(['All teams', 'Tūī', 'Kea']);
    expect(select('Team')).toHaveValue('');
    expect(optionsOf('Player')).toEqual(['Choose a player', 'Ana Pōtae', 'Aroha Smith', 'Lily Chen', 'Mere Hohaia']);
    expect(fake.push).not.toHaveBeenCalled();
  });

  it('shows only the choices each report uses', async () => {
    const user = show();
    expect(select('Game')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Player' })).not.toBeInTheDocument();
    await user.click(screen.getByText('More options'));
    expect(select('Standings')).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: 'Minimum appearances' })).not.toBeInTheDocument();

    await user.selectOptions(select('Report'), 'Player Game Log');
    expect(select('Player')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Game' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Standings' })).not.toBeInTheDocument();

    await user.selectOptions(select('Report'), 'Player Leaderboards');
    expect(screen.getByRole('spinbutton', { name: 'Minimum appearances' })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'Minimum shot attempts' })).toBeInTheDocument();
  });

  it('picks one day on the calendar, then all its games or one game, and shows that report', async () => {
    const user = show({ template: 'box-score' });
    expect(optionsOf('Game')[0]).toBe('All 8 games');
    expect(screen.queryByRole('group', { name: 'Choose a day' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'One day' }));
    // It opens on the latest day with scores.
    const calendar = screen.getByRole('group', { name: 'Choose a day' });
    expect(screen.getByText('October 2026')).toBeInTheDocument();
    expect(within(calendar).getByRole('button', { name: 'Sat 10/10/2026, 3 games' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('Sat 10/10/2026 · 3 games')).toBeInTheDocument();
    expect(optionsOf('Game')[0]).toBe('All 3 games on Sat 10/10/2026');

    await user.click(within(calendar).getByRole('button', { name: 'Sat 03/10/2026, 3 games' }));
    expect(optionsOf('Game')).toEqual([
      'All 3 games on Sat 03/10/2026',
      '6:00 pm · Open · Kōwhai Warriors 38 - 35 Te Kapa Rangi',
      '7:00 pm · Open · Harbour Hawks 34 - 28 Night Owls',
      '8:00 pm · Women · Tūī 48 - 52 Kea',
    ]);

    // All games on the day.
    await user.click(screen.getByRole('button', { name: 'Show report' }));
    expect(Object.fromEntries(pushed().searchParams)).toEqual({
      event: SAMPLE_REPORT_EVENT,
      template: 'box-score',
      dateMode: 'day',
      preview: '1',
      dates: '2026-10-03',
    });

    // One game, in one league.
    await user.selectOptions(select('League / division'), OPEN);
    expect(optionsOf('Game')).toEqual([
      'All 2 games on Sat 03/10/2026',
      '6:00 pm · Kōwhai Warriors 38 - 35 Te Kapa Rangi',
      '7:00 pm · Harbour Hawks 34 - 28 Night Owls',
    ]);
    await user.selectOptions(select('Game'), '7:00 pm · Harbour Hawks 34 - 28 Night Owls');
    await user.click(screen.getByRole('button', { name: 'Show report' }));
    expect(Object.fromEntries(pushed().searchParams)).toMatchObject({
      division: OPEN,
      dates: '2026-10-03',
      game: uuid(102),
    });
  });

  it('clears a chosen game when the new day does not have it, and says when a day has no games', async () => {
    const user = show({ template: 'box-score', dateMode: 'day', dates: '2026-10-03', game: uuid(101) });
    expect(select('Game')).toHaveValue(uuid(101));
    const calendar = screen.getByRole('group', { name: 'Choose a day' });
    await user.click(within(calendar).getByRole('button', { name: 'Sun 04/10/2026, no games' }));
    expect(select('Game')).toHaveValue('');
    expect(optionsOf('Game')).toEqual(['No games on Sun 04/10/2026']);
    expect(screen.getByText('Sun 04/10/2026 · 0 games')).toBeInTheDocument();
  });

  it('chooses a date range in two clicks and a set of game days by toggling them', async () => {
    const user = show({ template: 'results' });
    await user.click(screen.getByRole('radio', { name: 'Date range' }));
    expect(screen.getByText('Sat 03/10/2026 to Sat 17/10/2026 · 8 games')).toBeInTheDocument();
    const range = screen.getByRole('group', { name: 'Choose the first and last day' });
    await user.click(within(range).getByRole('button', { name: 'Sat 10/10/2026, 3 games' }));
    expect(screen.getByText(/Choose the last day to make a range\./)).toBeInTheDocument();
    await user.click(within(range).getByRole('button', { name: 'Sat 03/10/2026, 3 games' }));
    expect(screen.getByText('Sat 03/10/2026 to Sat 10/10/2026 · 6 games')).toBeInTheDocument();
    expect(within(range).getByRole('button', { name: 'Sun 04/10/2026, no games' })).toHaveAttribute('data-range');
    await user.click(screen.getByRole('button', { name: 'Show report' }));
    expect(pushed().searchParams.get('dates')).toBe('2026-10-03,2026-10-10');

    await user.click(screen.getByRole('radio', { name: 'Several days' }));
    const days = screen.getByRole('group', { name: 'Choose game days' });
    expect(screen.getByText('No days chosen')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show report' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choose at least one game day on the calendar.');
    expect(days).toHaveFocus();
    await user.click(within(days).getByRole('button', { name: 'Sat 17/10/2026, 2 games' }));
    await user.click(within(days).getByRole('button', { name: 'Sat 03/10/2026, 3 games' }));
    expect(screen.getByRole('alert')).toHaveTextContent('');
    expect(screen.getByText('2 days · 5 games')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show report' }));
    expect(pushed().searchParams.get('dates')).toBe('2026-10-03,2026-10-17');
    expect(pushed().searchParams.get('dateMode')).toBe('dates');
    // Each chosen day is repeated as a chip that removes it, without going back to the calendar.
    const chips = screen.getByRole('list', { name: 'Chosen days' });
    expect(
      within(chips)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['03/10/2026 · Remove', '17/10/2026 · Remove']);
    await user.click(within(chips).getByRole('button', { name: 'Remove Sat 03/10/2026' }));
    // Focus moves to the chip now in its place, then to the calendar when none are left.
    expect(within(chips).getByRole('button', { name: 'Remove Sat 17/10/2026' })).toHaveFocus();
    expect(screen.getByText('1 day · 2 games')).toBeInTheDocument();
    expect(within(days).getByRole('button', { name: 'Sat 03/10/2026, 3 games' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('moves between months and days from the keyboard', async () => {
    const user = show({ template: 'box-score', dateMode: 'day', dates: '2026-10-03' });
    await user.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByText('November 2026')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(screen.getByText('September 2026')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next month' }));
    const calendar = screen.getByRole('group', { name: 'Choose a day' });
    within(calendar).getByRole('button', { name: 'Sat 03/10/2026, 3 games' }).focus();
    await user.keyboard('{ArrowDown}');
    expect(within(calendar).getByRole('button', { name: 'Sat 10/10/2026, 3 games' })).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(within(calendar).getByRole('button', { name: 'Fri 09/10/2026, no games' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByText('Fri 09/10/2026 · 0 games')).toBeInTheDocument();
  });

  it('will not show a team report without a team, nor a game log without a player', async () => {
    const user = show({ template: 'team' });
    expect(optionsOf('Team')[0]).toBe('Choose a team');
    await user.click(screen.getByRole('button', { name: 'Show report' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a team for team statistics.');
    expect(select('Team')).toHaveFocus();
    expect(select('Team')).toHaveAttribute('aria-invalid', 'true');
    expect(fake.push).not.toHaveBeenCalled();
    await user.selectOptions(select('Team'), 'Kea');
    expect(screen.getByRole('alert')).toHaveTextContent('');
    await user.click(screen.getByRole('button', { name: 'Show report' }));
    expect(pushed().searchParams.get('team')).toBe(uuid(26));

    await user.selectOptions(select('Report'), 'Player Game Log');
    await user.click(screen.getByRole('button', { name: 'Show report' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a player for the game log.');
    await user.selectOptions(select('Player'), 'Lily Chen');
    await user.click(screen.getByRole('button', { name: 'Show report' }));
    expect(Object.fromEntries(pushed().searchParams)).toMatchObject({
      template: 'player-log',
      player: 'm-lily',
      team: uuid(26),
    });
  });

  it('leaves more options open while a choice in it goes back to its default', async () => {
    const user = show({ template: 'leaders' });
    const more = screen.getByText('More options').closest('details')!;
    expect(more).not.toHaveAttribute('open');
    await user.click(screen.getByText('More options'));
    const appearances = screen.getByRole('spinbutton', { name: 'Minimum appearances' });
    await user.clear(appearances);
    await user.type(appearances, '2');
    await user.clear(appearances);
    await user.type(appearances, '0');
    expect(more).toHaveAttribute('open');
    expect(appearances).toHaveFocus();
  });

  it('offers to find players for a league when the whole event could not be read', async () => {
    render(
      <ReportBuilder
        events={events}
        eventId={SAMPLE_REPORT_EVENT}
        options={{ ...options, players: [], playersComplete: false }}
        initial={stateFromQuery({ template: 'player-log' })}
      />,
    );
    const user = userEvent.setup();
    expect(screen.getByText(/Player stats could not be read for the whole event\./)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show report' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Player stats could not be read for the whole event. Choose a league or team, then Find players.',
    );
    await user.selectOptions(select('League / division'), WOMEN);
    await user.click(screen.getByRole('button', { name: 'Find players' }));
    expect(pushed().pathname).toBe('/admin/reports');
    expect(Object.fromEntries(pushed().searchParams)).toEqual({
      event: SAMPLE_REPORT_EVENT,
      template: 'player-log',
      division: WOMEN,
    });
  });

  it('offers "Show all player stats" for reports with player stats, and sends it when ticked', async () => {
    const user = show({ template: 'results' });
    expect(screen.queryByRole('checkbox', { name: 'Show all player stats' })).not.toBeInTheDocument();
    await user.selectOptions(select('Report'), 'Game Box Score Book');
    const box = screen.getByRole('checkbox', { name: 'Show all player stats' });
    expect(box).not.toBeChecked();
    expect(box).toHaveAccessibleDescription(
      'Adds rebounds, assists, steals, blocks and fouls, and shooting and turnovers where the game tracked them.',
    );
    await user.click(screen.getByRole('button', { name: 'Show report' }));
    expect(pushed().searchParams.has('stats')).toBe(false);
    await user.click(box);
    await user.click(screen.getByRole('button', { name: 'Show report' }));
    expect(pushed().searchParams.get('stats')).toBe('all');
  });

  it('keeps more options open when one is in use, and sends the leaderboard minimums', async () => {
    const user = show({ template: 'leaders', minAppearances: '2', relative: 'last-five' });
    const more = screen.getByText('More options').closest('details')!;
    expect(more).toHaveAttribute('open');
    expect(select('Recent games')).toHaveValue('last-five');
    const attempts = screen.getByRole('spinbutton', { name: 'Minimum shot attempts' });
    await user.clear(attempts);
    await user.type(attempts, '5000');
    expect(attempts).toHaveValue(1000);
    await user.click(screen.getByRole('button', { name: 'Show report' }));
    expect(Object.fromEntries(pushed().searchParams)).toMatchObject({
      template: 'leaders',
      relative: 'last-five',
      minAppearances: '2',
      minAttempts: '1000',
    });
  });
});

/** What the page passes once it lands on an address (src/app/admin/reports/page.tsx). */
function landing(search: string, chosen = true) {
  const query = Object.fromEntries(new URLSearchParams(search));
  return (
    <ReportBuilder
      events={events}
      eventId={chosen ? (query.event ?? '') : ''}
      options={chosen && query.event === SAMPLE_REPORT_EVENT ? options : null}
      initial={stateFromQuery(query)}
    />
  );
}
const pushedSearch = () => pushed().search.slice(1);

describe('Report form across page loads', () => {
  it('keeps a report chosen while the event loads (bug found 07/10/2026)', async () => {
    const { rerender } = render(landing(''));
    const user = userEvent.setup();
    await user.selectOptions(select('Event'), 'Te Whānau League 2026');
    expect(pushedSearch()).toBe(`template=results&event=${SAMPLE_REPORT_EVENT}`);
    // Still loading: the organiser picks the report.
    await user.selectOptions(select('Report'), 'Cumulative League Statistics');
    rerender(landing(pushedSearch()));
    expect(select('League / division')).toBeInTheDocument();
    expect(select('Report')).toHaveValue('league');
  });

  it('shows what the address says when the page was not loaded by the form', async () => {
    const { rerender } = render(landing(`template=league&event=${SAMPLE_REPORT_EVENT}`));
    const user = userEvent.setup();
    await user.selectOptions(select('Report'), 'Player Leaderboards');
    // A saved filter (or Back) opens another address.
    rerender(landing(`template=box-score&event=${SAMPLE_REPORT_EVENT}&division=${OPEN}&preview=1`));
    expect(select('Report')).toHaveValue('box-score');
    expect(select('League / division')).toHaveValue(OPEN);
  });

  it('keeps a change made while a report builds, and the report it asked for', async () => {
    const { rerender } = render(landing(`template=box-score&event=${SAMPLE_REPORT_EVENT}`));
    const user = userEvent.setup();
    await user.selectOptions(select('League / division'), WOMEN);
    await user.click(screen.getByRole('button', { name: 'Show report' }));
    const asked = pushedSearch();
    expect(asked).toContain(`division=${WOMEN}`);
    await user.click(screen.getByRole('checkbox', { name: 'Show all player stats' }));
    rerender(landing(asked));
    expect(screen.getByRole('checkbox', { name: 'Show all player stats' })).toBeChecked();
    expect(select('League / division')).toHaveValue(WOMEN);
    expect(select('Report')).toHaveValue('box-score');
  });

  it('starts another event afresh, keeping the report and "Show all player stats"', async () => {
    const { rerender } = render(landing(`template=box-score&event=${SAMPLE_REPORT_EVENT}&division=${OPEN}&stats=all`));
    const user = userEvent.setup();
    await user.selectOptions(select('Event'), 'Winter Cup');
    expect(Object.fromEntries(pushed().searchParams)).toEqual({ template: 'box-score', stats: 'all', event: uuid(2) });
    // The other event's page: its own lists (none in this sample), the same report and box ticked.
    rerender(landing(pushedSearch(), false));
    await user.selectOptions(select('Event'), 'Te Whānau League 2026');
    rerender(landing(pushedSearch()));
    expect(select('Report')).toHaveValue('box-score');
    expect(select('League / division')).toHaveValue('');
    expect(screen.getByRole('checkbox', { name: 'Show all player stats' })).toBeChecked();
  });
});
