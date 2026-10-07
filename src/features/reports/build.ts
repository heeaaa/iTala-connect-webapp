import { computeStandings } from '@/domain/standings';
import { formatDate, formatDayLabel, formatTime } from '@/lib/format';

import { withoutOptionalStats } from './coverage';
import {
  REPORT_TEMPLATES,
  type ReportDefinition,
  type ReportDocument,
  type ReportEvent,
  type ReportGame,
  type OtherCategory,
  type ReportSource,
  type ReportTable,
  type SideManifest,
} from './model';

/** Scoring categories match iTala mobile and the MIT-licensed iTala-web reference (8385a7a). */
const POINTS: Record<string, number> = { fg2_make: 2, fg3_make: 3, ft_make: 1 };
const OTHER_STATS: { key: OtherCategory; label: string; eventTypes: string[] }[] = [
  { key: 'rebounds', label: 'Rebounds', eventTypes: ['reb', 'oreb', 'dreb'] },
  { key: 'assists', label: 'Assists', eventTypes: ['ast'] },
  { key: 'steals', label: 'Steals', eventTypes: ['stl'] },
  { key: 'blocks', label: 'Blocks', eventTypes: ['blk'] },
  { key: 'fouls', label: 'Fouls', eventTypes: ['pf'] },
];
const MAX_GAMES = 100;
/** Matches reportDocumentSchema, so a saved report always validates. */
const MAX_EXCLUSIONS = 5000;
const isoDay = /^\d{4}-\d{2}-\d{2}$/;

export class ReportInputError extends Error {}

function validDay(day: string): boolean {
  return isoDay.test(day) && !Number.isNaN(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day;
}

function validate(source: ReportSource, d: ReportDefinition): void {
  if (d.eventId !== source.event.id) throw new ReportInputError('Event unavailable');
  if (!REPORT_TEMPLATES.some((t) => t.id === d.template)) throw new ReportInputError('Invalid report template');
  if (d.divisionId && !source.divisions.some((x) => x.id === d.divisionId))
    throw new ReportInputError('Division unavailable');
  if (d.teamId && !source.teams.some((x) => x.id === d.teamId && (!d.divisionId || x.divisionId === d.divisionId)))
    throw new ReportInputError('Team unavailable');
  if (d.playerId && !source.players.some((x) => x.id === d.playerId)) throw new ReportInputError('Player unavailable');
  if (d.template === 'team' && !d.teamId) throw new ReportInputError('Choose a team');
  if (d.template === 'player-log' && !d.playerId) throw new ReportInputError('Choose a player');
  if (!Array.isArray(d.dates) || d.dates.length > 366 || !d.dates.every(validDay))
    throw new ReportInputError('Invalid dates');
  if (
    !['all', 'day', 'range', 'dates'].includes(d.dateMode) ||
    (d.dateMode === 'day' && d.dates.length !== 1) ||
    (d.dateMode === 'range' && (d.dates.length !== 2 || d.dates[0]! > d.dates[1]!)) ||
    (d.dateMode === 'dates' && d.dates.length === 0)
  )
    throw new ReportInputError('Invalid date selection');
  if (d.gameIds && (d.gameIds.length > 1000 || d.gameIds.some((id) => !id || id.length > 200)))
    throw new ReportInputError('Invalid game selection');
  if (d.gameIds?.some((id) => !source.games.some((game) => game.id === id)))
    throw new ReportInputError('Game unavailable');
  if (
    d.gameIds?.some((id) => {
      const game = source.games.find((item) => item.id === id)!;
      return (
        (d.divisionId && game.divisionId !== d.divisionId) ||
        (d.teamId && game.homeTeamId !== d.teamId && game.awayTeamId !== d.teamId)
      );
    })
  )
    throw new ReportInputError('Game does not match the selected league or team');
  if (d.relative && !['latest', 'last-five'].includes(d.relative))
    throw new ReportInputError('Invalid relative selection');
  if (d.standingsScope && !['through-cutoff', 'selected-games'].includes(d.standingsScope))
    throw new ReportInputError('Invalid standings scope');
  for (const value of [d.minAppearances, d.minAttempts]) {
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 0 || value > 1000))
      throw new ReportInputError('Invalid qualification');
  }
  for (const rows of [source.divisions, source.teams, source.players, source.games]) {
    if (new Set(rows.map((x) => x.id)).size !== rows.length) throw new ReportInputError('Duplicate source ID');
  }
  for (const game of source.games) {
    const sides = [game.homeTeamId, game.awayTeamId];
    if (
      new Set(game.mobileEvents.map((event) => event.id)).size !== game.mobileEvents.length ||
      game.mobileEvents.some((event) => !sides.includes(event.teamId)) ||
      new Set(game.manifests.map((item) => item.teamId)).size !== game.manifests.length ||
      game.manifests.some((item) => !sides.includes(item.teamId))
    )
      throw new ReportInputError('Invalid mobile report evidence');
  }
  if (!source.event.timezone) throw new ReportInputError('Event timezone unavailable');
}

function eligibleGame(source: ReportSource, g: ReportGame): string | null {
  if (!validDay(g.date)) return 'Game date unavailable';
  if (!g.homeTeamId || !g.awayTeamId || g.homeTeamId === g.awayTeamId) return 'Teams unavailable';
  const home = source.teams.find((t) => t.id === g.homeTeamId);
  const away = source.teams.find((t) => t.id === g.awayTeamId);
  if (!home || !away || home.divisionId !== g.divisionId || away.divisionId !== g.divisionId)
    return 'Teams do not match division';
  if (g.homeScore === null || g.awayScore === null) return 'Game has no recorded score';
  if (![g.homeScore, g.awayScore].every((v) => Number.isSafeInteger(v) && v! >= 0)) return 'Invalid recorded score';
  return null;
}

