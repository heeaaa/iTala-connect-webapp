import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/* The web address field (PRD P-14) on New event, the league import and the editor. */

const fake = vi.hoisted(() => ({
  check: vi.fn(),
  create: vi.fn(),
  change: vi.fn(),
  save: vi.fn(),
  importLeague: vi.fn(),
  push: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: fake.push, refresh: vi.fn(), replace: vi.fn() }) }));
vi.mock('@/server/actions/events', () => ({
  checkEventSlug: fake.check,
  createEvent: fake.create,
  changeEventSlug: fake.change,
  saveEvent: fake.save,
}));
vi.mock('@/server/actions/mobile-import', () => ({ importLeague: fake.importLeague }));
vi.mock('@/server/actions/publish', () => ({ publishEvent: vi.fn() }));
vi.mock('@/server/actions/images', () => ({ uploadEventImage: vi.fn(), removeEventImage: vi.fn() }));
vi.mock('@/server/actions/schedule-additions', () => ({ addRoundRobin: vi.fn(), addPlayoff: vi.fn() }));
import { NewEventForm } from '@/app/admin/events/new/new-event-form';
import { ImportForm } from '@/app/admin/import/[leagueId]/import-form';
import { EventEditor } from '@/app/admin/events/[eventId]/event-editor';
import { type EditorInput } from '@/lib/event-editor';

const SITE = 'https://connect.example';
const EVENT_ID = '00000000-0000-4000-8000-000000000001';
/** The check says an address is free unless it is in `taken`, and then offers "-2". */
const answer = (taken: string[] = []) =>
  fake.check.mockImplementation(async (slug: string) => ({
    ok: true,
    data: { slug, free: !taken.includes(slug), suggestion: taken.includes(slug) ? `${slug}-2` : slug },
  }));
const address = () => screen.getByRole('textbox', { name: 'Web address' });

afterEach(() => {
  vi.useRealTimers();
});
beforeEach(() => {
  vi.clearAllMocks();
  answer();
  fake.create.mockResolvedValue({ ok: true, data: EVENT_ID });
});

