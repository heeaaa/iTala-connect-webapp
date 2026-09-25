'use client';

import {
  type Clock,
  courtStations,
  dayWindow,
  involvesTeam,
  nextGameForTeam,
  pickFocusDay,
  toMinutes,
} from '@/domain/game-day';
import { formatDayLabel } from '@/lib/format';

import { divisionVars } from '../theme';
import { CourtPanel } from './court-panel';
import { DayGrid } from './day-grid';
import { DayStrip } from './day-strip';
import { courtName, type FeedState, type TodayEvent, type TodayGame } from './model';
import { TeamFinder } from './team-finder';
import styles from './today.module.css';
import { useStoredTeam } from './use-stored-team';

/** Evening game days read "Tonight"; first game at or after 5:00 pm. */
const EVENING = 17 * 60;

export interface TodayScheduleProps {
  event: TodayEvent;
  /** "Now" in the event time zone. */
  clock: Clock;
  /** Day from the URL; ignored unless it is an event day. */
  selectedDay: string | null;
  feed: FeedState;
  onScoreChange?: (gameId: string, side: 1 | 2, score: number | null) => void;
}

/** Public event page, Schedule tab (PRD P-04, P-05), Painted Lines direction. */
export function TodaySchedule({ event, clock, selectedDay, feed, onScoreChange }: TodayScheduleProps) {
  const [storedTeam, setTeam] = useStoredTeam(event.id);
  const teamId = event.teams.some((t) => t.id === storedTeam) ? storedTeam : null;
  const focus = pickFocusDay(event.days, clock.date);

  if (!focus) {
    return <p className={styles.emptyState}>No schedule yet.</p>;
  }

  const day = selectedDay && event.days.includes(selectedDay) ? selectedDay : focus.day;
  const isToday = day === clock.date;
  const names = new Map(event.teams.map((t) => [t.id, t.name]));
  const teamName = (id: string | null) => (id ? (names.get(id) ?? 'TBD') : 'TBD');
  const colours = new Map(event.divisions.map((d) => [d.id, d.color]));
  const divisionColor = (divisionId: string) => colours.get(divisionId) ?? '';
  const courtLabel = (court: number) => courtName(event, court);

  const dayGames = event.games.filter((g) => g.day === day && g.time !== null && g.court !== null);
  const unscheduled = event.games.filter((g) => g.day === null || g.time === null || g.court === null);
  const span = dayWindow(dayGames, day);
  const courts = Math.max(0, ...dayGames.map((g) => g.court!));
  const firstStart = Math.min(...dayGames.map((g) => toMinutes(g.time!)));
  const todayWord = firstStart >= EVENING ? 'Tonight' : 'Today';
  const stations = isToday ? courtStations(dayGames, day, courts, clock) : [];
  const teamGamesToday = teamId ? dayGames.filter((g) => involvesTeam(g, teamId)) : [];
  const shownUnscheduled = teamId ? unscheduled.filter((g) => involvesTeam(g, teamId)) : unscheduled;
  const onCourtNow = stations.filter((s) => s.onCourt);
  const dayHeading = isToday ? `${todayWord}'s games` : `Games on ${formatDayLabel(day)}`;

  return (
    <div className={styles.today}>
      <DayStrip days={event.days} selected={day} today={clock.date} todayWord={todayWord} />

      {isToday ? (
        <p className={styles.feed} role="status" data-feed={feed}>
          <span className={styles.feedMark} aria-hidden="true" />
          {feed === 'live' ? 'Live. Scores update automatically.' : 'Reconnecting. Scores may be out of date.'}
        </p>
      ) : (
        <p className={styles.dayNote}>
          {day === focus.day && focus.relation === 'upcoming'
            ? `Next game day: ${formatDayLabel(day)}`
            : `Showing ${formatDayLabel(day)}`}
        </p>
      )}

      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <TeamFinder
            event={event}
            teamId={teamId}
            onTeamChange={setTeam}
            nextGame={teamId ? nextGameForTeam(event.games, teamId, clock) : null}
            clock={clock}
            teamName={teamName}
          />
          {teamId && teamGamesToday.length === 0 && dayGames.length > 0 ? (
            <p className={styles.filterNote}>
              No {teamName(teamId)} games on {formatDayLabel(day)}.
            </p>
          ) : null}
        </aside>

        <div className={styles.main}>
          {stations.length > 0 ? (
            <section aria-labelledby="courts-heading">
              <h2 id="courts-heading" className="sr-only">
                On the courts
              </h2>
              {/* Three or more courts scroll sideways on phones, so the rail takes keyboard focus. */}
              <div
                className={styles.courts}
                data-count={stations.length > 2 ? 'many' : 'few'}
                {...(stations.length > 2 ? { tabIndex: 0, role: 'group', 'aria-label': 'Courts' } : {})}
              >
                {stations.map((s) => (
                  <CourtPanel
                    key={s.court}
                    name={courtLabel(s.court)}
                    stations={s}
                    teamName={teamName}
                    divisionColor={divisionColor}
                    teamId={teamId}
                  />
                ))}
              </div>
              <p className="sr-only" aria-live="polite">
                {onCourtNow
                  .map(
                    ({ court, onCourt: g }) =>
                      `${courtLabel(court)}: ${teamName(g!.team1Id)} ${g!.score1 ?? 0}, ${teamName(g!.team2Id)} ${g!.score2 ?? 0}`,
                  )
                  .join('. ')}
              </p>
            </section>
          ) : null}

          <section aria-labelledby="day-games-heading" className={styles.daySection}>
            <h2 id="day-games-heading" className={styles.sectionTitle}>
              {dayHeading}
            </h2>
            {span ? <GridKey event={event} games={dayGames} /> : null}
            {span ? (
              <DayGrid
                games={dayGames}
                window={span}
                courts={courts}
                courtName={courtLabel}
                clock={clock}
                day={day}
                teamName={teamName}
                divisionColor={(g: TodayGame) => divisionColor(g.divisionId)}
                teamId={teamId}
                onScoreChange={onScoreChange}
              />
            ) : (
              <p className={styles.emptyState}>No games on {formatDayLabel(day)}.</p>
            )}
          </section>

          {shownUnscheduled.length > 0 ? (
            <section aria-labelledby="unscheduled-heading" className={styles.daySection}>
              <h2 id="unscheduled-heading" className={styles.sectionTitle}>
                Unscheduled
              </h2>
              <ul className={styles.unscheduled}>
                {shownUnscheduled.map((g) => (
                  <li key={g.id}>
                    <span className={styles.cellLabel}>{g.label}</span>
                    <span>
                      {teamName(g.team1Id)} vs {teamName(g.team2Id)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Division colours in use on the day, and Semis / Finals only when the day has playoff games (PRD P-04). */
function GridKey({ event, games }: { event: TodayEvent; games: TodayGame[] }) {
  const inUse = new Set(games.filter((g) => g.type === 'group').map((g) => g.divisionId));
  const playoffs = games.some((g) => g.type !== 'group');
  return (
    <ul className={styles.gridKey} aria-label="Key">
      {event.divisions
        .filter((d) => inUse.has(d.id))
        .map((d) => (
          <li key={d.id} style={divisionVars(d.color)}>
            <span className={styles.swatch} aria-hidden="true" />
            {d.name}
          </li>
        ))}
      {playoffs ? (
        <li>
          <span className={styles.swatch} data-playoff="" aria-hidden="true" />
          Semis / Finals
        </li>
      ) : null}
    </ul>
  );
}
