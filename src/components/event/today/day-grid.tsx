'use client';

import { type CSSProperties } from 'react';

import {
  type Clock,
  type DayWindow,
  gameStatus,
  hasBothScores,
  involvesTeam,
  nowFraction,
  SLOT_MINUTES,
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
}

export function DayGrid(props: DayGridProps) {
  const { games, window: w, courts, courtName, clock, day, teamName, divisionColor, teamId, onScoreChange } = props;
  const rows = (w.end - w.start) / STEP;
  const row = (minutes: number) => Math.floor((minutes - w.start) / STEP) + 1;
  const hours: number[] = [];
  for (let m = w.start; m < w.end; m += 60) hours.push(m);

  // The now line sits in the 5-minute row that holds "now", offset within it,
  // so it stays true when rows grow to fit wrapped names.
  const now = nowFraction(clock, day, w);
  const offset = clock.minutes - w.start;
  const nowRow = Math.min(Math.floor(offset / STEP), rows - 1);
  const within = (offset - nowRow * STEP) / STEP;
  const bandStart = now === null ? null : w.start + Math.floor(offset / 60) * 60;

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

        {hours.map((m) => (
          <div
            key={m}
            className={styles.gridHour}
            data-current={m === bandStart || undefined}
            style={{ gridRow: `${row(m) + 1} / span ${60 / STEP}` }}
          >
            {formatTime(minutesToTime(m))}
          </div>
        ))}

        {bandStart !== null && bandStart < w.end ? (
          <div
            className={styles.hourBand}
            aria-hidden="true"
            style={{ gridRow: `${row(bandStart) + 1} / span ${Math.min(60, w.end - bandStart) / STEP}` }}
          />
        ) : null}

        {games.map((g) => {
          const status = gameStatus(g, clock);
          const start = toMinutes(g.time!);
          const match = teamId ? involvesTeam(g, teamId) : null;
          return (
            <GameCell
              key={g.id}
              game={g}
              status={status}
              match={match}
              teamId={teamId}
              teamName={teamName}
              style={{
                gridColumn: g.court! + 1,
                gridRow: `${row(start) + 1} / span ${SLOT_MINUTES / STEP}`,
                ...divisionVars(divisionColor(g)),
              }}
              onScoreChange={onScoreChange}
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
  status: ReturnType<typeof gameStatus>;
  match: boolean | null;
  teamId: string | null;
  teamName: (id: string | null) => string;
  style: CSSProperties;
  onScoreChange?: DayGridProps['onScoreChange'];
}) {
  const { game, status, match, teamId, teamName, style, onScoreChange } = props;
  const bothKnown = game.team1Id !== null && game.team2Id !== null;
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
      <header className={styles.cellHead}>
        <span className={styles.swatch} aria-hidden="true" />
        <span className={styles.cellLabel}>{game.label}</span>
      </header>
      {words ? <p className={styles.cellStatus}>{words}</p> : null}
      {team(1)}
      {team(2)}
    </article>
  );
}