function matchesDate(g: ReportGame, d: ReportDefinition): boolean {
  if (d.dateMode === 'all') return true;
  if (d.dateMode === 'range') return g.date >= d.dates[0]! && g.date <= d.dates[1]!;
  return d.dates.includes(g.date);
}

/**
 * The chosen dates and recent games are part of the selection, so games outside them are simply
 * not selected. Only a selected game that cannot be used (no score yet, no teams) is left out,
 * with its reason, so a one-day report of a long season lists nothing it did not choose.
 */
function selectGames(source: ReportSource, d: ReportDefinition) {
  const exclusions: ReportDocument['exclusions'] = [];
  const requestedIds = d.gameIds ? new Set(d.gameIds) : null;
  const selected = source.games.filter(
    (g) =>
      (!d.divisionId || g.divisionId === d.divisionId) &&
      (!d.teamId || g.homeTeamId === d.teamId || g.awayTeamId === d.teamId) &&
      (!requestedIds || requestedIds.has(g.id)) &&
      matchesDate(g, d),
  );
  const eligible = selected.filter((g) => {
    const problem = eligibleGame(source, g);
    if (problem && exclusions.length < MAX_EXCLUSIONS)
      exclusions.push({ gameId: g.id, label: gameName(source, g), reason: problem });
    return !problem;
  });
  eligible.sort(
    (a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id),
  );
  const included = d.relative ? eligible.slice(d.relative === 'latest' ? -1 : -5) : eligible;
  if (included.length > MAX_GAMES) throw new ReportInputError('Select at most 100 games');
  return { selectedCount: selected.length, included, exclusions };
}

function name(source: ReportSource, teamId: string): string {
  return source.teams.find((t) => t.id === teamId)?.name ?? 'Team unavailable';
}
/** "Sat 04/10/2026" for a valid day, else the stored text. */
function dayLabel(day: string): string {
  return validDay(day) ? formatDayLabel(day) : day || 'Date TBC';
}
function timeLabel(time: string): string {
  try {
    return formatTime(time);
  } catch {
    return '';
  }
}
/** "Sat 04/10/2026 · Aces vs Blues": how a person finds a game, never its ID. */
function gameName(source: ReportSource, g: ReportGame): string {
  const side = (teamId: string | null) => (teamId ? name(source, teamId) : 'TBC');
  return `${dayLabel(g.date)} · ${side(g.homeTeamId)} vs ${side(g.awayTeamId)}`;
}
function playerName(source: ReportSource, playerId: string): string {
  return source.players.find((p) => p.id === playerId)?.name ?? 'Player unavailable';
}
function sideScore(g: ReportGame, teamId: string): number {
  return g.homeTeamId === teamId ? g.homeScore! : g.awayScore!;
}
function opponentId(g: ReportGame, teamId: string): string {
  return g.homeTeamId === teamId ? g.awayTeamId! : g.homeTeamId!;
}
function mobileEvents(g: ReportGame, teamId: string): ReportEvent[] {
  if (!g.mobileGameId || !g.mobileFinal) return [];
  return g.mobileEvents.filter((e) => e.teamId === teamId);
}
function manifest(g: ReportGame, teamId: string): SideManifest | null {
  if (!g.mobileGameId || !g.mobileFinal) return null;
  const m = g.manifests.find((x) => x.teamId === teamId);
  if (!m || m.eventCount !== mobileEvents(g, teamId).length) return null;
  return m;
}
function recordedPoints(events: readonly ReportEvent[]): number {
  return events.reduce((sum, e) => sum + (POINTS[e.type] ?? 0), 0);
}
function count(events: readonly ReportEvent[], type: string): number {
  return events.filter((e) => e.type === type).length;
}
function otherCount(events: readonly ReportEvent[], category: OtherCategory): number {
  const types = OTHER_STATS.find((stat) => stat.key === category)!.eventTypes;
  return events.filter((event) => types.includes(event.type)).length;
}
function columns(...cols: [string, string, 'text' | 'number'][]): ReportTable['columns'] {
  return cols.map(([key, label, kind]) => ({ key, label, kind }));
}
function table(title: string, cols: ReportTable['columns'], rows: ReportTable['rows']): ReportTable {
  return { title, columns: cols, rows };
}

