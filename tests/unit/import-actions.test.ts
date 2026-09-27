import { beforeEach, describe, expect, it, vi } from 'vitest';
const fake = vi.hoisted(() => ({
  authorize: vi.fn(),
  canEdit: vi.fn(),
  cleanup: vi.fn(),
  rpc: vi.fn(),
  preview: vi.fn(),
  single: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: fake.revalidate }));
vi.mock('@/server/auth', () => ({ authorizeAdmin: fake.authorize, canEditEvent: fake.canEdit }));
vi.mock('@/server/image-cleanup', () => ({ cleanDeletedEventImages: fake.cleanup }));
vi.mock('@/env', () => ({ serverEnv: () => ({ DEFAULT_EVENT_TIMEZONE: 'Pacific/Auckland' }) }));
vi.mock('@/server/mobile/reader', () => ({ mobileConfigured: true, mobileReader: () => ({ preview: fake.preview }) }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    rpc: fake.rpc,
    from: () => ({ delete: () => ({ eq: () => ({ select: () => ({ single: fake.single }) }) }) }),
  }),
}));
import { deleteEvent } from '@/server/actions/events';
import { importLeague } from '@/server/actions/mobile-import';
const id = '10000000-0000-4000-8000-000000000001';
const choice = { leagueId: 'league', eventName: 'Event', divisionName: 'Open', allowDuplicate: false };
beforeEach(() => {
  vi.clearAllMocks();
  fake.authorize.mockResolvedValue({ ok: true });
  fake.canEdit.mockResolvedValue(true);
  fake.single.mockResolvedValue({ data: { id }, error: null });
  fake.cleanup.mockResolvedValue(true);
  fake.rpc.mockResolvedValue({ data: id, error: null });
  fake.preview.mockResolvedValue({ league: { id: 'league', name: 'Fresh league' }, teams: [] });
});
describe('Import and deletion server boundaries', () => {
  it('refuses unauthorised actions before external reads or cleanup', async () => {
    fake.authorize.mockResolvedValue({ ok: false, error: 'Sign in' });
    expect((await importLeague(choice)).ok).toBe(false);
    expect((await deleteEvent(id)).ok).toBe(false);
    expect(fake.preview).not.toHaveBeenCalled();
    expect(fake.cleanup).not.toHaveBeenCalled();
  });
  it('does not remove images if the event delete fails', async () => {
    fake.single.mockResolvedValue({ data: null, error: { code: '42501' } });
    expect((await deleteEvent(id)).ok).toBe(false);
    expect(fake.cleanup).not.toHaveBeenCalled();
  });
  it('reports the committed deletion even when queued image cleanup needs retry', async () => {
    fake.cleanup.mockResolvedValue(false);
    expect((await deleteEvent(id)).ok).toBe(true);
    expect(fake.cleanup).toHaveBeenCalledWith(id);
    expect(fake.single.mock.invocationCallOrder[0]).toBeLessThan(fake.cleanup.mock.invocationCallOrder[0]!);
  });
  it('refuses another owner before deletion', async () => {
    fake.canEdit.mockResolvedValue(false);
    expect((await deleteEvent(id)).ok).toBe(false);
    expect(fake.single).not.toHaveBeenCalled();
  });
  it('rereads authoritative mobile data instead of accepting client roster data', async () => {
    const result = await importLeague({ ...choice, teams: [{ name: 'Forged' }] } as typeof choice);
    expect(result).toEqual({ ok: true, data: { eventId: id, leagueName: 'Fresh league' } });
    expect(fake.preview).toHaveBeenCalledWith('league');
    expect(fake.rpc).toHaveBeenCalledWith(
      'import_mobile_league',
      expect.objectContaining({ p_teams: [], p_allow_duplicate: false }),
    );
  });
  it('returns safe recovery errors without creating anything on mobile failure', async () => {
    fake.preview.mockRejectedValue(new Error('secret transport details'));
    const result = await importLeague(choice);
    expect(result).toEqual({ ok: false, error: "Can't reach the iTala mobile app right now. Try again." });
    expect(fake.rpc).not.toHaveBeenCalled();
  });
  it('requires the user to review a concurrent duplicate before confirming', async () => {
    fake.rpc.mockResolvedValue({ data: null, error: { code: '23505' } });
    expect(await importLeague(choice)).toEqual({ ok: false, error: expect.stringContaining('Reload the preview') });
    expect(fake.revalidate).not.toHaveBeenCalled();
  });
});
