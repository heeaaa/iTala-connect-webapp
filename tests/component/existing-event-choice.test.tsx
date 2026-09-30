import { expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ExistingEventChoice } from '@/app/admin/import/[leagueId]/existing-event-choice';

it('opens the existing link wizard for the chosen editable division without writing a link', async () => {
  const user = userEvent.setup();
  render(
    <ExistingEventChoice
      leagueId="league/open"
      events={[
        { id: 'event-a', name: 'League Night', status: 'draft', divisions: [{ id: 'division-a', name: 'Open' }] },
        { id: 'event-b', name: 'Cup', status: 'published', divisions: [{ id: 'division-b', name: 'Women' }] },
      ]}
    />,
  );
  expect(screen.getByText(/publish/)).toBeInTheDocument();
  await user.selectOptions(screen.getByRole('combobox', { name: 'Event and division' }), 'event-b/division-b');
  expect(screen.getByRole('link', { name: 'Review team pairs' })).toHaveAttribute(
    'href',
    '/admin/events/event-b/divisions/division-b/mobile-link?league=league%2Fopen',
  );
});

it('explains when the admin has no existing division to link', () => {
  render(<ExistingEventChoice leagueId="L1" events={[]} />);
  expect(screen.getByText('No editable divisions yet. Create an event and add a division first.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Review team pairs' })).not.toBeInTheDocument();
});
