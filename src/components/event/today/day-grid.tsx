'use client';

import { type CSSProperties } from 'react';

import {
  cellEnd,
  type Clock,
  compareScheduled,
  type DayWindow,
  gameStatus,
  hasBothScores,
  involvesTeam,
  markInProgress,
  nowFraction,
  startMarks,
  toMinutes,
} from '@/domain/game-day';
import { minutesToTime } from '@/lib/event-time';
import { formatTime } from '@/lib/format';

import { divisionVars } from '../theme';
import { type TodayGame } from './model';
import styles from './today.module.css';

/** Grid rows are 5-minute steps, so off-grid start times keep their true place. */
const STEP = 5;

export interface DayGridProps {
  games: TodayGame[];
  window: DayWindow;
  courts: number;
  courtName: (court: number) => string;
  clock: Clock;
  day: string;
  teamName: (teamId: string | null) => string;
  divisionColor: (game: TodayGame) => string;
  teamId: string | null;
  /** Owners and superadmins enter scores here (PRD P-08). */
  onScoreChange?: (gameId: string, side: 1 | 2, score: number | null) => void;
  unlockedGames?: ReadonlySet<string>;
  pendingGames?: ReadonlySet<string>;
  onToggleLock?: (gameId: string, locked: boolean) => void;
}