describe('New event', () => {
  it('fills the address from the name and year, shows the link, and creates with it', async () => {
    const user = userEvent.setup();
    render(<NewEventForm year={2026} siteUrl={SITE} />);
    await user.type(screen.getByRole('textbox', { name: 'Event name' }), 'Harbour Night');
    expect(address()).toHaveValue('harbour-night-2026');
    expect(screen.getByText('harbour-night-2026', { selector: 'strong' }).parentElement).toHaveTextContent(
      'connect.example/events/harbour-night-2026',
    );
    expect(await screen.findByText('Free to use.')).toBeInTheDocument();
    expect(fake.check).toHaveBeenLastCalledWith('harbour-night-2026', undefined);
    expect(
      screen.getByText(
        'The link works once the event is published. While it is a draft, only you and superadmins can open it.',
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create event' }));
    expect(fake.create).toHaveBeenCalledWith({ name: 'Harbour Night', slug: 'harbour-night-2026' });
    await waitFor(() => expect(fake.push).toHaveBeenCalledWith(`/admin/events/${EVENT_ID}?created=1`));
  });

  it('stops following the name once the address is edited, and turns what is typed into an address', async () => {
    const user = userEvent.setup();
    render(<NewEventForm year={2026} siteUrl={SITE} />);
    await user.type(screen.getByRole('textbox', { name: 'Event name' }), 'Harbour');
    await user.clear(address());
    await user.type(address(), 'Night Owls Cup');
    expect(address()).toHaveValue('night-owls-cup');
    await user.type(screen.getByRole('textbox', { name: 'Event name' }), ' Night');
    expect(address()).toHaveValue('night-owls-cup');
  });

  it('moves a taken default to the first free address, and says why', async () => {
    answer(['harbour-2026']);
    const user = userEvent.setup();
    render(<NewEventForm year={2026} siteUrl={SITE} />);
    await user.type(screen.getByRole('textbox', { name: 'Event name' }), 'Harbour');
    expect(await screen.findByText('Free to use. Another event already uses harbour-2026.')).toBeInTheDocument();
    expect(address()).toHaveValue('harbour-2026-2');
    expect(address()).toHaveAttribute('aria-invalid', 'false');
    await user.click(screen.getByRole('button', { name: 'Create event' }));
    expect(fake.create).toHaveBeenCalledWith({ name: 'Harbour', slug: 'harbour-2026-2' });
  });

  it('says when a typed address is taken and offers the first free one', async () => {
    answer(['finals']);
    const user = userEvent.setup();
    render(<NewEventForm year={2026} siteUrl={SITE} />);
    await user.type(screen.getByRole('textbox', { name: 'Event name' }), 'Harbour');
    await user.clear(address());
    await user.type(address(), 'finals');
    expect(await screen.findByText('Another event already uses this address.')).toBeInTheDocument();
    expect(address()).toHaveAttribute('aria-invalid', 'true');
    await user.click(screen.getByRole('button', { name: 'Use finals-2' }));
    expect(address()).toHaveValue('finals-2');
    expect(await screen.findByText('Free to use.')).toBeInTheDocument();
  });

  it('explains an empty address without checking it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<NewEventForm year={2026} siteUrl={SITE} />);
      await user.type(screen.getByRole('textbox', { name: 'Event name' }), 'Harbour');
      await user.clear(address());
      fake.check.mockClear();
      expect(screen.getByText('Enter a web address, such as summer-league-2026.')).toBeInTheDocument();
      // Well past the check delay: no check starts for an empty address.
      await act(() => vi.advanceTimersByTimeAsync(1000));
      expect(fake.check).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows what the server says when the address was taken meanwhile', async () => {
    fake.create.mockResolvedValue({
      ok: false,
      error: 'Another event already uses that web address. Try harbour-2026-2.',
    });
    const user = userEvent.setup();
    render(<NewEventForm year={2026} siteUrl={SITE} />);
    await user.type(screen.getByRole('textbox', { name: 'Event name' }), 'Harbour');
    await user.click(screen.getByRole('button', { name: 'Create event' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Try harbour-2026-2.');
    expect(fake.push).not.toHaveBeenCalled();
  });
});

describe('Importing a league', () => {
  it('starts from the league name and sends the address with the import', async () => {
    fake.importLeague.mockResolvedValue({ ok: true, data: { eventId: EVENT_ID, leagueName: 'Harbour League' } });
    const user = userEvent.setup();
    render(
      <ImportForm
        league={{
          id: 'league',
          name: 'Harbour League',
          season: '2026',
          kind: 'league',
          is_closed: false,
          is_archived: false,
        }}
        links={[]}
        year={2026}
        siteUrl={SITE}
      />,
    );
    expect(address()).toHaveValue('harbour-league-2026');
    await user.click(screen.getByRole('button', { name: 'Create event' }));
    expect(fake.importLeague).toHaveBeenCalledWith(expect.objectContaining({ slug: 'harbour-league-2026' }));
  });
});

describe('Changing the address in the editor', () => {
  const initial: EditorInput = {
    id: EVENT_ID,
    version: 'v1',
    name: 'Harbour Night',
    schedule_days: ['2026-10-03'],
    time_start: '09:00',
    time_end: '20:00',
    courts: 1,
    court_names: ['Court 1'],
    timezone: 'Pacific/Auckland',
    theme_primary: '#FFCC00',
    theme_bg: '#0D0D0D',
    theme_text: '#E0E0E0',
    theme_text_secondary: '#888888',
    theme_heading: '#FFFFFF',
    divisions: [],
  };
  const editor = (published = false) =>
    render(
      <EventEditor
        initial={initial}
        slug="harbour-night-2026"
        siteUrl={SITE}
        links={{}}
        images={{ logo: null, major: null, minors: [] }}
        games={[]}
        published={published}
        notice=""
      />,
    );

  it('shows the current address without checking it', () => {
    editor();
    expect(address()).toHaveValue('harbour-night-2026');
    expect(screen.getByText('This is the current address.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Change address' })).not.toBeInTheDocument();
    expect(fake.check).not.toHaveBeenCalled();
  });

  it('changes it only with Change address (Enter too), never with Save, and the public link follows', async () => {
    fake.change.mockResolvedValue({ ok: true, data: { slug: 'harbour-finals', version: 'v2' } });
    const user = userEvent.setup();
    editor(true);
    expect(
      screen.getByText('Anyone can open this link. If you change the address, the old one keeps leading here.'),
    ).toBeInTheDocument();
    await user.clear(address());
    await user.type(address(), 'Harbour Finals');
    expect(await screen.findByText('Free to use.')).toBeInTheDocument();
    expect(fake.check).toHaveBeenLastCalledWith('harbour-finals', EVENT_ID);
    await user.keyboard('{Enter}');
    expect(fake.change).toHaveBeenCalledWith(EVENT_ID, 'harbour-finals');
    expect(fake.save).not.toHaveBeenCalled();
    expect(await screen.findByText('Address changed.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open its public page to enter scores.' })).toHaveAttribute(
      'href',
      '/events/harbour-finals',
    );
  });

  it('Cancel goes back to the stored address', async () => {
    const user = userEvent.setup();
    editor();
    await user.type(address(), '-x');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(address()).toHaveValue('harbour-night-2026');
    expect(fake.change).not.toHaveBeenCalled();
  });

  it('shows why a change failed and keeps the typed address', async () => {
    fake.change.mockResolvedValue({ ok: false, error: 'Another event already uses that web address. Try harbour-2.' });
    const user = userEvent.setup();
    editor();
    await user.clear(address());
    await user.type(address(), 'harbour');
    await user.click(screen.getByRole('button', { name: 'Change address' }));
    expect(await screen.findByText('Another event already uses that web address. Try harbour-2.')).toBeInTheDocument();
    expect(address()).toHaveValue('harbour');
  });
});