interface Stint {
  playerId: string;
  teamId: string;
  points: number;
  fg2: number;
  fg3: number;
  ft: number;
  gamesWithEvents: Set<string>;
}
function playerStints(games: readonly ReportGame[]): Stint[] {
  const stints = new Map<string, Stint>();
  for (const g of games) {
    for (const teamId of [g.homeTeamId!, g.awayTeamId!]) {
      const m = manifest(g, teamId);
      const events = mobileEvents(g, teamId);
      const ids = new Set([...events.flatMap((e) => (e.playerId ? [e.playerId] : [])), ...(m?.playerIds ?? [])]);
      for (const playerId of ids) {
        const key = `${playerId}\0${teamId}`;
        const row = stints.get(key) ?? {
          playerId,
          teamId,
          points: 0,
          fg2: 0,
          fg3: 0,
          ft: 0,
          gamesWithEvents: new Set<string>(),
        };
        const playerEvents = events.filter((e) => e.playerId === playerId);
        row.points += recordedPoints(playerEvents);
        row.fg2 += count(playerEvents, 'fg2_make');
        row.fg3 += count(playerEvents, 'fg3_make');
        row.ft += count(playerEvents, 'ft_make');
        if (playerEvents.length) row.gamesWithEvents.add(g.id);
        stints.set(key, row);
      }
    }
  }
  return [...stints.values()];
}
function appearances(games: readonly ReportGame[], stint: Stint): number | null {
  let n = 0;
  for (const g of games.filter((x) => x.homeTeamId === stint.teamId || x.awayTeamId === stint.teamId)) {
    const m = manifest(g, stint.teamId);
    if (!m || m.appearances !== 'confirmed' || m.scoring !== 'complete') return null;
    if (m.playerIds.includes(stint.playerId)) n++;
  }
  return n;
}
function playerRows(source: ReportSource, games: readonly ReportGame[]): ReportTable['rows'] {
  return playerStints(games)
    .map((s) => {
      const gp = appearances(games, s);
      return {
        playerId: s.playerId,
        player: playerName(source, s.playerId),
        teamId: s.teamId,
        team: name(source, s.teamId),
        points: s.points,
        fg2: s.fg2,
        fg3: s.fg3,
        ft: s.ft,
        appearances: gp,
        ppg: gp && gp > 0 ? Math.round((s.points / gp) * 10) / 10 : null,
      };
    })
    .sort((a, b) => Number(b.points) - Number(a.points) || String(a.playerId).localeCompare(String(b.playerId)));
}
const PLAYER_COLUMNS = columns(
  ['playerId', 'Player ID', 'text'],
  ['player', 'Player', 'text'],
  ['team', 'Team', 'text'],
  ['points', 'Recorded points', 'number'],
  ['fg2', '2PT made', 'number'],
  ['fg3', '3PT made', 'number'],
  ['ft', 'FT made', 'number'],
  ['appearances', 'Confirmed appearances', 'number'],
  ['ppg', 'PPG', 'number'],
);

function teamRows(source: ReportSource, games: readonly ReportGame[]): ReportTable['rows'] {
  const rows: ReportTable['rows'] = [];
  for (const team of source.teams) {
    const played = games.filter((g) => g.homeTeamId === team.id || g.awayTeamId === team.id);
    if (!played.length) continue;
    const pts = played.reduce((n, g) => n + sideScore(g, team.id), 0);
    const against = played.reduce((n, g) => n + sideScore(g, opponentId(g, team.id)), 0);
    const recorded = played.reduce((n, g) => n + recordedPoints(mobileEvents(g, team.id)), 0);
    const verified = played.every((g) => manifest(g, team.id)?.scoring === 'complete');
    rows.push({
      teamId: team.id,
      team: team.name,
      games: played.length,
      pointsFor: pts,
      pointsAgainst: against,
      pointsForPerGame: Math.round((pts / played.length) * 10) / 10,
      pointsAgainstPerGame: Math.round((against / played.length) * 10) / 10,
      recordedPoints: played.some((g) => g.mobileGameId && g.mobileFinal) ? recorded : null,
      unreconciled: verified ? pts - recorded : null,
    });
  }
  return rows.sort((a, b) => String(a.team).localeCompare(String(b.team)));
}
const TEAM_COLUMNS = columns(
  ['teamId', 'Team ID', 'text'],
  ['team', 'Team', 'text'],
  ['games', 'Games', 'number'],
  ['pointsFor', 'Points for', 'number'],
  ['pointsAgainst', 'Points against', 'number'],
  ['pointsForPerGame', 'Points for / game', 'number'],
  ['pointsAgainstPerGame', 'Points against / game', 'number'],
  ['recordedPoints', 'Recorded mobile points', 'number'],
  ['unreconciled', 'Score difference', 'number'],
);

