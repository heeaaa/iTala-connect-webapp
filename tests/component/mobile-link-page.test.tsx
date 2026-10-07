import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

// The link wizard page (PRD M-03) is a server component: render what it returns with its
// data sources faked, so the league list it builds is checked as a person sees it.
const fake = vi.hoisted(() => ({
  link: null as null | { league_id: string; league_name: string },
  leagues: vi.fn(),
  teams: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  notFound: () => {
    throw new Error('notFound');
  },
}));
vi.mock('@/server/actions/mobile-link', () => ({ saveMobileLink: vi.fn() }));
vi.mock('@/server/auth', () => ({ requireAdmin: vi.fn(), canEditEvent: async () => true }));
vi.mock('@/server/mobile/links', () => ({ mobileLeagueLinkCount: async () => 0 }));
vi.mock('@/server/mobile/reader', () => ({
  mobileConfigured: true,
  mobileReader: () => ({ listLeagues: fake.leagues, teams: fake.teams }),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              id: EVENT,
              name: 'Winter League',
              status: 'draft',
              divisions: [
                {
                  id: DIV,
                  name: 'Open',
                  teams: [{ id: TEAM, name: 'Harbour Hawks', sort_order: 0, created_at: '2026-10-01T00:00:00Z' }],
                  division_mobile_links: fake.link && { ...fake.link, division_mobile_team_links: [] },
                },
              ],
            },
          }),
        }),
      }),
    }),
  }),
}));
import MobileLinkPage from '@/app/admin/events/[eventId]/divisions/[divisionId]/mobile-link/page';

const EVENT = '00000000-0000-4000-8000-000000000001';
const DIV = '00000000-0000-4000-8000-0000000000d1';
const TEAM = '00000000-0000-4000-8000-0000000000a1';

// Shaped like the mobile `leagues` rows: drop-in spaces are kind 'recreational' with season 'Drop-In',
// both the shared community space and each person's private one.
const league = (id: string, name: string, kind: 'league' | 'recreational', season = '2026') => ({
  id,
  name,
  season,
  kind,
  is_closed: false,
  is_archived: false,
  teamCount: 2,
});
const LEAGUES = [
  league('l-autumn', 'Autumn League', 'league'),
  league('rec-community', 'Community Drop-in Games (Papawis)', 'recreational', 'Drop-In'),
  league('l-harbour', 'Harbour League', 'league'),
  league('rec-private', 'Private Drop-In Games', 'recreational', 'Drop-In'),
];

async function renderPage(search: Record<string, string> = {}) {
  const page = await MobileLinkPage({
    params: Promise.resolve({ eventId: EVENT, divisionId: DIV }),
    searchParams: Promise.resolve(search),
  } as Parameters<typeof MobileLinkPage>[0]);
  render(page);
  const select = screen.getByRole('combobox', { name: 'Mobile app league' });
  return within(select)
    .getAllByRole('option')
    .map((o) => o.textContent);
}

beforeEach(() => {
  fake.link = null;
  fake.leagues.mockResolvedValue(LEAGUES);
  fake.teams.mockResolvedValue([{ id: 'm-hawks', league_id: 'l-harbour', name: 'Harbour Hawks' }]);
});

describe('Link wizard league list', () => {
  it('lists only real leagues, never the drop-in spaces', async () => {
    expect(await renderPage()).toEqual(['Choose a league…', 'Autumn League (2026)', 'Harbour League (2026)']);
  });

  it('does not open a drop-in space asked for in the address', async () => {
    await renderPage({ league: 'rec-private' });
    expect(screen.getByRole('combobox', { name: 'Mobile app league' })).toHaveValue('');
    expect(fake.teams).not.toHaveBeenCalled();
  });

  it('still shows the drop-in space a division is already linked to, so the link stays readable', async () => {
    fake.link = { league_id: 'rec-private', league_name: 'Private Drop-In Games' };
    expect(await renderPage()).toEqual([
      'Choose a league…',
      'Autumn League (2026)',
      'Harbour League (2026)',
      'Private Drop-In Games (Drop-In)',
    ]);
    expect(screen.getByRole('combobox', { name: 'Mobile app league' })).toHaveValue('rec-private');
  });
});
