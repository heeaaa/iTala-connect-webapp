import { formatDate, formatDayLabel, formatTime } from '@/lib/format';

import {
  MOBILE_UNVERIFIED,
  REPORT_TEMPLATES,
  type ReportDefinition,
  type ReportSource,
  type ReportTemplate,
} from './model';

/**
 * The report form's choices, worked out without React so every rule is tested on its own: which
 * teams, game days, games and players each choice leaves, how a calendar click changes the dates,
 * and what a filled-in form asks the report for.
 */

export type DateMode = ReportDefinition['dateMode'];

export interface BuilderGame {
  id: string;
  divisionId: string;
  date: string;
  startTime: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeScore: number | null;
  awayScore: number | null;
}

export interface BuilderOptions {
  divisions: { id: string; name: string }[];
  teams: { id: string; divisionId: string; name: string }[];
  /** In date and start time order; games without a date last. */
  games: BuilderGame[];
  /** Players with recorded mobile stats, by name, with the teams they recorded them for. */
  players: { id: string; name: string; teamIds: string[] }[];
  /**
   * False when the mobile stats could not be read for the whole event (more than 100 linked games,
   * or the mobile app did not answer), so the player list may be missing people.
   */
  playersComplete: boolean;
  /** Today in the event's time zone, where the calendar opens when no day has games. */
  today: string;
}

export interface BuilderState {
  template: ReportTemplate;
  divisionId: string;
  teamId: string;
  playerId: string;
  gameId: string;
  dateMode: DateMode;
  /** One day. */
  day: string;
  /** A date range, both ends included. */
  from: string;
  to: string;
  /** Several days. */
  days: string[];
  relative: '' | 'latest' | 'last-five';
  standingsScope: 'through-cutoff' | 'selected-games';
  minAppearances: number;
  minAttempts: number;
  /** "Show all player stats" ticked. */
  allStats: boolean;
}

/** Which choices each report uses. A field a report ignores is hidden and never sent. */
export const TEMPLATE_FIELDS: Record<
  ReportTemplate,
  { teamRequired: boolean; game: boolean; player: boolean; standings: boolean; minimums: boolean; stats: boolean }
