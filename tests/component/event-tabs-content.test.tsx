import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { EventMedia, RulesTab, StandingsTab, TeamsTab } from '@/components/event/event-tabs-content';
import { type Game } from '@/domain/types';

const g = (t1: string, t2: string, s1: number | null, s2: number | null): Game => ({
  day: '2026-10-03',
  time: '09:00',
  court: 1,
  divisionId: 'd1',
  groupId: null,
  team1Id: t1,
  team2Id: t2,
  label: 'Open',
  type: 'group',
  score1: s1,
  score2: s2,
});
const names: Record<string, string> = { a: 'Hawks', b: 'Bolts', c: 'Owls', d: 'Lynx' };

describe('StandingsTab (PRD P-09)', () => {
  it('ranks by the PRD 12.4 rules and marks the top three and the difference in words', () => {
    render(
      <StandingsTab
        divisions={[{ id: 'd1', name: 'Open', color: '#6C63FF', teamIds: ['a', 'b', 'c', 'd'] }]}
        games={[g('a', 'b', 61, 58), g('c', 'd', 40, 50), g('a', 'c', 10, 10)]}
        teamName={(id) => names[id]!}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Open' })).toBeInTheDocument();
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows.map((r) => within(r).getByRole('rowheader').textContent)).toEqual(['Lynx', 'Hawks', 'Bolts', 'Owls']);
    expect(rows[0]).toHaveTextContent('+10');
    expect(rows[3]).toHaveTextContent('-10');
    expect(within(rows[0]!).getByText('1', { selector: 'span' })).toHaveAttribute('data-rank', '1');
    expect(within(rows[3]!).getByText('4', { selector: 'span' })).not.toHaveAttribute('data-rank');
    expect(screen.getByRole('region', { name: 'Open standings' })).toHaveAttribute('tabindex', '0');
  });

  it('empty states', () => {
    const { rerender } = render(<StandingsTab divisions={[]} games={[]} teamName={() => ''} />);
    expect(screen.getByText('No standings data.')).toBeInTheDocument();
    rerender(
      <StandingsTab
        divisions={[{ id: 'd1', name: '', color: '#000000', teamIds: [] }]}
        games={[]}
        teamName={() => ''}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Division' })).toBeInTheDocument();
    expect(screen.getByText('No teams yet.')).toBeInTheDocument();
  });
});

describe('TeamsTab (PRD P-10)', () => {
  it('lists teams by division, expandable to the roster', async () => {
    const user = userEvent.setup();
    render(
      <TeamsTab
        divisions={[
          { id: 'd1', name: 'Open', color: '#6C63FF' },
          { id: 'd2', name: 'Empty', color: '#2BBF8A' },
        ]}
        teams={[
          {
            id: 'a',
            divisionId: 'd1',
            name: 'Hawks',
            coach: 'Sam',
            players: [
              { id: 'p1', name: 'Ari', number: '4' },
              { id: 'p2', name: 'Bea', number: '' },
            ],
          },
          { id: 'b', divisionId: 'd1', name: '', coach: '', players: [{ id: 'p3', name: 'Cy', number: '9' }] },
          { id: 'c', divisionId: 'd1', name: 'Owls', coach: '', players: [] },
        ]}
      />,
    );
    expect(screen.queryByRole('heading', { name: 'Empty' })).not.toBeInTheDocument();
    const hawks = screen.getByText('Hawks').closest('details')!;
    expect(hawks).toHaveTextContent('Coach: Sam');
    expect(hawks).toHaveTextContent('2 players');
    expect(hawks).not.toHaveAttribute('open');
    await user.click(screen.getByText('Hawks'));
    expect(hawks).toHaveAttribute('open');
    expect(
      within(hawks)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['1#4Ari', '2Bea']);
    expect(screen.getByText('Unnamed team').closest('details')).toHaveTextContent('1 player');
    expect(screen.getByText('Owls').closest('details')).toHaveTextContent('No players listed.');
  });

  it('says when there are no teams', () => {
    render(<TeamsTab divisions={[{ id: 'd1', name: 'Open', color: '#6C63FF' }]} teams={[]} />);
    expect(screen.getByText('No teams.')).toBeInTheDocument();
  });
});

describe('RulesTab (PRD P-11)', () => {
  it('shows sanitised rules, or says there are none', () => {
    const { container, rerender } = render(<RulesTab html="<h2>Timing</h2><p>Four quarters.</p>" empty={false} />);
    expect(screen.getByRole('heading', { name: 'Timing' })).toBeInTheDocument();
    expect(container.querySelector('p')).toHaveTextContent('Four quarters.');
    rerender(<RulesTab html="" empty />);
    expect(screen.getByText('No rules.')).toBeInTheDocument();
  });
});

describe('EventMedia (PRD P-01)', () => {
  it('puts the logo, then major sponsors, then the small row, and hides empty rows', () => {
    const { container } = render(
      <EventMedia
        eventName="Spring Hoops"
        logoUrl="https://x/logo.png"
        sponsors={{
          major: 'https://x/major.png',
          minor: ['https://x/m.png'],
          platformPrimary: ['https://x/pp.png'],
          platformSecondary: [],
        }}
      />,
    );
    expect(screen.getByRole('img', { name: 'Spring Hoops logo' })).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Major sponsors' })).getAllByRole('img')).toHaveLength(2);
    expect(within(screen.getByRole('list', { name: 'Sponsors' })).getAllByRole('img')).toHaveLength(1);
    const order = [...container.querySelectorAll('img, ul')].map(
      (el) => el.getAttribute('aria-label') ?? el.getAttribute('alt'),
    );
    expect(order[0]).toBe('Spring Hoops logo');
    expect(order.indexOf('Major sponsors')).toBeLessThan(order.indexOf('Sponsors'));
  });

  it('renders nothing without a logo or sponsors', () => {
    const { container } = render(
      <EventMedia
        eventName="x"
        logoUrl={null}
        sponsors={{ major: null, minor: [], platformPrimary: [], platformSecondary: [] }}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