type ShootingRow = {
  playerId: string;
  teamId: string;
  player: string;
  team: string;
  eligibleGames: number;
  makes: number;
  attempts: number;
  percentage: number | null;
};
function shootingRows(
  source: ReportSource,
  games: readonly ReportGame[],
  category: 'fg2' | 'fg3' | 'ft',
  teamId?: string,
): ShootingRow[] {
  const rows = new Map<string, ShootingRow>();
  for (const g of games)
    for (const sideId of [g.homeTeamId!, g.awayTeamId!]) {
      if (teamId && sideId !== teamId) continue;
      const m = manifest(g, sideId);
      if (m?.shots[category] !== 'complete') continue;
      const events = mobileEvents(g, sideId);
      const participants = new Set([
        ...(m.appearances === 'confirmed' ? m.playerIds : []),
        ...events.flatMap((e) => (e.playerId ? [e.playerId] : [])),
      ]);
      for (const id of participants) {
        const key = `${id}\0${sideId}`;
        const row = rows.get(key) ?? {
          playerId: id,
          teamId: sideId,
          player: playerName(source, id),
          team: name(source, sideId),
          eligibleGames: 0,
          makes: 0,
          attempts: 0,
          percentage: null,
        };
        const own = events.filter((e) => e.playerId === id);
        row.eligibleGames++;
        row.makes += count(own, `${category}_make`);
        row.attempts += count(own, `${category}_make`) + count(own, `${category}_miss`);
        rows.set(key, row);
      }
    }
  return [...rows.values()]
    .map((row) => ({ ...row, percentage: row.attempts ? Math.round((row.makes / row.attempts) * 1000) / 10 : null }))
    .sort(
      (a, b) =>
        (b.percentage ?? -1) - (a.percentage ?? -1) || b.attempts - a.attempts || a.playerId.localeCompare(b.playerId),
    );
}
function shootingTables(
  source: ReportSource,
  games: readonly ReportGame[],
  teamId?: string,
  minAttempts = 0,
  leaderboard = false,
): ReportTable[] {
  const labels = { fg2: '2PT', fg3: '3PT', ft: 'FT' } as const;
  return (['fg2', 'fg3', 'ft'] as const).flatMap((category) => {
    const rows = shootingRows(source, games, category, teamId).filter(
      (r) => r.attempts > 0 && r.attempts >= minAttempts,
    );
    if (!rows.length) return [];
    return [
      table(
        `${labels[category]} shooting${leaderboard ? ` · minimum ${minAttempts} attempts` : ''}`,
        columns(
          ['rank', 'Rank', 'number'],
          ['playerId', 'Player ID', 'text'],
          ['player', 'Player', 'text'],
          ['team', 'Team', 'text'],
          ['eligibleGames', 'Eligible games', 'number'],
          ['makes', 'Makes', 'number'],
          ['attempts', 'Attempts', 'number'],
          ['percentage', 'Percent', 'number'],
        ),
        rows.map((row, i) => ({
          ...row,
          rank: leaderboard ? rows.findIndex((r) => r.percentage === row.percentage) + 1 : i + 1,
        })),
      ),
    ];
  });
}

function turnoverTable(source: ReportSource, games: readonly ReportGame[], teamId?: string): ReportTable | null {
  const rows = new Map<
    string,
    { playerId: string; player: string; team: string; eligibleGames: number; turnovers: number }
  >();
  let anyEligible = false;
  for (const g of games)
    for (const sideId of [g.homeTeamId!, g.awayTeamId!]) {
      if (teamId && sideId !== teamId) continue;
      const m = manifest(g, sideId);
      if (m?.turnovers !== 'complete') continue;
      anyEligible = true;
      const events = mobileEvents(g, sideId);
      const participants = new Set([
        ...(m.appearances === 'confirmed' ? m.playerIds : []),
        ...events.flatMap((e) => (e.playerId ? [e.playerId] : [])),
      ]);
      for (const id of participants) {
        const key = `${id}\0${sideId}`;
        const row = rows.get(key) ?? {
          playerId: id,
          player: playerName(source, id),
          team: name(source, sideId),
          eligibleGames: 0,
          turnovers: 0,
        };
        row.eligibleGames++;
        row.turnovers += count(
          events.filter((e) => e.playerId === id),
          'tov',
        );
        rows.set(key, row);
      }
    }
  if (!anyEligible) return null;
  return table(
    'Turnovers · complete tracking only',
    columns(
      ['playerId', 'Player ID', 'text'],
      ['player', 'Player', 'text'],
      ['team', 'Team', 'text'],
      ['eligibleGames', 'Eligible games', 'number'],
      ['turnovers', 'Turnovers', 'number'],
    ),
    [...rows.values()].sort((a, b) => b.turnovers - a.turnovers || a.playerId.localeCompare(b.playerId)),
  );
}

function otherTables(
  source: ReportSource,
  games: readonly ReportGame[],
  teamId?: string,
  leaderboard = false,
): ReportTable[] {
  return OTHER_STATS.flatMap(({ key, label }) => {
    const eligible = games.flatMap((game) =>
      [game.homeTeamId!, game.awayTeamId!]
        .filter((sideId) => (!teamId || sideId === teamId) && manifest(game, sideId)?.other?.[key] === 'complete')
        .map((sideId) => ({ game, sideId })),
    );
    if (!eligible.length) return [];
    const rows = new Map<
      string,
      { playerId: string; player: string; teamId: string; team: string; total: number; eligibleGames: number }
    >();
    for (const { game, sideId } of eligible) {
      const events = mobileEvents(game, sideId);
      const side = manifest(game, sideId)!;
      const players = new Set([
        ...(side.appearances === 'confirmed' ? side.playerIds : []),
        ...events.flatMap((event) => (event.playerId ? [event.playerId] : [])),
      ]);
      for (const playerId of players) {
        const id = `${playerId}\0${sideId}`;
        const row = rows.get(id) ?? {
          playerId,
          player: playerName(source, playerId),
          teamId: sideId,
          team: name(source, sideId),
          total: 0,
          eligibleGames: 0,
        };
        row.total += otherCount(
          events.filter((event) => event.playerId === playerId),
          key,
        );
        row.eligibleGames++;
        rows.set(id, row);
      }
    }
    const ranked = [...rows.values()]
      .map((row) => {
        const teamGames = eligible.filter((item) => item.sideId === row.teamId);
        const confirmed = teamGames.every((item) => manifest(item.game, row.teamId)?.appearances === 'confirmed');
        const appearances = confirmed
          ? teamGames.filter((item) => manifest(item.game, row.teamId)!.playerIds.includes(row.playerId)).length
          : null;
        return {
          ...row,
          appearances,
          perGame: appearances ? Math.round((row.total / appearances) * 10) / 10 : null,
        };
      })
      .sort((a, b) => b.total - a.total || a.playerId.localeCompare(b.playerId));
    return [
      table(
        `${label}${leaderboard ? ' leaders' : ''} · complete tracking only`,
        columns(
          ['rank', 'Rank', 'number'],
          ['playerId', 'Player ID', 'text'],
          ['player', 'Player', 'text'],
          ['team', 'Team', 'text'],
          ['eligibleGames', 'Eligible games', 'number'],
          ['total', label, 'number'],
          ['appearances', 'Confirmed appearances', 'number'],
          ['perGame', 'Per game', 'number'],
        ),
        ranked.map((row, index) => ({
          ...row,
          rank: leaderboard ? ranked.findIndex((item) => item.total === row.total) + 1 : index + 1,
        })),
      ),
    ];
  });
}

