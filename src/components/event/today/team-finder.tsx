'use client';

import { useId, useState } from 'react';

import { type Clock, gameStatus } from '@/domain/game-day';
import { formatDayLabel, formatTime } from '@/lib/format';

import { divisionVars } from '../theme';
import { courtName, type TodayDivision, type TodayEvent, type TodayGame, type TodayTeam } from './model';
import styles from './today.module.css';

export interface TeamFinderProps {
  event: TodayEvent;
  teamId: string | null;
  onTeamChange: (teamId: string | null) => void;
  /** The chosen team's game on court now, or its next one. */
  nextGame: TodayGame | null;
  clock: Clock;
  teamName: (id: string | null) => string;
}

/**
 * "Your team": team chips grouped by division (PRD P-04), then the answer
 * that matters most on game day: when and where the team plays next.
 */
export function TeamFinder({ event, teamId, onTeamChange, nextGame, clock, teamName }: TeamFinderProps) {
  const [choosing, setChoosing] = useState(false);
  const headingId = useId();
  const team = event.teams.find((t) => t.id === teamId) ?? null;
  const open = choosing || !team;

  return (
    <section className={styles.finder} aria-labelledby={headingId}>
      {team ? (
        <div className={styles.answer} style={divisionVars(divisionOf(event.divisions, team)?.color ?? '')}>
          <h2 id={headingId} className={styles.answerTeam}>
            <span className="sr-only">Your team: {team.name}</span>
            <span aria-hidden="true">{team.name}</span>
          </h2>
          <NextGameLine event={event} game={nextGame} clock={clock} teamId={team.id} teamName={teamName} />
          <div className={styles.answerActions}>
            <button
              type="button"
              className={styles.textButton}
              aria-expanded={choosing}
              onClick={() => setChoosing((c) => !c)}
            >
              {choosing ? 'Done' : 'Change team'}
            </button>
            <button
              type="button"
              className={styles.textButton}
              onClick={() => {
                onTeamChange(null);
                setChoosing(false);
              }}
            >
              Clear
            </button>
          </div>
        </div>
      ) : (
        <>
          <h2 id={headingId} className={`${styles.sectionTitle} ${styles.finderTitle}`}>
            Find your team
          </h2>
          {/* Phones: one button, so Court 1 stays in the first screen. */}
          <button
            type="button"
            className={styles.finderToggle}
            aria-expanded={choosing}
            onClick={() => setChoosing((c) => !c)}
          >
            Find your team
          </button>
        </>
      )}

      {open ? (
        <div className={styles.chipGroups} data-phone-collapsed={!team && !choosing ? '' : undefined}>
          {event.divisions.map((d) => {
            const teams = event.teams.filter((t) => t.divisionId === d.id);
            if (teams.length === 0) return null;
            return (
              <fieldset key={d.id} className={styles.chipGroup} style={divisionVars(d.color)}>
                <legend className={styles.chipLegend}>
                  <span className={styles.swatch} aria-hidden="true" />
                  {d.name}
                </legend>
                <div className={styles.chips}>
                  {teams.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={styles.chip}
                      aria-pressed={t.id === teamId}
                      onClick={() => {
                        onTeamChange(t.id === teamId ? null : t.id);
                        setChoosing(false);
                      }}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              </fieldset>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function divisionOf(divisions: TodayDivision[], team: TodayTeam) {
  return divisions.find((d) => d.id === team.divisionId);
}

function NextGameLine(props: {
  event: TodayEvent;
  game: TodayGame | null;
  clock: Clock;
  teamId: string;
  teamName: (id: string | null) => string;
}) {
  const { event, game, clock, teamId, teamName } = props;
  if (!game) return <p className={styles.answerLine}>No more games scheduled.</p>;
  const opponent = teamName(game.team1Id === teamId ? game.team2Id : game.team1Id);
  const where = courtName(event, game.court!);
  const time = formatTime(game.time!);
  if (gameStatus(game, clock) === 'on-court') {
    return (
      <p className={styles.answerLine}>
        <strong>On court now</strong> {where}, vs {opponent}
      </p>
    );
  }
  const when = game.day === clock.date ? time : `${formatDayLabel(game.day!)}, ${time}`;
  return (
    <p className={styles.answerLine}>
      <strong>Next: {when}</strong> {where}, vs {opponent}
    </p>
  );
}
