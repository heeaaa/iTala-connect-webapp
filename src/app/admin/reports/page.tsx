import type { Metadata } from 'next';
import { z } from 'zod';

import { TitlePlate, platformStyles } from '@/components/platform/platform-frame';
import { buildReport, ReportInputError } from '@/features/reports/build';
import { listReportEvents, loadConnectReportSource } from '@/features/reports/connect-source';
import {
  REPORT_TEMPLATES,
  type ReportDefinition,
  type ReportDocument,
  type ReportSource,
} from '@/features/reports/model';
import { ReportPreview } from '@/features/reports/preview';
import { canEditEvent, requireAdmin } from '@/server/auth';

import styles from '@/features/reports/reports.module.css';

export const metadata: Metadata = { title: 'Reports' };

function one(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : '';
}

function definition(query: Record<string, string | string[] | undefined>, source: ReportSource): ReportDefinition {
  const template = one(query.template) || 'results';
  const mode = one(query.dateMode) || 'all';
  const dateText = one(query.dates);
  const dates =
    mode === 'all'
      ? []
      : dateText
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
  return {
    eventId: source.event.id,
    template: template as ReportDefinition['template'],
    divisionId: one(query.division) || undefined,
    teamId: one(query.team) || undefined,
    playerId: one(query.player) || undefined,
    gameIds: one(query.game) ? [one(query.game)] : undefined,
    dateMode: mode as ReportDefinition['dateMode'],
    dates,
    relative: (one(query.relative) as ReportDefinition['relative']) || undefined,
    standingsScope: (one(query.standings) as ReportDefinition['standingsScope']) || undefined,
    minAppearances: one(query.minAppearances) ? Number(one(query.minAppearances)) : undefined,
    minAttempts: one(query.minAttempts) ? Number(one(query.minAttempts)) : undefined,
  };
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requireAdmin('/admin/reports');
  const query = await searchParams;
  const events = await listReportEvents(admin);
  const eventId = one(query.event);
  const eventSelected = z.uuid().safeParse(eventId).success && events.some((e) => e.id === eventId);
  const canRead = eventSelected && (await canEditEvent(eventId));
  let source: ReportSource | null = null;
  let report: ReportDocument | null = null;
  let error: string | null = null;
  if (eventId && !canRead) error = 'That event is unavailable for your account.';
  if (canRead) {
    try {
      source = await loadConnectReportSource(eventId);
      if (one(query.preview) === '1') report = buildReport(source, definition(query, source), new Date().toISOString());
    } catch (cause) {
      error = cause instanceof ReportInputError ? cause.message : 'Could not prepare the report. Please try again.';
    }
  }
  return (
    <>
      <TitlePlate title="Reports" sub="Results and statistics from the events you manage" />
      <div className={styles.intro}>
        <p>
          Choose an event and report. Recorded scores come from Connect. Player statistics appear only when an approved
          mobile source can be read and verified.
        </p>
      </div>
      {events.length ? (
        <form action="/admin/reports" method="get" className={styles.form}>
          <label>
            Event
            <select name="event" defaultValue={canRead ? eventId : ''} required>
              <option value="">Choose an event</option>
              {events.map((event) => (
                <option value={event.id} key={event.id}>
                  {event.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Report
            <select name="template" defaultValue={one(query.template) || 'results'}>
              {REPORT_TEMPLATES.map((template) => (
                <option value={template.id} key={template.id}>
                  {template.label}
                </option>
              ))}
            </select>
          </label>
          {source ? (
            <>
              <label>
                League / division
                <select name="division" defaultValue={one(query.division)}>
                  <option value="">All divisions</option>
                  {source.divisions.map((division) => (
                    <option value={division.id} key={division.id}>
                      {division.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Team
                <select name="team" defaultValue={one(query.team)}>
                  <option value="">All teams</option>
                  {source.teams.map((team) => (
                    <option value={team.id} key={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Game
                <select name="game" defaultValue={one(query.game)}>
                  <option value="">All matching games</option>
                  {source.games
                    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
                    .map((game) => (
                      <option value={game.id} key={game.id}>
                        {source.divisions.find((division) => division.id === game.divisionId)?.name ?? 'Division TBC'} ·{' '}
                        {game.date || 'Date TBC'} ·{' '}
                        {source.teams.find((team) => team.id === game.homeTeamId)?.name ?? 'TBC'} vs{' '}
                        {source.teams.find((team) => team.id === game.awayTeamId)?.name ?? 'TBC'}
                      </option>
                    ))}
                </select>
              </label>
              {source.players.length ? (
                <label>
                  Player
                  <select name="player" defaultValue={one(query.player)}>
                    <option value="">Choose a player</option>
                    {source.players.map((player) => (
                      <option value={player.id} key={player.id}>
                        {player.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </>
          ) : null}
          <label>
            Date selection
            <select name="dateMode" defaultValue={one(query.dateMode) || 'all'}>
              <option value="all">All scored games</option>
              <option value="day">One day</option>
              <option value="range">Date range</option>
              <option value="dates">Selected dates</option>
            </select>
          </label>
          <label>
            Dates <span className={styles.hint}>YYYY-MM-DD, comma-separated for a range or selected dates</span>
            <input name="dates" defaultValue={one(query.dates)} placeholder="2026-10-02" />
          </label>
          <label>
            Recent games
            <select name="relative" defaultValue={one(query.relative)}>
              <option value="">All matching games</option>
              <option value="latest">Latest game</option>
              <option value="last-five">Last five games</option>
            </select>
          </label>
          <label>
            Standings
            <select name="standings" defaultValue={one(query.standings) || 'through-cutoff'}>
              <option value="through-cutoff">Full competition through cutoff</option>
              <option value="selected-games">Selected games only</option>
            </select>
          </label>
          <label>
            Minimum appearances <span className={styles.hint}>For player leaderboards</span>
            <input
              type="number"
              name="minAppearances"
              min="0"
              max="1000"
              step="1"
              defaultValue={one(query.minAppearances) || '0'}
            />
          </label>
          <label>
            Minimum attempts <span className={styles.hint}>For shooting leaderboards</span>
            <input
              type="number"
              name="minAttempts"
              min="0"
              max="1000"
              step="1"
              defaultValue={one(query.minAttempts) || '0'}
            />
          </label>
          <button
            type="submit"
            name="preview"
            value="1"
            className={`${platformStyles.button} ${platformStyles.buttonLive}`}
          >
            Build preview
          </button>
        </form>
      ) : (
        <p className={styles.empty}>No events are available to manage.</p>
      )}
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
      {report ? <ReportPreview report={report} /> : null}
    </>
  );
}