function resultsRows(source: ReportSource, games: readonly ReportGame[]) {
  return games.map((g) => ({
    gameId: g.id,
    date: g.date,
    division: source.divisions.find((d) => d.id === g.divisionId)?.name ?? '',
    home: name(source, g.homeTeamId!),
    homeScore: g.homeScore,
    awayScore: g.awayScore,
    away: name(source, g.awayTeamId!),
  }));
}
const RESULT_COLUMNS = columns(
  ['gameId', 'Game ID', 'text'],
  ['date', 'Date', 'text'],
  ['division', 'Division', 'text'],
  ['home', 'Home', 'text'],
  ['homeScore', 'Home score', 'number'],
  ['awayScore', 'Away score', 'number'],
  ['away', 'Away', 'text'],
);

/** Line names in a box score: the Entry column (kept for downloads) and the Player column say the same. */
const LINE = {
  player: 'Player',
  team: 'Team (no player)',
  total: 'Team total',
  final: 'Final score',
} as const;

/** Each player's totals over the games of a box score book, most points first. */
/** A stat with its own tracking coverage, shown as a column where a game tracked it. */
interface ExtraStat {
  key: string;
  label: string;
  eventTypes: string[];
  covered: (m: SideManifest) => boolean;
}
const EXTRA_STATS: ExtraStat[] = [
  ...OTHER_STATS.map(({ key, label, eventTypes }) => ({
    key,
    label,
    eventTypes,
    covered: (m: SideManifest) => m.other?.[key] === 'complete',
  })),
  { key: 'turnovers', label: 'Turnovers', eventTypes: ['tov'], covered: (m) => m.turnovers === 'complete' },
];
const SHOTS = [
  { key: 'fg2', label: '2PT' },
  { key: 'fg3', label: '3PT' },
  { key: 'ft', label: 'FT' },
] as const;
function extraCount(events: readonly ReportEvent[], stat: ExtraStat): number {
  return events.filter((event) => stat.eventTypes.includes(event.type)).length;
}

/**
 * Every player's line over the chosen games, like a box score: team first (rows sorted by team,
 * then most points), points and made shots, then a column for each other stat that some game
 * tracked: attempts and percentage where misses were tracked, then rebounds, assists, steals,
 * blocks, fouls and turnovers. A player's value counts only the games that tracked it, and is
 * blank when none of theirs did. `games` adds "Games with stats"; `appearances` adds confirmed
 * appearances and points per game.
 */
function playerStatsTable(
  source: ReportSource,
  games: readonly ReportGame[],
  title: string,
  { teamId, show }: { teamId?: string; show: 'games' | 'appearances' },
): ReportTable {
  const sides = games.flatMap((g) =>
    [g.homeTeamId!, g.awayTeamId!]
      .filter((side) => !teamId || side === teamId)
      .map((side) => ({ g, teamId: side, m: manifest(g, side) })),
  );
  const extras = EXTRA_STATS.filter((stat) => sides.some((side) => side.m && stat.covered(side.m)));
  const shots = SHOTS.filter(({ key }) => sides.some((side) => side.m?.shots[key] === 'complete'));
  const rows = playerStints(games)
    .filter((s) => !teamId || s.teamId === teamId)
    .map((s) => {
      const own = (g: ReportGame) => mobileEvents(g, s.teamId).filter((e) => e.playerId === s.playerId);
      const played = sides.filter(
        (side) => side.teamId === s.teamId && (own(side.g).length > 0 || !!side.m?.playerIds.includes(s.playerId)),
      );
      const shotCells = shots.flatMap(({ key }) => {
        const covered = played.filter((side) => side.m?.shots[key] === 'complete');
        if (!covered.length)
          return [
            [`${key}Att`, null],
            [`${key}Pct`, null],
          ];
        const made = covered.reduce((n, side) => n + count(own(side.g), `${key}_make`), 0);
        const attempts = made + covered.reduce((n, side) => n + count(own(side.g), `${key}_miss`), 0);
        return [
          [`${key}Att`, attempts],
          [`${key}Pct`, attempts ? Math.round((made / attempts) * 1000) / 10 : null],
        ];
      });
      const extraCells = extras.map((stat) => {
        const covered = played.filter((side) => side.m && stat.covered(side.m));
        return [stat.key, covered.length ? covered.reduce((n, side) => n + extraCount(own(side.g), stat), 0) : null];
      });
      const gp = appearances(games, s);
      return {
        teamId: s.teamId,
        team: name(source, s.teamId),
        playerId: s.playerId,
        player: playerName(source, s.playerId),
        games: s.gamesWithEvents.size,
        points: s.points,
        fg2: s.fg2,
        fg3: s.fg3,
        ft: s.ft,
        ...Object.fromEntries(shotCells),
        ...Object.fromEntries(extraCells),
        appearances: gp,
        ppg: gp && gp > 0 ? Math.round((s.points / gp) * 10) / 10 : null,
      };
    })
    .sort(
      (a, b) =>
        a.team.localeCompare(b.team) ||
        b.points - a.points ||
        a.player.localeCompare(b.player) ||
        a.playerId.localeCompare(b.playerId),
    );
  return table(
    title,
    columns(
      ['team', 'Team', 'text'],
      ['teamId', 'Team ID', 'text'],
      ['playerId', 'Player ID', 'text'],
      ['player', 'Player', 'text'],
      ...(show === 'games' ? [['games', 'Games with stats', 'number'] as [string, string, 'number']] : []),
      ['points', 'Points', 'number'],
      ['fg2', '2PT made', 'number'],
      ['fg3', '3PT made', 'number'],
      ['ft', 'FT made', 'number'],
      ...shots.flatMap(({ key, label }) => [
        [`${key}Att`, `${label} attempts`, 'number'] as [string, string, 'number'],
        [`${key}Pct`, `${label} %`, 'number'] as [string, string, 'number'],
      ]),
      ...extras.map((stat) => [stat.key, stat.label, 'number'] as [string, string, 'number']),
      ...(show === 'appearances'
        ? [
            ['appearances', 'Confirmed appearances', 'number'] as [string, string, 'number'],
            ['ppg', 'PPG', 'number'] as [string, string, 'number'],
          ]
        : []),
    ),
    rows,
  );
}

