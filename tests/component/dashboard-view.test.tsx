import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/server/actions/events', () => ({ deleteEvent: vi.fn() }));
import { DashboardView, type DashboardEvent } from '@/app/admin/dashboard-view';

const EVENTS: DashboardEvent[] = [
  {
    id: 'e1',
    slug: 'league-night-2026',
    name: 'League Night',
    status: 'published',
    schedule_days: ['2026-10-03'],
    divisions: [{ count: 2 }],
  },
  {
    id: 'e2',
    slug: 'draft-cup-2026',
    name: 'Draft Cup',
    status: 'draft',
    schedule_days: [],
    divisions: [{ count: 0 }],
  },
];
const row = (name: string) => screen.getByRole('row', { name: new RegExp(name) });
// jsdom drops the space before the visually hidden event name that Chromium keeps ("Edit League Night").
const named = (action: string, event: string) => new RegExp(`^${action}\\s?${event}$`);

describe('Dashboard actions (D-02)', () => {
  it('offers Edit and Delete on every event, View on published ones, and no Results without the mobile integration', () => {
    render(<DashboardView events={EVENTS} error={false} superadmin={false} />);
    const published = row('League Night');
    expect(within(published).getByRole('link', { name: named('Edit', 'League Night') })).toHaveAttribute(
      'href',
      '/admin/events/e1',
    );
    expect(within(published).getByRole('link', { name: named('View', 'League Night') })).toHaveAttribute(
      'href',
      '/events/league-night-2026',
    );
    expect(within(row('Draft Cup')).queryByRole('link', { name: /^View/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Results/ })).not.toBeInTheDocument();
    expect(within(row('Draft Cup')).getByRole('button', { name: named('Delete', 'Draft Cup') })).toBeInTheDocument();
  });

  it('offers Results on every event when the mobile integration is on, as the old app did', () => {
    render(<DashboardView events={EVENTS} error={false} superadmin={false} mobileEnabled />);
    expect(within(row('League Night')).getByRole('link', { name: named('Results', 'League Night') })).toHaveAttribute(
      'href',
      '/admin/events/e1/results',
    );
    expect(within(row('Draft Cup')).getByRole('link', { name: named('Results', 'Draft Cup') })).toHaveAttribute(
      'href',
      '/admin/events/e2/results',
    );
  });
});