export function DayGrid(props: DayGridProps) {
  const {
    games,
    window: w,
    courts,
    courtName,
    clock,
    day,
    teamName,
    divisionColor,
    teamId,
    onScoreChange,
    unlockedGames,
    pendingGames,
    onToggleLock,
  } = props;
  // Rounded up: a start on an odd minute must not leave a fractional row count.
  const rows = Math.ceil((w.end - w.start) / STEP);
  const row = (minutes: number) => Math.floor((minutes - w.start) / STEP) + 1;

  // The time column labels each real start time; a label runs to the next
  // start, or past the last row. The band runs while that start's games are on court.
  const marks = startMarks(games, day, w, STEP);
  const endRow = (minutes: number) => (minutes >= w.end ? rows + 1 : row(minutes));
  const inProgress = markInProgress(marks, clock, day);

  // The now line sits in the 5-minute row that holds "now", offset within it,
  // so it stays true when rows grow to fit wrapped names.
  const now = nowFraction(clock, day, w);
  const offset = clock.minutes - w.start;
  const nowRow = Math.min(Math.floor(offset / STEP), rows - 1);
  const within = (offset - nowRow * STEP) / STEP;

  return (
    <div className={styles.gridScroll} tabIndex={0} role="region" aria-label="Games by time and court">
      <div
        className={styles.grid}
        style={{ '--courts': courts, '--rows': rows } as CSSProperties}
        data-filtered={teamId ? '' : undefined}
      >
        <div className={styles.gridCorner} aria-hidden="true" />
        {Array.from({ length: courts }, (_, i) => (
          <div key={i} className={styles.gridCourt} style={{ gridColumn: i + 2 }}>
            {courtName(i + 1)}
          </div>
        ))}

        {/* Visual only: every game cell names its own start time for screen readers. */}
        {marks.map((mark) => (
          <div
            key={mark.start}
            className={styles.gridTime}
            data-current={mark === inProgress?.mark || undefined}
            aria-hidden="true"
            style={{ gridRow: `${row(mark.start) + 1} / ${endRow(mark.end) + 1}` }}
          >
            {mark.times.map((t) => (
              <time key={t} dateTime={t}>
                {formatTime(t)}
              </time>
            ))}
          </div>
        ))}

        {inProgress ? (
          <div
            className={styles.timeBand}
            aria-hidden="true"
            style={{ gridRow: `${row(inProgress.mark.start) + 1} / ${endRow(inProgress.until) + 1}` }}
          />
        ) : null}

        {/* Reading order, time then court, so screen readers and Tab follow the grid. */}
        {[...games].sort(compareScheduled).map((g) => {
          const status = gameStatus(g, clock);
          const start = toMinutes(g.time!);
          const match = teamId ? involvesTeam(g, teamId) : null;
          return (
            <GameCell
              key={g.id}
              game={g}
              court={courtName(g.court!)}
              status={status}
              match={match}
              teamId={teamId}
              teamName={teamName}
              style={{
                gridColumn: g.court! + 1,
                gridRow: `${row(start) + 1} / span ${Math.max(1, row(cellEnd(g, games)) - row(start))}`,
                ...divisionVars(divisionColor(g)),
              }}
              onScoreChange={onScoreChange}
              unlockedGames={unlockedGames}
              pendingGames={pendingGames}
              onToggleLock={onToggleLock}
            />
          );
        })}

        {now !== null ? (
          <div className={styles.nowLine} style={{ gridRow: nowRow + 2, '--within': within } as CSSProperties}>
            <span className={styles.nowTag}>
              <span>Now</span> <time>{formatTime(minutesToTime(clock.minutes))}</time>
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

const STATUS_WORDS = {
  'on-court': 'On court',
  final: 'Final',
  'awaiting-score': 'Awaiting score',
  upcoming: '',
  unscheduled: '',
} as const;

function GameCell(props: {
  game: TodayGame;
  court: string;
  status: ReturnType<typeof gameStatus>;
  match: boolean | null;
  teamId: string | null;
  teamName: (id: string | null) => string;
  style: CSSProperties;
  onScoreChange?: DayGridProps['onScoreChange'];
  unlockedGames?: ReadonlySet<string>;
  pendingGames?: ReadonlySet<string>;
  onToggleLock?: DayGridProps['onToggleLock'];
}) {
  const {
    game,
    court,
    status,
    match,
    teamId,
    teamName,
    style,
    onScoreChange,
    unlockedGames,
    pendingGames,
    onToggleLock,
  } = props;
  const bothKnown = game.team1Id !== null && game.team2Id !== null;
  const scoreLocked =
    Boolean(onToggleLock) &&
    status === 'final' &&
    hasBothScores(game) &&
    !unlockedGames?.has(game.id) &&
    !pendingGames?.has(game.id);
  const winner = status === 'final' && hasBothScores(game) && game.score1 !== game.score2;
  const words = STATUS_WORDS[status];

  const team = (side: 1 | 2) => {
    const id = side === 1 ? game.team1Id : game.team2Id;
    const score = side === 1 ? game.score1 : game.score2;
    const other = side === 1 ? game.score2 : game.score1;
    const won = winner && score !== null && other !== null && score > other;
    return (
      <div className={styles.cellTeam} data-mine={(teamId && id === teamId) || undefined} data-won={won || undefined}>
        <span className={styles.cellTeamName}>{teamName(id)}</span>
        {bothKnown && onScoreChange ? (
          <input
            className={styles.scoreInput}
            // Text with a numeric keypad: a number input empties itself on
            // "-" or "e", which would silently clear a score.
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={3}
            disabled={scoreLocked}
            aria-readonly={scoreLocked}
            aria-label={`${teamName(id)} score, ${formatTime(game.time!)} ${game.label}`}
            defaultValue={score ?? ''}
            onChange={(e) => {
              const raw = e.currentTarget.value.trim();
              if (raw === '') onScoreChange(game.id, side, null);
              else if (/^\d+$/.test(raw)) onScoreChange(game.id, side, Number(raw));
            }}
          />
        ) : bothKnown && score !== null ? (
          <span key={`${score}-${game.changedAt ?? 0}`} className={game.changedAt ? styles.paintIn : undefined}>
            {score}
          </span>
        ) : null}
      </div>
    );
  };

  return (
    <article
      className={styles.cell}
      style={style}
      data-status={status}
      data-match={match === null ? undefined : String(match)}
      data-playoff={game.type !== 'group' || undefined}
    >
      <p className="sr-only">
        <time dateTime={game.time!}>{formatTime(game.time!)}</time>, {court}
      </p>
      <header className={styles.cellHead}>
        <span className={styles.swatch} aria-hidden="true" />
        <span className={styles.cellLabel}>{game.label}</span>
        {bothKnown && onScoreChange && status === 'final' && onToggleLock ? (
          <button
            type="button"
            className={styles.lockButton}
            aria-label={
              (scoreLocked ? 'Unlock' : 'Lock') +
              ' score for ' +
              teamName(game.team1Id) +
              ' versus ' +
              teamName(game.team2Id)
            }
            title={scoreLocked ? 'Unlock score' : 'Lock score'}
            onClick={() => onToggleLock(game.id, scoreLocked)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {scoreLocked ? (
                <path d="M7 10V7a5 5 0 0 1 10 0v3h1v10H6V10h1Zm2 0h6V7a3 3 0 0 0-6 0v3Zm3 3a1.5 1.5 0 0 0-1 2.62V18h2v-2.38A1.5 1.5 0 0 0 12 13Z" />
              ) : (
                <path d="M8 10V7a4 4 0 0 1 7.75-1.33l-1.9.64A2 2 0 0 0 10 7v3h8v10H6V10h2Zm4 3a1.5 1.5 0 0 0-1 2.62V18h2v-2.38A1.5 1.5 0 0 0 12 13Z" />
              )}
            </svg>
          </button>
        ) : null}
      </header>
      {words ? <p className={styles.cellStatus}>{words}</p> : null}
      {team(1)}
      {team(2)}
    </article>
  );
}