/**
 * One box score per game: for each team, every player's stat line (most points first), points
 * recorded without a player, and the team total. Connect's score stays the official result in
 * the title; when the recorded total differs, the final score follows the total. A game with no
 * approved mobile stats shows each side's final score only.
 */
function boxScore(source: ReportSource, games: readonly ReportGame[]): ReportTable[] {
  const out: ReportTable[] = [];
  if (games.length > 1 && games.some((g) => g.mobileGameId && g.mobileFinal))
    out.push(playerStatsTable(source, games, `Player totals · ${games.length} games`, { show: 'games' }));
  for (const g of games) {
    const categories = EXTRA_STATS.filter((stat) =>
      [g.homeTeamId!, g.awayTeamId!].some((teamId) => {
        const m = manifest(g, teamId);
        return !!m && stat.covered(m);
      }),
    );
    const time = timeLabel(g.startTime);
    const division = source.divisions.find((d) => d.id === g.divisionId)?.name ?? 'Division';
    out.push(
      table(
        `${dayLabel(g.date)}${time ? ` · ${time}` : ''} · ${division}: ${name(source, g.homeTeamId!)} ${g.homeScore} - ${g.awayScore} ${name(source, g.awayTeamId!)}`,
        columns(
          ['gameId', 'Game ID', 'text'],
          ['teamId', 'Team ID', 'text'],
          ['team', 'Team', 'text'],
          ['entry', 'Entry', 'text'],
          ['playerId', 'Player ID', 'text'],
          ['player', 'Player', 'text'],
          ['points', 'Points', 'number'],
          ['fg2', '2PT made', 'number'],
          ['fg3', '3PT made', 'number'],
          ['ft', 'FT made', 'number'],
          ...categories.map(({ key, label }) => [key, label, 'number'] as [string, string, 'number']),
        ),
        [g.homeTeamId!, g.awayTeamId!].flatMap((teamId) => {
          const side = { gameId: g.id, teamId, team: name(source, teamId) };
          const official = sideScore(g, teamId);
          const finalLine = {
            ...side,
            entry: LINE.final,
            playerId: '',
            player: LINE.final,
            points: official,
            fg2: null,
            fg3: null,
            ft: null,
            ...Object.fromEntries(categories.map(({ key }) => [key, null])),
          };
          if (!g.mobileGameId || !g.mobileFinal) return [finalLine];
          const events = mobileEvents(g, teamId);
          const m = manifest(g, teamId);
          const stats = (own: readonly ReportEvent[]) => ({
            points: recordedPoints(own),
            fg2: count(own, 'fg2_make'),
            fg3: count(own, 'fg3_make'),
            ft: count(own, 'ft_make'),
            ...Object.fromEntries(
              categories.map((stat) => [stat.key, m && stat.covered(m) ? extraCount(own, stat) : null]),
            ),
          });
          const ids = new Set([...events.flatMap((e) => (e.playerId ? [e.playerId] : [])), ...(m?.playerIds ?? [])]);
          const players = [...ids]
            .map((id) => ({
              ...side,
              entry: LINE.player,
              playerId: id,
              player: playerName(source, id),
              ...stats(events.filter((e) => e.playerId === id)),
            }))
            .sort(
              (a, b) => b.points - a.points || a.player.localeCompare(b.player) || a.playerId.localeCompare(b.playerId),
            );
          const teamOnly = stats(events.filter((e) => !e.playerId));
          const teamLine = Object.values(teamOnly).some((value) => typeof value === 'number' && value > 0)
            ? [{ ...side, entry: LINE.team, playerId: '', player: LINE.team, ...teamOnly }]
            : [];
          const total = { ...side, entry: LINE.total, playerId: '', player: LINE.total, ...stats(events) };
          const gap = official - total.points;
          const officialLine = {
            ...finalLine,
            player: `${LINE.final} (${gap > 0 ? `${gap} not in player stats` : `${-gap} more in player stats`})`,
          };
          return [...players, ...teamLine, total, ...(gap === 0 ? [] : [officialLine])];
        }),
      ),
    );
  }
  return out;
}

