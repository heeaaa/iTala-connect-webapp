import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type EditorInput } from '@/lib/event-editor';

const fake = vi.hoisted(() => ({
  authorize: vi.fn(),
  canEdit: vi.fn(),
  games: vi.fn(),
  rpc: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: fake.revalidate }));
vi.mock('@/server/auth', () => ({ authorizeAdmin: fake.authorize, canEditEvent: fake.canEdit }));
vi.mock('@/server/image-cleanup', () => ({ cleanDeletedEventImages: vi.fn() }));
vi.mock('@/env', () => ({ serverEnv: () => ({ DEFAULT_EVENT_TIMEZONE: 'Pacific/Auckland' }) }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ rpc: fake.rpc, from: () => ({ select: () => ({ eq: fake.games }) }) }),
}));
import { saveEvent } from '@/server/actions/events';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const input: EditorInput = {
  id: uuid(1),
  version: '2026-09-26T00:00:00Z',
  name: 'League night',
  schedule_days: ['2026-10-03'],
  time_start: '09:00',
  time_end: '12:00',
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
const row = (n: number, day: string | null, time: string | null, court: number | null) => ({
  id: uuid(200 + n),
  division_id: uuid(10),
  day,
  start_time: time,
  court,
  group_id: null,
  team1_id: null,
  team2_id: null,
  label: '',
  type: 'group',
  is_playoff: false,
  bracket_game_id: null,
  team1_source: null,
  team2_source: null,
  playoff_round: null,
  position: n,
});

beforeEach(() => {
  vi.clearAllMocks();
  fake.authorize.mockResolvedValue({ ok: true });
  fake.canEdit.mockResolvedValue(true);
  fake.games.mockResolvedValue({ data: [], error: null });
  fake.rpc.mockResolvedValue({ data: '2026-09-26T00:00:01Z', error: null });
});

describe('saveEvent (E-02, E-14)', () => {
  it('unschedules exactly the stored games that no longer fit, using the ported reconcile', async () => {
    fake.games.mockResolvedValue({
      data: [
        row(1, '2026-10-03', '09:00:00', 1), // fits
        row(2, '2026-10-03', '10:00:00', 2), // court 2 of 1
        row(3, '2026-10-10', '09:00:00', 1), // day removed
        row(4, '2026-10-03', '12:00:00', 1), // end is exclusive
        row(5, null, null, null), // already unscheduled
      ],
      error: null,
    });
    const result = await saveEvent(input);
    expect(result).toEqual({ ok: true, data: { version: '2026-09-26T00:00:01Z', moved: 3 } });
    const { id, version, divisions, ...details } = input;
    expect(fake.rpc).toHaveBeenCalledWith('save_event_editor', {
      p_event_id: id,
      p_version: version,
      p_details: details,
      p_divisions: divisions,
      p_unschedule: [uuid(202), uuid(203), uuid(204)],
    });
  });
  it('refuses invalid input, other owners and unauthorised callers before any write', async () => {
    expect((await saveEvent({ ...input, time_end: '08:00' })).ok).toBe(false);
    fake.canEdit.mockResolvedValue(false);
    expect(await saveEvent(input)).toEqual({ ok: false, error: 'You can only edit your own events.' });
    fake.authorize.mockResolvedValue({ ok: false, error: 'Sign in' });
    expect(await saveEvent(input)).toEqual({ ok: false, error: 'Sign in' });
    expect(fake.rpc).not.toHaveBeenCalled();
  });
  it('reports stale versions and failed reads without leaking details', async () => {
    fake.games.mockResolvedValueOnce({ data: null, error: { message: 'secret' } });
    expect(await saveEvent(input)).toEqual({ ok: false, error: 'Could not save the event. Please try again.' });
    expect(fake.rpc).not.toHaveBeenCalled();
    fake.rpc.mockResolvedValueOnce({ data: null, error: { code: '40001' } });
    expect(await saveEvent(input)).toEqual({
      ok: false,
      error: 'This event changed in another window. Reload before saving.',
    });
    fake.rpc.mockResolvedValueOnce({ data: null, error: { code: '23514', message: 'secret' } });
    expect(await saveEvent(input)).toEqual({
      ok: false,
      error: 'Could not save the event. Check the details and try again.',
    });
    expect(fake.revalidate).not.toHaveBeenCalled();
  });
});
