'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from 'react';

import { platformStyles as s } from '@/components/platform/platform-frame';
import { formatDate, formatDayLabel } from '@/lib/format';

import {
  allGamesLabel,
  datesSummary,
  definitionFromState,
  formProblem,
  gameDays,
  gameLabel,
  gamesFor,
  pickDay,
  playersFor,
  settle,
  teamsFor,
  TEMPLATE_FIELDS,
  type BuilderOptions,
  type BuilderState,
  type DateMode,
} from './builder-options';
import { REPORT_TEMPLATES, type ReportTemplate } from './model';
import { presetUrl } from './presets';
import { ReportCalendar } from './report-calendar';
import styles from './reports.module.css';

export interface ReportBuilderProps {
  events: { id: string; name: string }[];
  /** The chosen event, or '' before one is chosen. */
  eventId: string;
  /** The chosen event's leagues, teams, games and players; null until they are read. */
  options: BuilderOptions | null;
  initial: BuilderState;
  basePath?: string;
}

/** Whether any "More options" choice is in use. */
const usesMoreOptions = (s: BuilderState) => {
  const f = TEMPLATE_FIELDS[s.template];
  return (
    !!s.relative ||
    (f.standings && s.standingsScope === 'selected-games') ||
    (f.minimums && (s.minAppearances > 0 || s.minAttempts > 0))
  );
};

const DATE_MODES: { id: DateMode; label: string }[] = [
  { id: 'all', label: 'All dates' },
  { id: 'day', label: 'One day' },
  { id: 'range', label: 'Date range' },
  { id: 'dates', label: 'Several days' },
];

/**
 * The report form. Every choice updates the ones that depend on it straight away: an event loads
 * its leagues, teams and games; a league narrows the teams, days and games; a day narrows the
 * games. Only "Show report" builds the report, through the same address a saved filter opens.
 */