function standings(source: ReportSource, games: readonly ReportGame[], d: ReportDefinition): ReportTable[] {
  const cutoff = games.at(-1)?.date;
  const scope =
    d.standingsScope === 'selected-games'
      ? games
      : source.games.filter(
          (g) =>
            (!d.divisionId || g.divisionId === d.divisionId) && cutoff && g.date <= cutoff && !eligibleGame(source, g),
        );
  return source.divisions
    .filter((division) => !d.divisionId || division.id === d.divisionId)
    .map((division) => {
      const ids = source.teams.filter((t) => t.divisionId === division.id).map((t) => t.id);
      const rows = computeStandings(
        ids,
        scope.map((g) => ({
          divisionId: g.divisionId,
          type: g.type === 'group' ? ('group' as const) : ('final' as const),
          team1Id: g.homeTeamId,
          team2Id: g.awayTeamId,
          score1: g.homeScore,
          score2: g.awayScore,
        })),
        division.id,
      ).map((row, i) => ({
        rank: i + 1,
        teamId: row.teamId,
        team: name(source, row.teamId),
        gp: row.gp,
        wins: row.w,
        losses: row.l,
        pf: row.pf,
        pa: row.pa,
        diff: row.diff,
      }));
      return table(
        `${division.name} standings`,
        columns(
          ['rank', 'Rank', 'number'],
          ['teamId', 'Team ID', 'text'],
          ['team', 'Team', 'text'],
          ['gp', 'GP', 'number'],
          ['wins', 'W', 'number'],
          ['losses', 'L', 'number'],
          ['pf', 'PF', 'number'],
          ['pa', 'PA', 'number'],
          ['diff', '+/-', 'number'],
        ),
        rows,
      );
    });
}

function leaderboards(source: ReportSource, games: readonly ReportGame[], d: ReportDefinition): ReportTable[] {
  const rows = playerRows(source, games);
  const min = d.minAppearances ?? 0;
  const qualified = rows.filter((r) => min === 0 || (typeof r.appearances === 'number' && r.appearances >= min));
  const points = [
    table(
      'Recorded points leaders',
      columns(
        ['rank', 'Rank', 'number'],
        ...PLAYER_COLUMNS.map((c) => [c.key, c.label, c.kind] as [string, string, 'text' | 'number']),
      ),
      qualified.map((r, i) => ({
        rank:
          i > 0 && r.points === qualified[i - 1]!.points
            ? qualified.findIndex((x) => x.points === r.points) + 1
            : i + 1,
        ...r,
      })),
    ),
  ];
  const byAverage = qualified
    .filter((row) => typeof row.ppg === 'number')
    .sort((a, b) => Number(b.ppg) - Number(a.ppg) || Number(b.points) - Number(a.points));
  if (byAverage.length)
    points.push(
      table(
        'Points per game leaders · confirmed appearances only',
        columns(
          ['rank', 'Rank', 'number'],
          ...PLAYER_COLUMNS.map(
            (column) => [column.key, column.label, column.kind] as [string, string, 'text' | 'number'],
          ),
        ),
        byAverage.map((row) => ({
          rank: byAverage.findIndex((item) => item.ppg === row.ppg) + 1,
          ...row,
        })),
      ),
    );
  const turnovers = turnoverTable(source, games, d.teamId);
  return [
    ...points,
    ...shootingTables(source, games, d.teamId, d.minAttempts ?? 0, true),
    ...(turnovers ? [turnovers] : []),
    ...otherTables(source, games, d.teamId, true),
  ];
}

function playerLog(source: ReportSource, games: readonly ReportGame[], playerId: string): ReportTable[] {
  const rows: ReportTable['rows'] = [];
  const categories = EXTRA_STATS.filter((stat) =>
    games.some((game) =>
      [game.homeTeamId!, game.awayTeamId!].some((teamId) => {
        const m = manifest(game, teamId);
        return !!m && stat.covered(m);
      }),
    ),
  );
  for (const g of games) {
    for (const teamId of [g.homeTeamId!, g.awayTeamId!]) {
      const events = mobileEvents(g, teamId).filter((e) => e.playerId === playerId);
      const m = manifest(g, teamId);
      if (!events.length && !m?.playerIds.includes(playerId)) continue;
      const ownScore = sideScore(g, teamId);
      const opponentScore = sideScore(g, opponentId(g, teamId));
      rows.push({
        gameId: g.id,
        date: g.date,
        team: name(source, teamId),
        opponent: name(source, opponentId(g, teamId)),
        teamScore: ownScore,
        opponentScore,
        result: ownScore > opponentScore ? 'Win' : ownScore < opponentScore ? 'Loss' : 'Tie',
        appearance: m?.appearances === 'confirmed' ? 'Confirmed' : 'Unknown',
        points: recordedPoints(events),
        fg2: count(events, 'fg2_make'),
        fg3: count(events, 'fg3_make'),
        ft: count(events, 'ft_make'),
        ...Object.fromEntries(
          categories.map((stat) => [stat.key, m && stat.covered(m) ? extraCount(events, stat) : null]),
        ),
      });
    }
  }
  return [
    table(
      `${playerName(source, playerId)} game log`,
      columns(
        ['gameId', 'Game ID', 'text'],
        ['date', 'Date', 'text'],
        ['team', 'Team', 'text'],
        ['opponent', 'Opponent', 'text'],
        ['teamScore', 'Score', 'number'],
        ['opponentScore', 'Opponent score', 'number'],
        ['result', 'Result', 'text'],
        ['appearance', 'Appearance', 'text'],
        ['points', 'Recorded points', 'number'],
        ['fg2', '2PT made', 'number'],
        ['fg3', '3PT made', 'number'],
        ['ft', 'FT made', 'number'],
        ...categories.map(({ key, label }) => [key, label, 'number'] as [string, string, 'number']),
      ),
      rows,
    ),
    table(
      `${playerName(source, playerId)} summary by team`,
      PLAYER_COLUMNS,
      playerRows(source, games).filter((row) => row.playerId === playerId),
    ),
  ];
}

