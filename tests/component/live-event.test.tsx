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
    // Both scores are in, so the boxes are locked until the owner opens the lock.
    fireEvent.click(screen.getByRole('button', { name: /Unlock score for Hawks versus Bolts/ }));
    const input = screen.getByRole('textbox', { name: /Hawks score, 10:00 am/ });
    expect(input).not.toBeDisabled();
    fireEvent.change(input, { target: { value: '2' } });
    fireEvent.change(input, { target: { value: '25' } });
    expect(saveScore).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(800));
    expect(saveScore).toHaveBeenCalledTimes(1);
    expect(saveScore).toHaveBeenCalledWith({ gameId: GAME, score1: 25, score2: 18 });
  });

  it('locks completed scores until the admin opens the lock, then relocks after saving', async () => {
    saveScore.mockResolvedValue({ ok: true, data: undefined });
    const finalRendered = Date.parse('2026-10-03T23:30:00Z'); // 12:30 pm on 04/10 in Auckland
    render(<LiveEvent model={model()} tab="schedule" selectedDay={null} canEdit renderedAt={finalRendered} />);

    const input = screen.getByRole('textbox', { name: /Hawks score, 10:00 am/ });
    expect(input).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Unlock score for Hawks versus Bolts/ }));
    expect(input).not.toBeDisabled();

    fireEvent.change(input, { target: { value: '25' } });
    await act(async () => vi.advanceTimersByTime(800));
    expect(saveScore).toHaveBeenCalledWith({ gameId: GAME, score1: 25, score2: 18 });
    expect(input).toBeDisabled();
  });

  // User decision 06/10/2026: the boxes lock as soon as both scores are in, whatever the time,
  // and never while a score is missing; the lock still opens them.
  it('locks a game as soon as both scores are in, even while it is on court', () => {
    render(<LiveEvent model={model()} tab="schedule" selectedDay={null} canEdit renderedAt={RENDERED} />);
    expect(within(court()).getByText('On court')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Hawks score, 10:00 am/ })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: /Bolts score, 10:00 am/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Unlock score for Hawks versus Bolts/ }));
    expect(screen.getByRole('textbox', { name: /Hawks score, 10:00 am/ })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /^Lock score for Hawks versus Bolts/ })).toBeInTheDocument();
  });

  it('never locks a game on court while a score is missing, then locks once both save', async () => {
    let finish!: (result: { ok: true; data: undefined }) => void;
    saveScore.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const awaiting = model();
    awaiting.scores[GAME] = { score1: 20, score2: null };
    render(<LiveEvent model={awaiting} tab="schedule" selectedDay={null} canEdit renderedAt={RENDERED} />);
    expect(within(court()).getByText('On court')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /lock score for/i })).not.toBeInTheDocument();
    const input = screen.getByRole('textbox', { name: /Bolts score/ });
    expect(input).not.toBeDisabled();
    fireEvent.change(input, { target: { value: '18' } });
    await act(async () => vi.advanceTimersByTime(800));
    expect(input).not.toBeDisabled();
    await act(async () => finish({ ok: true, data: undefined }));
    expect(input).toBeDisabled();
    expect(screen.getByRole('button', { name: /Unlock score for Hawks versus Bolts/ })).toBeInTheDocument();
  });

  // Review findings 06/10/2026: the lock must never land on a box the owner is still typing in,
  // and a failed save must put back the stored score, not the previous keystroke.
  it('holds the lock while the owner is still in the boxes, then locks when they leave', async () => {
    saveScore.mockResolvedValue({ ok: true, data: undefined });
    const awaiting = model();
    awaiting.scores[GAME] = { score1: 20, score2: null };
    render(<LiveEvent model={awaiting} tab="schedule" selectedDay={null} canEdit renderedAt={RENDERED} />);
    const input = screen.getByRole('textbox', { name: /Bolts score/ });
    act(() => input.focus());
    fireEvent.change(input, { target: { value: '4' } });
    await act(async () => vi.advanceTimersByTime(800));
    expect(saveScore).toHaveBeenLastCalledWith({ gameId: GAME, score1: 20, score2: 4 });
    // Saved, but a slow second digit must not land on a locked box.
    expect(input).not.toBeDisabled();
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: '41' } });
    await act(async () => vi.advanceTimersByTime(800));
    expect(saveScore).toHaveBeenLastCalledWith({ gameId: GAME, score1: 20, score2: 41 });
    // Moving to the other side's box is still entering this game's score.
    act(() => screen.getByRole('textbox', { name: /Hawks score/ }).focus());
    expect(input).not.toBeDisabled();
    act(() => (document.activeElement as HTMLElement).blur());
    expect(input).toBeDisabled();
    expect(screen.getByRole('button', { name: /Unlock score for Hawks versus Bolts/ })).toBeInTheDocument();
  });

  it('locks at once when the owner taps the padlock while still in a box', () => {
    render(<LiveEvent model={model()} tab="schedule" selectedDay={null} canEdit renderedAt={RENDERED} />);
    fireEvent.click(screen.getByRole('button', { name: /Unlock score for Hawks versus Bolts/ }));
    const input = screen.getByRole('textbox', { name: /Hawks score/ });
    act(() => input.focus());
    fireEvent.click(screen.getByRole('button', { name: /^Lock score for Hawks versus Bolts/ }));
    expect(input).toBeDisabled();
  });

  it('a failed save puts back the stored score, not the last keystroke, and keeps the boxes open', async () => {
    saveScore.mockResolvedValue({ ok: false, error: 'Could not save the score. Check your connection and try again.' });
    const awaiting = model();
    awaiting.scores[GAME] = { score1: 20, score2: null };
    render(<LiveEvent model={awaiting} tab="schedule" selectedDay={null} canEdit renderedAt={RENDERED} />);
    const input = screen.getByRole('textbox', { name: /Bolts score/ });
    fireEvent.change(input, { target: { value: '1' } });
    fireEvent.change(input, { target: { value: '18' } });
    await act(async () => vi.advanceTimersByTime(800));
    expect(saveScore).toHaveBeenCalledWith({ gameId: GAME, score1: 20, score2: 18 });
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save the score.');
    // Bolts had no stored score: the court shows none, not the "1" typed on the way to 18.
    expect(within(court()).getByText('20')).toBeInTheDocument();
    expect(within(court()).queryByText('1')).not.toBeInTheDocument();
    expect(within(court()).queryByText('18')).not.toBeInTheDocument();
    expect(input).not.toBeDisabled();
  });

  it('keeps the boxes open after a failed save even when another device filled the score', async () => {
    saveScore.mockResolvedValue({ ok: false, error: 'Could not save the score. Check your connection and try again.' });
    const awaiting = model();
    awaiting.scores[GAME] = { score1: 20, score2: null };
    render(<LiveEvent model={awaiting} tab="schedule" selectedDay={null} canEdit renderedAt={RENDERED} />);
    const input = screen.getByRole('textbox', { name: /Bolts score/ });
    fireEvent.change(input, { target: { value: '18' } });
    act(() => realtime.handlers.get('game_scores')!({ eventType: 'UPDATE', new: { game_id: GAME, s1: 20, s2: 17 } }));
    await act(async () => vi.advanceTimersByTime(800));
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save the score.');
    expect(within(court()).getByText('17')).toBeInTheDocument();
    expect(input).not.toBeDisabled();
  });

  it('keeps a newer score edit open while an earlier save finishes', async () => {
    let finishFirst!: (result: { ok: true; data: undefined }) => void;
    saveScore.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishFirst = resolve;
        }),
    );
    saveScore.mockResolvedValue({ ok: true, data: undefined });
    const finalRendered = Date.parse('2026-10-03T23:30:00Z');
    render(<LiveEvent model={model()} tab="schedule" selectedDay={null} canEdit renderedAt={finalRendered} />);
    fireEvent.click(screen.getByRole('button', { name: /Unlock score for Hawks versus Bolts/ }));
    const input = screen.getByRole('textbox', { name: /Hawks score/ });
    fireEvent.change(input, { target: { value: '25' } });
    await act(async () => vi.advanceTimersByTime(800));
    fireEvent.change(input, { target: { value: '26' } });
    await act(async () => finishFirst({ ok: true, data: undefined }));
    expect(input).not.toBeDisabled();
    await act(async () => vi.advanceTimersByTime(800));
    expect(saveScore).toHaveBeenLastCalledWith({ gameId: GAME, score1: 26, score2: 18 });
    expect(input).toBeDisabled();
  });

  it('keeps a past game with a missing score editable until both scores save', async () => {
    let finish!: (result: { ok: true; data: undefined }) => void;
    saveScore.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const awaiting = model();
    awaiting.scores[GAME] = { score1: 20, score2: null };
    render(
      <LiveEvent
        model={awaiting}
        tab="schedule"
        selectedDay={null}
        canEdit
        renderedAt={Date.parse('2026-10-03T23:30:00Z')}
      />,
    );
    const input = screen.getByRole('textbox', { name: /Bolts score/ });
    expect(input).not.toBeDisabled();
    fireEvent.change(input, { target: { value: '18' } });
    expect(input).not.toBeDisabled();
    await act(async () => vi.advanceTimersByTime(800));
    expect(input).not.toBeDisabled();
    await act(async () => finish({ ok: true, data: undefined }));
    expect(input).toBeDisabled();
  });

  it('a failed save says so and puts the score back', async () => {
    saveScore.mockResolvedValue({ ok: false, error: 'Could not save the score. Check your connection and try again.' });
    render(<LiveEvent model={model()} tab="schedule" selectedDay={null} canEdit renderedAt={RENDERED} />);
    fireEvent.click(screen.getByRole('button', { name: /Unlock score for Hawks versus Bolts/ }));
    expect(screen.getByRole('textbox', { name: /Bolts score/ })).not.toBeDisabled();
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
