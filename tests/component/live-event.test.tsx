import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { toEventModel, type EventRows } from '@/lib/public-event/model';

/* Realtime, router and the score action are mocked: these tests check the
   island's own behaviour. The real Realtime and set_score path is covered
   by the E-2-E journey (NOT RUN without the local Supabase stack). */

type Handler = (payload: Record<string, unknown>) => void;
const realtime = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
  status: null as null | ((s: string) => void),
  removed: 0,
}));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => {
    const channel = {
      on(_type: string, opts: { table: string }, cb: Handler) {
        realtime.handlers.set(opts.table, cb);
        return channel;
      },
      subscribe(cb: (s: string) => void) {
        realtime.status = cb;
        return channel;
      },
    };
    return {
      channel: () => channel,
      removeChannel: () => {
        realtime.removed++;
        return Promise.resolve('ok');
      },
    };
  },
}));

const refresh = vi.fn();
// Next's router object is stable across renders; so is this one.
const router = { refresh };
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/events/e1',
  useSearchParams: () => new URLSearchParams('tab=schedule'),
}));

const saveScore = vi.hoisted(() => vi.fn());
vi.mock('@/server/actions/scores', () => ({ saveScore }));

const { LiveEvent } = await import('@/components/event/live-event');

const RENDERED = Date.parse('2026-10-03T21:30:00Z'); // 10:30 am on 04/10 in Auckland

function model() {
  const rows: EventRows = {
    event: {
      id: 'e1',
      name: 'Spring Hoops',
      status: 'published',
      schedule_days: ['2026-10-04'],
      time_start: '09:00:00',
      time_end: '20:00:00',
      courts: 1,
      court_names: ['Court 1'],
      timezone: 'Pacific/Auckland',
      logo_path: null,
      theme_primary: '#FFCC00',
      theme_bg: '#0D0D0D',
      theme_text: '#E0E0E0',
      theme_text_secondary: '#888888',
      theme_heading: '#FFFFFF',
      rules_html: '',
    },
    divisions: [{ id: 'd1', name: 'Open', color: '#6C63FF', sort_order: 0, created_at: '' }],
    teams: [
      { id: 't1', division_id: 'd1', name: 'Hawks', coach: '', sort_order: 0, created_at: '' },
      { id: 't2', division_id: 'd1', name: 'Bolts', coach: '', sort_order: 1, created_at: '' },
    ],
    players: [],
    games: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        division_id: 'd1',
        day: '2026-10-04',
        start_time: '10:00:00',
        court: 1,
        group_id: null,
        team1_id: 't1',
        team2_id: 't2',
        label: 'Open',
        type: 'group',
        is_playoff: false,
        bracket_game_id: null,
        team1_source: null,
        team2_source: null,
        playoff_round: null,
        position: 0,
      },
    ],
    scores: [{ game_id: '11111111-1111-4111-8111-111111111111', s1: 20, s2: 18 }],
    eventSponsors: [],
    platformSponsors: [],
  };
  return toEventModel(rows, 'http://127.0.0.1:54321');
}
const GAME = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  window.localStorage.clear();
  realtime.handlers.clear();
  realtime.removed = 0;
  refresh.mockReset();
  saveScore.mockReset();
});
afterEach(() => vi.useRealTimers());

const court = () => screen.getByRole('region', { name: 'Court 1' });

