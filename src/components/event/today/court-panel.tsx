import { type CSSProperties } from 'react';

import { type CourtStations, hasBothScores } from '@/domain/game-day';
import { formatTime } from '@/lib/format';

import { divisionVars } from '../theme';
import { type TodayGame } from './model';
import styles from './today.module.css';

type Featured = 'on-court' | 'upcoming' | 'final' | 'empty';

export interface CourtPanelProps {
  name: string;
  stations: CourtStations<TodayGame>;
  teamName: (teamId: string | null) => string;
  divisionColor: (divisionId: string) => string;
  /** The spectator's team, painted where it appears. */
  teamId: string | null;
}

/**
 * One court as a painted court (Painted Lines direction). State is carried
 * by stroke and by words, never by colour alone: solid lines while a game is
 * on court, dashed while the court waits for its next game.
 */
export function CourtPanel({ name, stations, teamName, divisionColor, teamId }: CourtPanelProps) {
  const { onCourt, upNext, final, then } = stations;
  const game = onCourt ?? upNext ?? final;
  const featured: Featured = onCourt ? 'on-court' : upNext ? 'upcoming' : final ? 'final' : 'empty';
  const headingId = `court-${stations.court}-heading`;

  const rows: { term: string; game: TodayGame }[] = [];
  if (final && final !== game) rows.push({ term: hasBothScores(final) ? 'Final' : 'Awaiting score', game: final });
  if (featured === 'on-court' && upNext) rows.push({ term: 'Up next', game: upNext });
  if (featured === 'upcoming' && then) rows.push({ term: 'Then', game: then });

  return (
    <section className={styles.courtPanel} aria-labelledby={headingId} data-state={featured}>
      <header className={styles.courtHeader}>
        <h3 id={headingId} className={styles.courtName}>
          {name}
        </h3>
        <p className={styles.courtStatus}>
          <StatusWords featured={featured} game={game} />
        </p>
      </header>

      <div
        className={styles.court}
        style={game ? divisionVars(divisionColor(game.divisionId)) : ({} as CSSProperties)}
        data-state={featured}
      >
        <CourtLines />
        {game ? (
          <>
            <Side
              side={1}
              name={teamName(game.team1Id)}
              score={featured === 'upcoming' ? null : game.score1}
              changedAt={game.changedAt}
              mine={Boolean(teamId && game.team1Id === teamId)}
            />
            <Side
              side={2}
              name={teamName(game.team2Id)}
              score={featured === 'upcoming' ? null : game.score2}
              changedAt={game.changedAt}
              mine={Boolean(teamId && game.team2Id === teamId)}
            />
            {featured === 'upcoming' && game.time ? (
              <p className={styles.centreMark}>
                <span className="sr-only">Starts </span>
                {formatTime(game.time)}
              </p>
            ) : null}
          </>
        ) : (
          <p className={styles.courtEmpty}>No more games on this court.</p>
        )}
      </div>

      {rows.length > 0 || featured === 'final' ? (
        <dl className={styles.stations}>
          {rows.map(({ term, game: g }) => (
            <div key={term} className={styles.station} style={divisionVars(divisionColor(g.divisionId))}>
              <dt>{term}</dt>
              <dd>
                <StationGame
                  game={g}
                  teamName={teamName}
                  teamId={teamId}
                  showScore={term !== 'Up next' && term !== 'Then'}
                />
              </dd>
            </div>
          ))}
          {featured === 'final' ? (
            <div className={styles.station}>
              <dt>Up next</dt>
              <dd className={styles.stationQuiet}>No more games on this court.</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </section>
  );
}

function StatusWords({ featured, game }: { featured: Featured; game: TodayGame | null }) {
  const time = game?.time ? formatTime(game.time) : '';
  switch (featured) {
    case 'on-court':
      return (
        <>
          <span className={styles.liveMark} aria-hidden="true" />
          <strong>On court</strong> <span>started {time}</span>
        </>
      );
    case 'upcoming':
      return (
        <>
          <strong>Up next</strong> <span>{time}</span>
        </>
      );
    case 'final':
      return (
        <>
          <strong>{game && game.score1 !== null && game.score2 !== null ? 'Final' : 'Awaiting score'}</strong>{' '}
          <span>{time}</span>
        </>
      );
    default:
      return <span>Free</span>;
  }
}

function Side(props: { side: 1 | 2; name: string; score: number | null; changedAt?: number; mine: boolean }) {
  const { side, name, score, changedAt, mine } = props;
  return (
    <div className={styles.side} data-side={side} data-mine={mine || undefined}>
      <p className={styles.sideName}>
        <span>{name}</span>
        {mine ? <span className="sr-only"> (your team)</span> : null}
      </p>
      {score !== null ? (
        <p className={styles.sideScore}>
          <span className="sr-only">{side === 1 ? 'score ' : ', score '}</span>
          <span key={`${score}-${changedAt ?? 0}`} className={changedAt ? styles.paintIn : undefined}>
            {score}
          </span>
        </p>
      ) : null}
    </div>
  );
}

function StationGame(props: {
  game: TodayGame;
  teamName: (id: string | null) => string;
  teamId: string | null;
  showScore: boolean;
}) {
  const { game, teamName, teamId, showScore } = props;
  const side = (id: string | null, score: number | null, after = '') => (
    <span className={styles.stationTeam} data-mine={(teamId && id === teamId) || undefined}>
      {teamName(id)}
      {showScore && score !== null ? <b>{score}</b> : null}
      {after}
    </span>
  );
  return (
    <>
      <span className={styles.stationTime}>{game.time ? formatTime(game.time) : ''}</span>
      <span className={styles.swatch} aria-hidden="true" />
      {/* A result reads "Hawks 66, Bolts 49"; anything without both scores reads "vs". */}
      {side(game.team1Id, game.score1, showScore && hasBothScores(game) ? ',' : '')}
      {showScore && hasBothScores(game) ? null : <span className={styles.stationVs}>vs</span>}
      {side(game.team2Id, game.score2)}
    </>
  );
}

/**
 * FIBA court markings on a 28 m x 15 m floor, 10 units to the metre. Lines
 * keep a constant 2 px paint weight at any size (non-scaling stroke).
 */
function CourtLines() {
  const end = (
    <>
      <rect className={styles.key} x="1" y="50.5" width="57" height="49" />
      <path d="M58 57 A18 18 0 0 1 58 93" />
      <path d="M1 9 H29.9 A67.5 67.5 0 0 1 29.9 141 H1" />
      <path d="M12 66 V84" />
      <circle cx="15.75" cy="75" r="2.25" />
    </>
  );
  return (
    <svg className={styles.courtLines} viewBox="0 0 280 150" aria-hidden="true" focusable="false">
      <rect className={styles.floor} x="1" y="1" width="278" height="148" />
      <path d="M140 1 V149" />
      <circle cx="140" cy="75" r="18" />
      <circle className={styles.centreDot} cx="140" cy="75" r="6" />
      {/* Final: both baselines closed with a heavy painted tick. */}
      <path className={styles.baselineTick} d="M1 1 V149 M279 1 V149" />
      <g>{end}</g>
      <g transform="translate(280 0) scale(-1 1)">{end}</g>
    </svg>
  );
}
