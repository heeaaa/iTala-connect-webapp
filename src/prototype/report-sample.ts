import type { ReportEvent, ReportGame, ReportSource } from '@/features/reports/model';

/**
 * SAMPLE DATA for the Reports prototype (/prototype/reports). Not a real event, league, team,
 * player or result. Two Saturdays are played, with player stats as an approved mobile result
 * would carry them, and a third is still to come. One Women game has only its Connect score,
 * and one Open game's official score is two points more than its recorded stats.
 */

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const SAMPLE_REPORT_EVENT = uuid(1);
const OPEN = uuid(11);
const WOMEN = uuid(12);
const T = {
  warriors: uuid(21),
  rangi: uuid(22),
  hawks: uuid(23),
  owls: uuid(24),
  tui: uuid(25),
  kea: uuid(26),
};

const PLAYERS: Record<string, { name: string; team: string }> = {
  'm-maia': { name: 'Māia Te Aroha', team: T.warriors },
  'm-ari': { name: 'Ari Ngata', team: T.warriors },
  'm-sam': { name: 'Sam Tipene', team: T.warriors },
  'm-rua': { name: 'Rua Parata', team: T.rangi },
  'm-hemi': { name: 'Hemi Walker', team: T.rangi },
  'm-tane': { name: 'Tāne Rewi', team: T.rangi },
  'm-bea': { name: 'Bea Cooper', team: T.hawks },
  'm-jo': { name: 'Jo Lee', team: T.hawks },
  'm-alex': { name: 'Alex Moana', team: T.owls },
  'm-kai': { name: 'Kai Brown', team: T.owls },
  'm-aroha': { name: 'Aroha Smith', team: T.tui },
  'm-mere': { name: 'Mere Hohaia', team: T.tui },
  'm-lily': { name: 'Lily Chen', team: T.kea },
  'm-ana': { name: 'Ana Pōtae', team: T.kea },
};

/** Made shots per player: [2PT, 3PT, FT]. `team` is shots recorded without a player. */
type Line = Record<string, [number, number, number]>;

interface Spec {
  n: number;
  division: string;
  date: string;
  time: string;
  home: string;
  away: string;
  lines?: Line;
  /** Connect's score when there are no stats, or when it differs from the recorded total. */
  score?: [number, number];
}

const GAMES: Spec[] = [
  {
    n: 101,
    division: OPEN,
    date: '2026-10-03',
    time: '18:00',
    home: T.warriors,
    away: T.rangi,
    lines: {
      'm-maia': [6, 2, 3],
      'm-ari': [4, 1, 0],
      'm-sam': [2, 0, 2],
      'm-rua': [5, 1, 1],
      'm-hemi': [3, 2, 0],
      'm-tane': [2, 0, 4],
      [`team:${T.rangi}`]: [0, 0, 1],
    },
  },
  {
    n: 102,
    division: OPEN,
    date: '2026-10-03',
    time: '19:00',
    home: T.hawks,
    away: T.owls,
    lines: { 'm-bea': [7, 1, 2], 'm-jo': [3, 3, 0], 'm-alex': [5, 2, 1], 'm-kai': [4, 0, 3] },
  },
  { n: 103, division: WOMEN, date: '2026-10-03', time: '20:00', home: T.tui, away: T.kea, score: [48, 52] },
  {
    n: 104,
    division: OPEN,
    date: '2026-10-10',
    time: '18:00',
    home: T.warriors,
    away: T.hawks,
    lines: { 'm-maia': [5, 3, 2], 'm-ari': [3, 0, 1], 'm-sam': [1, 1, 0], 'm-bea': [6, 0, 4], 'm-jo': [2, 2, 2] },
  },
  {
    n: 105,
    division: OPEN,
    date: '2026-10-10',
    time: '19:00',
    home: T.rangi,
    away: T.owls,
    lines: { 'm-rua': [4, 2, 2], 'm-hemi': [5, 0, 0], 'm-tane': [1, 1, 1], 'm-alex': [6, 1, 3], 'm-kai': [2, 1, 0] },
    // Te Kapa Rangi recorded 32 points; their official score is 34.
    score: [34, 25],
  },
  {
    n: 106,
    division: WOMEN,
    date: '2026-10-10',
    time: '20:00',
    home: T.kea,
    away: T.tui,
    lines: { 'm-lily': [6, 1, 2], 'm-ana': [4, 0, 1], 'm-aroha': [5, 2, 0], 'm-mere': [3, 0, 3] },
  },
  { n: 107, division: OPEN, date: '2026-10-17', time: '18:00', home: T.warriors, away: T.owls },
  { n: 108, division: OPEN, date: '2026-10-17', time: '19:00', home: T.rangi, away: T.hawks },
];

function game(spec: Spec): ReportGame {
  const events: ReportEvent[] = [];
  let next = 0;
  for (const [who, [fg2, fg3, ft]] of Object.entries(spec.lines ?? {})) {
    const teamOnly = who.startsWith('team:');
    const teamId = teamOnly ? who.slice(5) : PLAYERS[who]!.team;
    for (const [type, made] of [
      ['fg2_make', fg2],
      ['fg3_make', fg3],
      ['ft_make', ft],
    ] as const)
      for (let i = 0; i < made; i++)
        events.push({ id: `e${spec.n}-${next++}`, teamId, playerId: teamOnly ? null : who, type });
  }
  const points = (teamId: string) =>
    events
      .filter((e) => e.teamId === teamId)
      .reduce((sum, e) => sum + ({ fg2_make: 2, fg3_make: 3, ft_make: 1 } as Record<string, number>)[e.type]!, 0);
  const stats = !!spec.lines;
  const recorded: [number, number] = [points(spec.home), points(spec.away)];
  const [homeScore, awayScore] = spec.score ?? (stats ? recorded : [null, null]);
  return {
    id: uuid(spec.n),
    divisionId: spec.division,
    date: spec.date,
    startTime: spec.time,
    type: 'group',
    homeTeamId: spec.home,
    awayTeamId: spec.away,
    homeScore,
    awayScore,
    mobileGameId: stats ? `cg_${spec.n}` : null,
    mobileFinal: stats,
    mobileEvents: events,
    manifests: [],
  };
}

export function sampleReportSource(): ReportSource {
  return {
    event: { id: SAMPLE_REPORT_EVENT, name: 'Te Whānau League 2026', timezone: 'Pacific/Auckland' },
    divisions: [
      { id: OPEN, name: 'Open' },
      { id: WOMEN, name: 'Women' },
    ],
    teams: [
      { id: T.warriors, divisionId: OPEN, name: 'Kōwhai Warriors' },
      { id: T.rangi, divisionId: OPEN, name: 'Te Kapa Rangi' },
      { id: T.hawks, divisionId: OPEN, name: 'Harbour Hawks' },
      { id: T.owls, divisionId: OPEN, name: 'Night Owls' },
      { id: T.tui, divisionId: WOMEN, name: 'Tūī' },
      { id: T.kea, divisionId: WOMEN, name: 'Kea' },
    ],
    players: Object.entries(PLAYERS).map(([id, p]) => ({ id, name: p.name })),
    games: GAMES.map(game),
    readAt: '2026-10-17T05:00:00.000Z',
  };
}
