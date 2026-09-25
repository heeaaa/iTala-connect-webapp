import { type Clock, toMinutes } from '@/domain/game-day';
import { DEFAULT_EVENT_THEME, type EventTheme } from '@/components/event/theme';
import { type TodayDivision, type TodayEvent, type TodayGame, type TodayTeam } from '@/components/event/today/model';

/**
 * SAMPLE DATA for the Today screen prototype (/prototype/today). Not a real
 * event, league, team or result. Scores for the prototype's game day are
 * derived from the chosen clock so every game-day state can be shown.
 */

export const SAMPLE_DAYS = ['2026-09-11', '2026-09-18', '2026-09-25', '2026-10-02', '2026-10-09'];
export const SAMPLE_GAME_DAY = '2026-09-25';
const SLOTS = ['18:00', '19:00', '20:00', '21:00'];

/** A second organiser palette, to show the page follows any event colours. */
export const LIGHT_ORGANISER_THEME: EventTheme = {
  primary: '#C8102E',
  bg: '#FFFFFF',
  text: '#1A1A1A',
  textSecondary: '#5C5C5C',
  heading: '#0B2545',
};

const DIVISIONS: (TodayDivision & { teams: string[] })[] = [
  {
    id: 'open',
    name: "Men's Open",
    color: '#E06040',
    teams: ['Harbour Hawks', 'Kits Ravens', 'Burnaby Bolts', 'Main St Mambas'],
  },
  {
    id: 'coed',
    name: 'Co-ed',
    color: '#3BACDF',
    teams: ['Commercial Drive Owls', 'Fraser Lynx', 'Granville Gulls', 'Trout Lake Otters'],
  },
  {
    id: 'women',
    name: "Women's",
    color: '#2BBF8A',
    teams: ['Cedar Cove Comets', 'Kerrisdale Kites', 'Dunbar Dragons', 'Hastings Herons'],
  },
  {
    id: 'masters',
    name: 'Masters 35+',
    color: '#D4A017',
    teams: ['Point Grey Pilots', 'Riley Park Rams', 'Strathcona Stags', 'Oakridge Orcas'],
  },
];

/** Circle-method rounds for four teams. */
const ROUNDS: [number, number][][] = [
  [
    [0, 1],
    [2, 3],
  ],
  [
    [0, 2],
    [1, 3],
  ],
  [
    [0, 3],
    [1, 2],
  ],
];

/** Stable pseudo-random full-time score from a game id. */
function fullScore(id: string): [number, number] {
  let h = 2166136261;
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return [38 + (h % 37), 38 + ((h >>> 8) % 37)];
}

export interface SampleOptions {
  /** 2 or 4 courts (4 adds two more divisions). */
  courts: 2 | 4;
  clock: Clock;
  theme?: EventTheme;
}

export function sampleLeague({ courts, clock, theme = DEFAULT_EVENT_THEME }: SampleOptions): TodayEvent {
  const divisions = DIVISIONS.slice(0, courts);
  const teams: TodayTeam[] = divisions.flatMap((d) =>
    d.teams.map((name, i) => ({ id: `${d.id}-${i}`, name, divisionId: d.id })),
  );
  const games: TodayGame[] = [];

  SAMPLE_DAYS.forEach((day, dayIndex) => {
    const playoffs = dayIndex === SAMPLE_DAYS.length - 1;
    divisions.forEach((d, divIndex) => {
      // Divisions share a pair of courts and alternate slots, so every
      // team rests 120 minutes between its two games (PRD 12.3).
      const firstCourt = Math.floor(divIndex / 2) * 2 + 1;
      const offset = divIndex % 2;
      if (playoffs) {
        games.push(
          game(`${day}-${d.id}-s1`, day, SLOTS[offset]!, firstCourt, null, null, d, `${d.name} - Semi 1`, 'semi'),
          game(`${day}-${d.id}-s2`, day, SLOTS[offset]!, firstCourt + 1, null, null, d, `${d.name} - Semi 2`, 'semi'),
          game(`${day}-${d.id}-f`, day, SLOTS[offset + 2]!, firstCourt, null, null, d, `${d.name} - Finals`, 'final'),
        );
        return;
      }
      // Two rounds a night.
      [0, 1].forEach((r) => {
        const round = ROUNDS[(dayIndex * 2 + r) % ROUNDS.length]!;
        round.forEach(([a, b], i) => {
          const slot = SLOTS[r * 2 + offset]!;
          games.push(
            game(
              `${day}-${d.id}-${r}-${i}`,
              day,
              slot,
              firstCourt + i,
              `${d.id}-${a}`,
              `${d.id}-${b}`,
              d,
              `${d.name} - Group A`,
              'group',
            ),
          );
        });
      });
    });
  });

  return {
    id: 'sample-eastside-friday',
    name: 'Eastside Friday League',
    days: SAMPLE_DAYS,
    courtNames: ['Court 1', 'Court 2', 'Court 3', 'Court 4'].slice(0, courts),
    timeZone: 'America/Vancouver',
    theme,
    divisions: divisions.map(({ id, name, color }) => ({ id, name, color })),
    teams,
    games: games.map((g) => withScores(g, clock)),
  };
}

function game(
  id: string,
  day: string,
  time: string,
  court: number,
  team1Id: string | null,
  team2Id: string | null,
  d: TodayDivision,
  label: string,
  type: TodayGame['type'],
): TodayGame {
  return { id, day, time, court, team1Id, team2Id, score1: null, score2: null, divisionId: d.id, label, type };
}

/**
 * Past nights are fully scored. On the game day: finished slots are scored,
 * except Court 2's first game, which shows "Awaiting score"; the game on
 * court has a running score; later games have none. Playoffs stay TBD.
 */
function withScores(g: TodayGame, clock: Clock): TodayGame {
  if (g.team1Id === null || g.day === null || g.time === null) return g;
  const [s1, s2] = fullScore(g.id);
  if (g.day < clock.date) return { ...g, score1: s1, score2: s2 };
  if (g.day > clock.date) return g;
  const start = toMinutes(g.time);
  const elapsed = clock.minutes - start;
  if (elapsed < 0) return g;
  if (elapsed >= 60) {
    return g.court === 2 && g.time === SLOTS[0] ? g : { ...g, score1: s1, score2: s2 };
  }
  const share = elapsed / 60;
  return { ...g, score1: Math.round(s1 * share), score2: Math.round(s2 * share) };
}

const FIRST = ['Ari', 'Bea', 'Cam', 'Dev', 'Eli', 'Fin', 'Gus', 'Hana', 'Isla', 'Jo'];

/** SAMPLE roster: 5 to 8 invented players per team, numbered like jerseys. */
export function sampleRoster(teamId: string, index: number) {
  const count = 5 + (index % 4);
  return Array.from({ length: count }, (_, i) => ({
    id: `${teamId}-p${i}`,
    name: `${FIRST[(index + i) % FIRST.length]} Sample`,
    number: String(((index * 7 + i * 3) % 30) + 1),
  }));
}

/** SAMPLE rules in the old toolbar's formatting (sanitised before render). */
export const SAMPLE_RULES_HTML =
  '<h2>Game time</h2><p>Four <strong>10-minute</strong> quarters, running clock except the last two minutes of the fourth.</p>' +
  '<h3>Fouls</h3><ul><li>Five personal fouls and you are out.</li><li>Team bonus from the fifth team foul each half.</li></ul>' +
  '<h3>Ties</h3><ol><li>A tied group game stays level.</li><li>Playoff games go to a two-minute overtime.</li></ol>';