describe('LiveEvent (PRD P-07, P-08)', () => {
  it('shows the game on court and applies a live score change with the paint-in', () => {
    render(<LiveEvent model={model()} tab="schedule" selectedDay={null} canEdit={false} renderedAt={RENDERED} />);
    act(() => realtime.status!('SUBSCRIBED'));
    expect(screen.getByRole('status')).toHaveTextContent('Live. Scores update automatically.');
    expect(within(court()).getByText('20')).toBeInTheDocument();

    act(() => realtime.handlers.get('game_scores')!({ eventType: 'UPDATE', new: { game_id: GAME, s1: 22, s2: 18 } }));
    const score = within(court()).getByText('22');
    expect(score.className).toMatch(/paintIn/);
  });

  it('clears a deleted score and ignores other events’ deletes', () => {
    render(<LiveEvent model={model()} tab="schedule" selectedDay={null} canEdit={false} renderedAt={RENDERED} />);
    act(() => realtime.handlers.get('game_scores')!({ eventType: 'DELETE', old: { game_id: 'someone-else' } }));
    expect(within(court()).getByText('20')).toBeInTheDocument();
    act(() => realtime.handlers.get('game_scores')!({ eventType: 'DELETE', old: { game_id: GAME } }));
    expect(within(court()).queryByText('20')).not.toBeInTheDocument();
  });

  it('refreshes once after a burst of schedule changes', () => {
    render(<LiveEvent model={model()} tab="schedule" selectedDay={null} canEdit={false} renderedAt={RENDERED} />);
    act(() => {
      realtime.handlers.get('games')!({ eventType: 'UPDATE' });
      realtime.handlers.get('games')!({ eventType: 'UPDATE' });
    });
    expect(refresh).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(500));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('says when scores may be out of date, and unsubscribes on unmount', () => {
    const { unmount } = render(
      <LiveEvent model={model()} tab="schedule" selectedDay={null} canEdit={false} renderedAt={RENDERED} />,
    );
    act(() => realtime.status!('CHANNEL_ERROR'));
    expect(screen.getByRole('status')).toHaveTextContent('Reconnecting. Scores may be out of date.');
    unmount();
    expect(realtime.removed).toBe(1);
  });

  it('owner score entry saves both sides once typing stops', async () => {
    saveScore.mockResolvedValue({ ok: true, data: undefined });
    render(<LiveEvent model={model()} tab="schedule" selectedDay={null} canEdit renderedAt={RENDERED} />);
    const input = screen.getByRole('textbox', { name: /Hawks score, 10:00 am/ });
    fireEvent.change(input, { target: { value: '2' } });
    fireEvent.change(input, { target: { value: '25' } });
    expect(saveScore).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(800));
    expect(saveScore).toHaveBeenCalledTimes(1);
    expect(saveScore).toHaveBeenCalledWith({ gameId: GAME, score1: 25, score2: 18 });
  });

  it('a failed save says so and puts the score back', async () => {
    saveScore.mockResolvedValue({ ok: false, error: 'Could not save the score. Check your connection and try again.' });
    render(<LiveEvent model={model()} tab="schedule" selectedDay={null} canEdit renderedAt={RENDERED} />);
    fireEvent.change(screen.getByRole('textbox', { name: /Bolts score/ }), { target: { value: '30' } });
    await act(async () => vi.advanceTimersByTime(800));
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save the score.');
    expect(within(court()).getByText('18')).toBeInTheDocument();
  });

  it('keeps the clock moving in the event time zone', () => {
    vi.setSystemTime(RENDERED);
    render(<LiveEvent model={model()} tab="schedule" selectedDay={null} canEdit={false} renderedAt={RENDERED} />);
    expect(screen.getByText('10:30 am', { selector: 'time' })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(5 * 60_000));
    expect(screen.getByText('10:35 am', { selector: 'time' })).toBeInTheDocument();
  });

  it('recomputes standings live on the Standings tab', () => {
    render(<LiveEvent model={model()} tab="standings" selectedDay={null} canEdit={false} renderedAt={RENDERED} />);
    const firstRow = () => screen.getAllByRole('row')[1]!;
    expect(firstRow()).toHaveTextContent('Hawks');
    act(() => realtime.handlers.get('game_scores')!({ eventType: 'INSERT', new: { game_id: GAME, s1: 10, s2: 30 } }));
    expect(firstRow()).toHaveTextContent('Bolts');
    expect(firstRow()).toHaveTextContent('+20');
  });
});