> = {
  'box-score': { teamRequired: false, game: true, player: false, standings: false, minimums: false, stats: true },
  league: { teamRequired: false, game: true, player: false, standings: false, minimums: false, stats: true },
  team: { teamRequired: true, game: true, player: false, standings: false, minimums: false, stats: true },
  results: { teamRequired: false, game: true, player: false, standings: true, minimums: false, stats: false },
  leaders: { teamRequired: false, game: true, player: false, standings: false, minimums: true, stats: true },
  'player-log': { teamRequired: false, game: false, player: true, standings: false, minimums: false, stats: true },
};

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
export function isDay(value: string): boolean {
  return ISO_DAY.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

const byWhen = (a: BuilderGame, b: BuilderGame) =>
  (a.date || '9999').localeCompare(b.date || '9999') ||
  a.startTime.localeCompare(b.startTime) ||
  a.id.localeCompare(b.id);

/**
 * The form's lists for one event. Later sources only add players: the page reads mobile stats once
 * for the whole event and once for the report shown, and a player found by either can be chosen.
 */
export function builderOptions(
  source: ReportSource,
  more: readonly ReportSource[] = [],
  extra: { playersComplete?: boolean; today?: string } = {},
): BuilderOptions {
  const names = new Map<string, string>();
  const teamsOf = new Map<string, Set<string>>();
  for (const s of [source, ...more]) {
    for (const p of s.players) names.set(p.id, p.name);
    for (const game of s.games)
      for (const e of game.mobileEvents) {
        if (!e.playerId) continue;
        const teams = teamsOf.get(e.playerId) ?? new Set<string>();
        teams.add(e.teamId);
        teamsOf.set(e.playerId, teams);
      }
  }
  return {
    divisions: source.divisions.map(({ id, name }) => ({ id, name })),
    teams: source.teams.map(({ id, divisionId, name }) => ({ id, divisionId, name })),
    games: source.games
      .map((g) => ({
        id: g.id,
        divisionId: g.divisionId,
        date: g.date,
        startTime: g.startTime,
        homeTeamId: g.homeTeamId,
        awayTeamId: g.awayTeamId,
        homeScore: g.homeScore,
        awayScore: g.awayScore,
      }))
      .sort(byWhen),
    players: [...names]
      .map(([id, name]) => ({ id, name, teamIds: [...(teamsOf.get(id) ?? [])].sort() }))
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
    playersComplete: extra.playersComplete ?? true,
    today: extra.today ?? '',
  };
}

function one(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : '';
}

function whole(value: string, fallback: number): number {
  const n = Number(value);
  return value !== '' && Number.isSafeInteger(n) && n >= 0 && n <= 1000 ? n : fallback;
}

/**
 * The report the address asks for, as the server reads it (unchanged from the first Reports page).
 * It is not cleaned up here: reportDefinitionSchema and buildReport refuse anything invalid.
 */
export function definitionFromQuery(
  query: Record<string, string | string[] | undefined>,
  eventId: string,
): ReportDefinition {
  const template = one(query.template) || 'results';
  const mode = one(query.dateMode) || 'all';
  const dates =
    mode === 'all'
      ? []
      : one(query.dates)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
  return {
    eventId,
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
    allStats: one(query.stats) === 'all' || undefined,
  };
}

/** The form as the address describes it; anything unknown falls back to the form's defaults. */
export function stateFromQuery(query: Record<string, string | string[] | undefined>): BuilderState {
  const template = REPORT_TEMPLATES.some((t) => t.id === one(query.template))
    ? (one(query.template) as ReportTemplate)
    : 'results';
  const asked = one(query.dateMode);
  const dateMode: DateMode = asked === 'day' || asked === 'range' || asked === 'dates' ? asked : 'all';
  const dates = one(query.dates)
    .split(',')
    .map((s) => s.trim())
    .filter(isDay);
  const relative = one(query.relative);
  return {
    template,
    divisionId: one(query.division),
    teamId: one(query.team),
    playerId: one(query.player),
    gameId: one(query.game),
    dateMode,
    day: dateMode === 'day' ? (dates[0] ?? '') : '',
    from: dateMode === 'range' ? (dates[0] ?? '') : '',
    to: dateMode === 'range' ? (dates[1] ?? dates[0] ?? '') : '',
    days: dateMode === 'dates' ? [...new Set(dates)].sort() : [],
    relative: relative === 'latest' || relative === 'last-five' ? relative : '',
    standingsScope: one(query.standings) === 'selected-games' ? 'selected-games' : 'through-cutoff',
    minAppearances: whole(one(query.minAppearances), 0),
    minAttempts: whole(one(query.minAttempts), 0),
    allStats: one(query.stats) === 'all',
  };
}

function datesOf(s: BuilderState): string[] {
  if (s.dateMode === 'day') return s.day ? [s.day] : [];
  if (s.dateMode === 'range') return s.from && s.to ? [s.from, s.to] : [];
  if (s.dateMode === 'dates') return s.days;
  return [];
}

/** What the filled-in form asks for. Choices the report ignores are left out. */
export function definitionFromState(eventId: string, s: BuilderState): ReportDefinition {
  const f = TEMPLATE_FIELDS[s.template];
  return {
    eventId,
    template: s.template,
    divisionId: s.divisionId || undefined,
    teamId: s.teamId || undefined,
    playerId: f.player ? s.playerId || undefined : undefined,
    gameIds: f.game && s.gameId ? [s.gameId] : undefined,
    dateMode: s.dateMode,
    dates: datesOf(s),
    relative: s.relative || undefined,
    standingsScope: f.standings ? s.standingsScope : undefined,
    minAppearances: f.minimums ? s.minAppearances : undefined,
    minAttempts: f.minimums ? s.minAttempts : undefined,
    allStats: f.stats && s.allStats ? true : undefined,
  };
}

export function teamsFor(o: BuilderOptions, s: BuilderState) {
  return o.teams.filter((t) => !s.divisionId || t.divisionId === s.divisionId);
}

/** Games in the chosen league and with the chosen team, on any day. */
function inScope(o: BuilderOptions, s: BuilderState): BuilderGame[] {
  return o.games.filter(
    (g) =>
      (!s.divisionId || g.divisionId === s.divisionId) &&
      (!s.teamId || g.homeTeamId === s.teamId || g.awayTeamId === s.teamId),
  );
}

export interface GameDay {
  date: string;
  games: number;
  scored: number;
}

/** The days the chosen league and team have games, earliest first. */
export function gameDays(o: BuilderOptions, s: BuilderState): GameDay[] {
  const days = new Map<string, GameDay>();
  for (const g of inScope(o, s)) {
    if (!isDay(g.date)) continue;
    const day = days.get(g.date) ?? { date: g.date, games: 0, scored: 0 };
    day.games++;
    if (g.homeScore !== null && g.awayScore !== null) day.scored++;
    days.set(g.date, day);
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function onChosenDates(s: BuilderState, date: string): boolean {
  if (s.dateMode === 'all') return true;
  if (s.dateMode === 'day') return date === s.day;
  if (s.dateMode === 'range') return !!s.from && !!s.to && date >= s.from && date <= s.to;
  return s.days.includes(date);
}

/** Games the form can pick from: the chosen league, team and dates. */
export function gamesFor(o: BuilderOptions, s: BuilderState): BuilderGame[] {
  return inScope(o, s).filter((g) => onChosenDates(s, g.date));
}

export function playersFor(o: BuilderOptions, s: BuilderState) {
  const teams = new Set(teamsFor(o, s).map((t) => t.id));
  return o.players.filter((p) =>
    s.teamId ? p.teamIds.includes(s.teamId) : !s.divisionId || p.teamIds.some((id) => teams.has(id)),
  );
}

/** The latest day with a score in the chosen league, else its latest game day. */
export function defaultDay(o: BuilderOptions, s: BuilderState): string {
  const days = gameDays(o, s);
  return (days.findLast((d) => d.scored > 0) ?? days.at(-1))?.date ?? '';
}

/**
 * The state after a change, with choices that no longer fit cleared: a team from another league,
 * a game outside the chosen dates, a player who did not play for the chosen team. Switching to a
 * date choice starts it on the latest game day so the calendar opens where the games are.
 */
export function settle(o: BuilderOptions, s: BuilderState): BuilderState {
  const next = { ...s };
  if (next.divisionId && !o.divisions.some((d) => d.id === next.divisionId)) next.divisionId = '';
  if (next.teamId && !teamsFor(o, next).some((t) => t.id === next.teamId)) next.teamId = '';
  if (next.dateMode === 'day' && !next.day) {
    // A game already chosen keeps its own day; otherwise the latest day with a score.
    const chosen = o.games.find((g) => g.id === next.gameId && isDay(g.date));
    next.day = chosen?.date ?? defaultDay(o, next);
  }
  if (next.dateMode === 'range' && (!next.from || !next.to)) {
    const days = gameDays(o, next);
    next.from = days[0]?.date ?? '';
    next.to = days.at(-1)?.date ?? '';
  }
  if (next.gameId && !gamesFor(o, next).some((g) => g.id === next.gameId)) next.gameId = '';
  if (next.playerId && !playersFor(o, next).some((p) => p.id === next.playerId)) next.playerId = '';
  return next;
}

/**
 * A calendar click. One day: that day. A range: the first click starts a new range on that day,
 * the next click sets its other end (either side). Several days: the day is added or removed.
 */
export function pickDay(s: BuilderState, date: string): BuilderState {
  if (s.dateMode === 'day') return { ...s, day: date };
  if (s.dateMode === 'range') {
    if (!s.from || !s.to || s.from !== s.to) return { ...s, from: date, to: date };
    return date < s.from ? { ...s, from: date } : { ...s, to: date };
  }
  if (s.dateMode === 'dates')
    return { ...s, days: s.days.includes(date) ? s.days.filter((d) => d !== date) : [...s.days, date].sort() };
  return s;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "7:00 pm · Aces 58 - 51 Blues", with the day and league when the list mixes them. */
export function gameLabel(
  o: BuilderOptions,
  g: BuilderGame,
  { withDate, withDivision }: { withDate: boolean; withDivision: boolean },
): string {
  const team = (id: string | null) => o.teams.find((t) => t.id === id)?.name ?? 'TBC';
  let time = '';
  try {
    time = g.startTime ? formatTime(g.startTime) : '';
  } catch {
    time = '';
  }
  const parts = [
    withDate ? (isDay(g.date) ? formatDayLabel(g.date) : 'Date TBC') : '',
    time,
    withDivision ? (o.divisions.find((d) => d.id === g.divisionId)?.name ?? '') : '',
    g.homeScore !== null && g.awayScore !== null
      ? `${team(g.homeTeamId)} ${g.homeScore} - ${g.awayScore} ${team(g.awayTeamId)}`
      : `${team(g.homeTeamId)} vs ${team(g.awayTeamId)} (no score yet)`,
  ];
  return parts.filter(Boolean).join(' · ');
}

/** The Game list's first choice: every game the other choices leave. */
export function allGamesLabel(s: BuilderState, count: number): string {
  if (s.dateMode === 'day')
    return count
      ? `All ${plural(count, 'game')} on ${formatDayLabel(s.day)}`
      : s.day
        ? `No games on ${formatDayLabel(s.day)}`
        : 'Choose a day first';
  if (s.dateMode === 'range')
    return s.from && s.to
      ? `All ${plural(count, 'game')} from ${formatDate(s.from)} to ${formatDate(s.to)}`
      : 'Choose the dates first';
  if (s.dateMode === 'dates')
    return s.days.length ? `All ${plural(count, 'game')} on the chosen days` : 'Choose game days first';
  return `All ${plural(count, 'game')}`;
}

/** "Sat 04/10/2026 · 4 games" and the like, read out under the calendar. */
export function datesSummary(o: BuilderOptions, s: BuilderState): string {
  const count = gamesFor(o, s).length;
  if (s.dateMode === 'day') return s.day ? `${formatDayLabel(s.day)} · ${plural(count, 'game')}` : 'No day chosen';
  if (s.dateMode === 'range')
    return s.from && s.to
      ? `${formatDayLabel(s.from)} to ${formatDayLabel(s.to)} · ${plural(count, 'game')}`
      : 'No dates chosen';
  if (s.dateMode === 'dates')
    return s.days.length ? `${plural(s.days.length, 'day')} · ${plural(count, 'game')}` : 'No days chosen';
  return '';
}

/** The first thing stopping the report, worded for the person filling the form in, or ''. */
export function formProblem(o: BuilderOptions, s: BuilderState): { field: string; message: string } | null {
  const f = TEMPLATE_FIELDS[s.template];
  if (f.teamRequired && !s.teamId) return { field: 'team', message: 'Choose a team for team statistics.' };
  if (f.player && !s.playerId)
    return {
      field: 'player',
      message: playersFor(o, s).length
        ? 'Choose a player for the game log.'
        : o.playersComplete
          ? 'No player has recorded stats in this selection yet.'
          : 'Player stats could not be read for the whole event. Choose a league or team, then Find players.',
    };
  if (s.dateMode === 'day' && !isDay(s.day)) return { field: 'dates', message: 'Choose a day on the calendar.' };
  if (s.dateMode === 'range' && !(isDay(s.from) && isDay(s.to) && s.from <= s.to))
    return { field: 'dates', message: 'Choose the first and last day on the calendar.' };
  if (s.dateMode === 'dates' && !s.days.length)
    return { field: 'dates', message: 'Choose at least one game day on the calendar.' };
  return null;
}

/**
 * The page's reads (PRD Reports): the form's lists cover the whole event, so changing the league
 * never empties the players, and that one mobile read also serves the report. When the whole event
 * cannot be read (over 100 linked games, or no answer), the chosen league, team and dates are read
 * instead, and the player list is marked incomplete so the form can offer to find more players.
 */
export async function readReportSources(
  connect: ReportSource,
  wanted: ReportDefinition,
  enrich: (source: ReportSource, definition: ReportDefinition) => Promise<ReportSource>,
  today = '',
): Promise<{ source: ReportSource; options: BuilderOptions }> {
  const wholeEvent = await enrich(connect, {
    eventId: connect.event.id,
    template: 'box-score',
    dateMode: 'all',
    dates: [],
  });
  const unverified = !!wholeEvent.warnings?.includes(MOBILE_UNVERIFIED);
  const source = unverified ? await enrich(connect, wanted) : wholeEvent;
  return { source, options: builderOptions(connect, [wholeEvent, source], { playersComplete: !unverified, today }) };
}