export function buildReport(input: ReportSource, d: ReportDefinition, generatedAt: string): ReportDocument {
  validate(input, d);
  // Unless "Show all player stats" is ticked, only points, made shots and appearances are reported.
  const source: ReportSource = d.allStats
    ? input
    : { ...input, games: input.games.map((g) => ({ ...g, manifests: withoutOptionalStats(g.manifests) })) };
  const { selectedCount, included, exclusions } = selectGames(source, d);
  const title = REPORT_TEMPLATES.find((t) => t.id === d.template)!.label;
  const notes = [
    `Dates use ${source.event.timezone}.`,
    'Scores come from Connect; player statistics require an approved linked mobile game.',
    'Unknown tracking and participation are not treated as zero.',
  ];
  let tables: ReportTable[];
  switch (d.template) {
    case 'box-score':
      tables = boxScore(source, included);
      notes.push(
        'Team total adds up the recorded stats. When it differs from the official score, the final score follows it.',
      );
      break;
    case 'league':
      tables = [
        table('Teams', TEAM_COLUMNS, teamRows(source, included)),
        playerStatsTable(source, included, 'Players', { show: 'appearances' }),
      ];
      break;
    case 'team':
      tables = [
        table(
          'Team summary',
          TEAM_COLUMNS,
          teamRows(source, included).filter((r) => r.teamId === d.teamId),
        ),
        playerStatsTable(source, included, 'Players', { teamId: d.teamId, show: 'appearances' }),
        table('Results', RESULT_COLUMNS, resultsRows(source, included)),
      ];
      break;
    case 'results':
      tables = [table('Results', RESULT_COLUMNS, resultsRows(source, included)), ...standings(source, included, d)];
      notes.push(
        d.standingsScope === 'selected-games'
          ? 'Selected-games standings.'
          : `Standings include all scored group games through ${included.length ? formatDate(included.at(-1)!.date) : 'the selected cutoff'} using wins, point difference and points for.`,
      );
      break;
    case 'leaders':
      tables = leaderboards(source, included, d);
      notes.push(`Minimum confirmed appearances: ${d.minAppearances ?? 0}.`);
      notes.push(`Minimum shot attempts: ${d.minAttempts ?? 0}; percentages use complete-coverage games only.`);
      break;
    case 'player-log':
      tables = playerLog(source, included, d.playerId!);
      notes.push('Games without explicit player evidence are omitted; omission does not mean did not play.');
      break;
  }
  if (d.allStats)
    notes.push(
      'All player stats: rebounds, assists, steals, blocks and fouls for games recorded in the mobile app; shooting and turnovers only where the game stored that it tracked them.',
    );
  if (!included.length) notes.push('No eligible games match this selection.');
  if (source.warnings?.length) notes.push(...source.warnings);
  if (included.some((g) => !g.mobileGameId || !g.mobileFinal))
    notes.push('Some games have no approved final mobile source; player tables are incomplete.');
  if (included.some((g) => g.mobileFinal && g.manifests.length === 0))
    notes.push('Mobile events are recorded, but tracking coverage and appearances are unconfirmed.');
  if (included.length && d.template !== 'results') {
    const sides = included
      .flatMap((game) => [game.homeTeamId!, game.awayTeamId!].map((teamId) => ({ game, teamId })))
      .filter(({ teamId }) => d.template !== 'team' || teamId === d.teamId);
    for (const [label, covered] of [
      ['2PT attempts', (item: (typeof sides)[number]) => manifest(item.game, item.teamId)?.shots.fg2 === 'complete'],
      ['3PT attempts', (item: (typeof sides)[number]) => manifest(item.game, item.teamId)?.shots.fg3 === 'complete'],
      ['FT attempts', (item: (typeof sides)[number]) => manifest(item.game, item.teamId)?.shots.ft === 'complete'],
      ['Turnovers', (item: (typeof sides)[number]) => manifest(item.game, item.teamId)?.turnovers === 'complete'],
      ...OTHER_STATS.map(
        ({ key, label }) =>
          [
            label,
            (item: (typeof sides)[number]) => manifest(item.game, item.teamId)?.other?.[key] === 'complete',
          ] as const,
      ),
    ] as const) {
      const count = sides.filter(covered).length;
      if (count) notes.push(`${label}: ${count} of ${sides.length} team sides have complete coverage.`);
    }
  }
  return {
    version: 1,
    template: d.template,
    title,
    eventId: source.event.id,
    eventName: source.event.name,
    timezone: source.event.timezone,
    generatedAt,
    sourceReadAt: source.readAt,
    selectedCount,
    includedCount: included.length,
    gameIds: included.map((g) => g.id),
    exclusions,
    notes,
    tables,
  };
}