export function ReportBuilder({ events, eventId, options, initial, basePath = '/admin/reports' }: ReportBuilderProps) {
  const router = useRouter();
  const id = useId();
  const [busy, startBusy] = useTransition();
  const [task, setTask] = useState<'event' | 'report' | null>(null);
  const [event, setEvent] = useState(eventId);
  const [state, setState] = useState(() => (options ? settle(options, initial) : initial));
  const [problem, setProblem] = useState<{ field: string; message: string } | null>(null);
  // "More options" opens on load when one is in use, then is the person's to open and close.
  const [moreOpenAtStart] = useState(() => usesMoreOptions(state));
  const chipList = useRef<HTMLUListElement>(null);
  const chipFocus = useRef<number | null>(null);
  const f = TEMPLATE_FIELDS[state.template];
  // The lists belong to the event the page was read for; while another one loads there are none.
  const o = event && event === eventId ? options : null;
  const ready = !!o;

  const change = (patch: Partial<BuilderState>) => {
    setProblem(null);
    setState((current) => (options ? settle(options, { ...current, ...patch }) : { ...current, ...patch }));
  };

  const chooseEvent = (next: string) => {
    setEvent(next);
    setProblem(null);
    setTask('event');
    const params = new URLSearchParams({ template: state.template });
    if (next) params.set('event', next);
    startBusy(() => router.push(`${basePath}?${params.toString()}`, { scroll: false }));
  };

  // The page reads players again for the chosen league and team when the whole event was too much.
  const findPlayers = () => {
    setProblem(null);
    setTask('event');
    const params = new URLSearchParams({ event, template: state.template });
    if (state.divisionId) params.set('division', state.divisionId);
    if (state.teamId) params.set('team', state.teamId);
    startBusy(() => router.push(`${basePath}?${params.toString()}`, { scroll: false }));
  };

  // A removed chip takes its button away: focus moves to the chip now in its place, or the calendar.
  useEffect(() => {
    if (chipFocus.current === null) return;
    const buttons = chipList.current?.querySelectorAll('button');
    const next = buttons?.[Math.min(chipFocus.current, buttons.length - 1)];
    chipFocus.current = null;
    (next ?? document.getElementById(`${id}-dates`))?.focus();
  }, [state.days, id]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!event) {
      setProblem({ field: 'event', message: 'Choose an event.' });
      document.getElementById(`${id}-event`)?.focus();
      return;
    }
    if (!o) return;
    const found = formProblem(o, state);
    if (found) {
      setProblem(found);
      document.getElementById(`${id}-${found.field}`)?.focus();
      return;
    }
    setTask('report');
    startBusy(() => router.push(presetUrl(definitionFromState(event, state), basePath)));
  };

  const invalid = (field: string) => problem?.field === field || undefined;
  const describe = (field: string) => (problem?.field === field ? `${id}-problem` : undefined);
  const days = o ? gameDays(o, state) : [];
  const games = o ? gamesFor(o, state) : [];
  const players = o ? playersFor(o, state) : [];
  const chosenDates =
    state.dateMode === 'day'
      ? [state.day]
      : state.dateMode === 'range'
        ? [state.from, state.to]
        : state.dateMode === 'dates'
          ? state.days
          : [];

  return (
    <form className={styles.builder} action={basePath} method="get" onSubmit={submit} noValidate>
      <input type="hidden" name="preview" value="1" />
      <div className={styles.fields}>
        <label className={styles.field}>
          <span className={s.label}>Event</span>
          <select
            id={`${id}-event`}
            name="event"
            className={s.input}
            value={event}
            aria-invalid={invalid('event')}
            aria-describedby={describe('event')}
            onChange={(e) => chooseEvent(e.currentTarget.value)}
          >
            <option value="">Choose an event</option>
            {events.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span className={s.label}>Report</span>
          <select
            name="template"
            className={s.input}
            value={state.template}
            onChange={(e) => change({ template: e.currentTarget.value as ReportTemplate })}
          >
            {REPORT_TEMPLATES.map((template) => (
              <option value={template.id} key={template.id}>
                {template.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {o ? (
        <>
          <div className={styles.fields}>
            <label className={styles.field}>
              <span className={s.label}>League / division</span>
              <select
                name="division"
                className={s.input}
                value={state.divisionId}
                onChange={(e) => change({ divisionId: e.currentTarget.value })}
              >
                <option value="">All divisions</option>
                {o.divisions.map((division) => (
                  <option value={division.id} key={division.id}>
                    {division.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span className={s.label}>Team</span>
              <select
                id={`${id}-team`}
                name="team"
                className={s.input}
                value={state.teamId}
                aria-invalid={invalid('team')}
                aria-describedby={describe('team')}
                onChange={(e) => change({ teamId: e.currentTarget.value })}
              >
                <option value="">{f.teamRequired ? 'Choose a team' : 'All teams'}</option>
                {teamsFor(o, state).map((team) => (
                  <option value={team.id} key={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </label>
            {f.player ? (
              <div className={styles.field}>
                <label htmlFor={`${id}-player`} className={s.label}>
                  Player
                </label>
                <select
                  id={`${id}-player`}
                  name="player"
                  className={s.input}
                  value={state.playerId}
                  aria-invalid={invalid('player')}
                  aria-describedby={describe('player') ?? `${id}-player-hint`}
                  onChange={(e) => change({ playerId: e.currentTarget.value })}
                >
                  <option value="">{players.length ? 'Choose a player' : 'No player stats yet'}</option>
                  {players.map((player) => (
                    <option value={player.id} key={player.id}>
                      {player.name}
                    </option>
                  ))}
                </select>
                <span id={`${id}-player-hint`} className={styles.hint}>
                  Players show once their games have approved stats from the mobile app.
                </span>
                {o.playersComplete ? null : (
                  <div className={styles.findPlayers}>
                    <p className={styles.hint}>
                      Player stats could not be read for the whole event. Choose a league or team, then find its
                      players.
                    </p>
                    <button type="button" className={`${s.button} ${s.buttonQuiet}`} onClick={findPlayers}>
                      Find players
                    </button>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <fieldset className={styles.dates}>
            <legend className={s.label}>Dates</legend>
            <div className={styles.modes}>
              {DATE_MODES.map((mode) => (
                <label key={mode.id} className={styles.mode}>
                  <input
                    type="radio"
                    name="dateMode"
                    value={mode.id}
                    checked={state.dateMode === mode.id}
                    onChange={() => change({ dateMode: mode.id })}
                  />
                  {mode.label}
                </label>
              ))}
            </div>
            {state.dateMode !== 'all' ? (
              <>
                <ReportCalendar
                  key={`${state.dateMode}|${state.divisionId}|${state.teamId}`}
                  id={`${id}-dates`}
                  label={
                    state.dateMode === 'day'
                      ? 'Choose a day'
                      : state.dateMode === 'range'
                        ? 'Choose the first and last day'
                        : 'Choose game days'
                  }
                  start={chosenDates.find(Boolean) || days.at(-1)?.date || o.today}
                  gameDays={days}
                  isChosen={(day) => chosenDates.includes(day)}
                  inRange={(day) => state.dateMode === 'range' && day > state.from && day < state.to}
                  onPick={(day) => change(pickDay(state, day))}
                  describedBy={describe('dates') ?? `${id}-dates-summary`}
                />
                <p id={`${id}-dates-summary`} className={styles.summary} aria-live="polite">
                  {state.dateMode === 'range' && state.from && state.from === state.to
                    ? `${datesSummary(o, state)}. Choose the last day to make a range.`
                    : datesSummary(o, state)}
                </p>
                {state.dateMode === 'dates' && state.days.length ? (
                  <ul ref={chipList} className={styles.chips} aria-label="Chosen days">
                    {state.days.map((day, index) => (
                      <li key={day}>
                        <button
                          type="button"
                          aria-label={`Remove ${formatDayLabel(day)}`}
                          onClick={() => {
                            chipFocus.current = index;
                            change(pickDay(state, day));
                          }}
                        >
                          {formatDate(day)} · Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <input type="hidden" name="dates" value={chosenDates.filter(Boolean).join(',')} />
              </>
            ) : null}
          </fieldset>

          {f.game ? (
            <label className={styles.field}>
              <span className={s.label}>Game</span>
              <select
                name="game"
                className={s.input}
                value={state.gameId}
                onChange={(e) => change({ gameId: e.currentTarget.value })}
              >
                <option value="">{allGamesLabel(state, games.length)}</option>
                {games.map((game) => (
                  <option value={game.id} key={game.id}>
                    {gameLabel(o, game, {
                      withDate: state.dateMode !== 'day',
                      withDivision: !state.divisionId && o.divisions.length > 1,
                    })}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <details className={styles.more} open={moreOpenAtStart || undefined}>
            <summary>More options</summary>
            <div className={styles.fields}>
              <label className={styles.field}>
                <span className={s.label}>Recent games</span>
                <select
                  name="relative"
                  className={s.input}
                  value={state.relative}
                  onChange={(e) => change({ relative: e.currentTarget.value as BuilderState['relative'] })}
                >
                  <option value="">All matching games</option>
                  <option value="latest">Latest game</option>
                  <option value="last-five">Last five games</option>
                </select>
              </label>
              {f.standings ? (
                <label className={styles.field}>
                  <span className={s.label}>Standings</span>
                  <select
                    name="standings"
                    className={s.input}
                    value={state.standingsScope}
                    onChange={(e) =>
                      change({ standingsScope: e.currentTarget.value as BuilderState['standingsScope'] })
                    }
                  >
                    <option value="through-cutoff">Full competition through the last chosen game</option>
                    <option value="selected-games">Chosen games only</option>
                  </select>
                </label>
              ) : null}
              {f.minimums ? (
                <>
                  <label className={styles.field}>
                    <span className={s.label}>Minimum appearances</span>
                    <input
                      type="number"
                      name="minAppearances"
                      className={s.input}
                      min="0"
                      max="1000"
                      step="1"
                      inputMode="numeric"
                      value={state.minAppearances}
                      onChange={(e) => change({ minAppearances: clamp(e.currentTarget.value) })}
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={s.label}>Minimum shot attempts</span>
                    <input
                      type="number"
                      name="minAttempts"
                      className={s.input}
                      min="0"
                      max="1000"
                      step="1"
                      inputMode="numeric"
                      value={state.minAttempts}
                      onChange={(e) => change({ minAttempts: clamp(e.currentTarget.value) })}
                    />
                  </label>
                </>
              ) : null}
            </div>
          </details>
        </>
      ) : event && event === eventId ? null : (
        // No lists yet: no event chosen, or the chosen one is loading. (A failed read shows the page's error.)
        <p className={styles.hint}>
          {event
            ? 'Loading this event’s leagues, teams and games…'
            : 'Choose an event to see its leagues, teams and games.'}
        </p>
      )}

      <div className={styles.submit}>
        <button type="submit" className={`${s.button} ${s.buttonLive}`} aria-disabled={busy || !ready || undefined}>
          {busy && task === 'report' ? 'Building report…' : 'Show report'}
        </button>
        <p role="status" className={styles.status}>
          {busy ? (task === 'event' ? 'Loading the event…' : 'Building the report…') : ''}
        </p>
      </div>
      <p id={`${id}-problem`} role="alert" className={s.formError}>
        {problem?.message}
      </p>
    </form>
  );
}

function clamp(value: string): number {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) ? Math.min(1000, Math.max(0, n)) : 0;
}
