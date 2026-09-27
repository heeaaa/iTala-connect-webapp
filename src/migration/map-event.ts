import { sanitizeRulesHtml } from '@/lib/rules-html';

import { child, entries, isRecord, pushIdTime, text, values } from './firebase-tree';

/**
 * One old Firebase event mapped to iTala Connect rows (MIGRATION_PLAN.md
 * 12.1, steps 2 and 3). Pure: nothing here reads or writes anything. Rows
 * refer to each other by their legacy keys; the writer turns those into ids.
 * Everything unusual is reported rather than failing or silently dropped.
 */

export type IssueLevel = 'info' | 'warning' | 'error';
export interface Issue {
  level: IssueLevel;
  code: string;
  message: string;
}

export type ImageSource = { kind: 'url'; url: string } | { kind: 'data'; mime: string; bytes: number; dataUri: string };

export type PlayoffSourceJson = { type: 'seed'; rank: number } | { type: 'winner'; bracketGameId: string };
export interface TeamRef {
  divisionKey: string;
  code: string;
}

export interface GamePlan {
  legacy_gid: string;
  legacy_index: number;
  legacy_team1: string | null;
  legacy_team2: string | null;
  division_key: string | null;
  day: string | null;
  start_time: string | null;
  court: number | null;
  group_id: string | null;
  team1: TeamRef | null;
  team2: TeamRef | null;
  label: string;
  type: 'group' | 'semi' | 'final';
  is_playoff: boolean;
  bracket_game_id: string | null;
  team1_source: PlayoffSourceJson | null;
  team2_source: PlayoffSourceJson | null;
  playoff_round: number | null;
  position: number;
  score: { s1: number | null; s2: number | null } | null;
  source: SourcePlan | null;
}

export interface SourcePlan {
  mobile_game_id: string | null;
  league_id: string | null;
  s1: number | null;
  s2: number | null;
  home_pts: number | null;
  away_pts: number | null;
  event_count: number | null;
  last_event_at: string | null;
  finished_at: string | null;
  approved_by_legacy: string | null;
  approved_at: string | null;
  method: string | null;
  dismissed_at: string | null;
}

export interface TeamPlan {
  legacy_code: string;
  name: string;
  coach: string;
  sort_order: number;
  players: { name: string; number: string; sort_order: number }[];
}

export interface DivisionPlan {
  legacy_key: string;
  name: string;
  color: string;
  bracket_count: number;
  custom_games_per_team: boolean;
  games_per_team: number | null;
  sort_order: number;
  teams: TeamPlan[];
  mobile_link: {
    league_id: string;
    league_name: string;
    season: string | null;
    linked_at: string | null;
    linked_by_legacy: string | null;
    teams: { legacy_code: string; mobile_team_id: string }[];
  } | null;
}

export interface EventPlan {
  legacyId: string;
  event: {
    legacy_firebase_id: string;
    legacy_created_by: string | null;
    name: string;
    status: 'draft' | 'published';
    schedule_days: string[];
    time_start: string;
    time_end: string;
    courts: number;
    court_names: string[];
    timezone: string;
    theme_primary: string;
    theme_bg: string;
    theme_text: string;
    theme_text_secondary: string;
    theme_heading: string;
    rules_html: string;
    created_at: string | null;
  };
  logo: ImageSource | null;
  sponsors: { tier: 'major' | 'minor'; source: ImageSource; sort_order: number }[];
  divisions: DivisionPlan[];
  games: GamePlan[];
}

export interface MappedEvent {
  plan: EventPlan | null;
  issues: Issue[];
}

const THEME_DEFAULTS = {
  primary: '#FFCC00',
  bg: '#0D0D0D',
  textPrimary: '#E0E0E0',
  textSecondary: '#888888',
  headingColor: '#FFFFFF',
} as const;
// The old editor's division colour cycle (app.js 738).
const DIVISION_COLOURS = ['#6C63FF', '#2BBF8A', '#E06040', '#D4A017', '#E06098', '#3BACDF'];
const HEX = /^#[0-9A-Fa-f]{6}$/;
const SHORT_HEX = /^#([0-9A-Fa-f])([0-9A-Fa-f])([0-9A-Fa-f])$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** The old app's time pattern (parseTimeMin, app.js 1918-1924). */
const TIME_12H = /^(\d+):(\d+)\s*(AM|PM)$/i;
const TIME_24H = /^(\d{1,2}):(\d{2})$/;
const pad = (n: number) => String(n).padStart(2, '0');

/** The old parseInt reading: "12", 12 and 12.7 are 12; anything else is NaN. */
function int(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : NaN;
  return typeof value === 'string' ? parseInt(value, 10) : NaN;
}

function isRealDay(day: string): boolean {
  if (!DAY.test(day)) return false;
  const d = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === day;
}

/** "9:00 AM" as the old app read it, as "HH:MM"; canonical is formatTime's output. */
export function parseOldTime(raw: string): { hhmm: string; canonical: boolean } | null {
  const m = TIME_12H.exec(raw.trim());
  if (m) {
    let h = parseInt(m[1]!, 10);
    const mi = parseInt(m[2]!, 10);
    const p = m[3]!.toUpperCase();
    if (p === 'PM' && h < 12) h += 12;
    if (p === 'AM' && h === 12) h = 0;
    if (h > 23 || mi > 59) return null;
    const dh = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return { hhmm: `${pad(h)}:${pad(mi)}`, canonical: raw === `${dh}:${pad(mi)} ${h >= 12 ? 'PM' : 'AM'}` };
  }
  const t = TIME_24H.exec(raw.trim());
  if (t && Number(t[1]) <= 23 && Number(t[2]) <= 59) return { hhmm: `${pad(Number(t[1]))}:${t[2]}`, canonical: false };
  return null;
}

function colour(value: unknown): string | null {
  const v = text(value).trim();
  if (HEX.test(v)) return v.toUpperCase();
  const s = SHORT_HEX.exec(v);
  return s ? `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toUpperCase() : null;
}

function isoTime(value: unknown): string | null {
  let ms: number;
  if (typeof value === 'number') ms = value;
  else if (typeof value === 'string' && value.trim() !== '')
    ms = /^\d+$/.test(value.trim()) ? Number(value) : Date.parse(value);
  else return null;
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const intOrNull = (value: unknown): number | null => {
  const n = int(value);
  return Number.isNaN(n) ? null : n;
};

export function imageSource(value: unknown): ImageSource | 'none' | 'unknown' {
  const v = text(value).trim();
  if (v === '') return 'none';
  const data = /^data:(image\/[A-Za-z0-9.+-]+);base64,/.exec(v);
  if (data)
    return {
      kind: 'data',
      mime: data[1]!.toLowerCase(),
      bytes: Math.floor(((v.length - data[0].length) * 3) / 4),
      dataUri: v,
    };
  if (/^https?:\/\//i.test(v)) return { kind: 'url', url: v };
  return 'unknown';
}

/** Labels lose their long dashes (CLAUDE.md), as the golden suite converts them. */
const cleanLabel = (label: string) => label.replaceAll(' — ', ' - ').replaceAll('—', '-').replaceAll('–', '-');

export interface MapOptions {
  timezone: string;
}

export function mapEvent(legacyId: string, raw: unknown, options: MapOptions): MappedEvent {
  const issues: Issue[] = [];
  const note = (level: IssueLevel, code: string, message: string) => issues.push({ level, code, message });
  if (!isRecord(raw)) {
    note('error', 'event.not_object', 'The event is not an object, so it cannot be imported.');
    return { plan: null, issues };
  }

  const clip = (value: unknown, max: number, what: string) => {
    const v = text(value);
    if (v.length <= max) return v;
    note('warning', 'text.too_long', `${what} was longer than ${max} characters and was shortened.`);
    return v.slice(0, max);
  };

  // --- Event details -------------------------------------------------------
  const rawDays = values(raw.scheduleDays).map(text);
  const goodDays = rawDays.filter(isRealDay);
  if (goodDays.length !== rawDays.length)
    note(
      'warning',
      'event.day_invalid',
      `${rawDays.length - goodDays.length} event day(s) were not dates and were left out.`,
    );
  const days = [...new Set(goodDays)].sort();
  if (days.length !== goodDays.length) note('info', 'event.day_repeated', 'A repeated event day was kept once.');

  const hour = (value: unknown, fallback: string, what: string) => {
    const v = text(value).trim();
    if (v === '') return fallback; // the old `||` default
    const parsed = /^(\d{2}):(\d{2})$/.exec(v);
    if (parsed && Number(parsed[1]) <= 23 && Number(parsed[2]) <= 59) return v;
    note('warning', 'event.hours_invalid', `The ${what} time "${v}" could not be read, so ${fallback} is used.`);
    return fallback;
  };
  const timeStart = hour(raw.timeStart, '09:00', 'start');
  let timeEnd = hour(raw.timeEnd, '20:00', 'end');
  if (timeEnd <= timeStart) {
    note(
      'warning',
      'event.hours_order',
      `The end time ${timeEnd} is not after the start time ${timeStart}, so 23:59 is used.`,
    );
    timeEnd = timeStart < '23:59' ? '23:59' : timeEnd;
  }
  if (timeEnd <= timeStart) {
    note('error', 'event.hours_order', 'The event hours cannot be stored.');
    return { plan: null, issues };
  }

  // The old readers' parseInt(courts) || 1: missing or 0 is one court.
  let courts = int(raw.courts) || 1;
  if (courts < 1 || courts > 10) {
    const fixed = courts < 1 ? 1 : 10;
    note('warning', 'event.courts_range', `Courts was ${courts}; ${fixed} is used (1 to 10).`);
    courts = fixed;
  }
  const oldNames = values(raw.courtNames).map((n) => text(n).trim());
  if (oldNames.length > courts)
    note(
      'info',
      'event.court_names_extra',
      `${oldNames.length - courts} court name(s) beyond the ${courts} court(s) were left out.`,
    );
  const courtNames = Array.from({ length: courts }, (_, i) => (oldNames[i] || `Court ${i + 1}`).slice(0, 120));

  const theme = isRecord(raw.theme) ? raw.theme : {};
  const themeColour = (key: keyof typeof THEME_DEFAULTS) => {
    const got = colour(theme[key]);
    if (got) return got;
    if (theme[key] !== undefined)
      note(
        'warning',
        'event.theme_colour',
        `The theme colour ${key} "${text(theme[key])}" is not a colour; the default is used.`,
      );
    return THEME_DEFAULTS[key];
  };

  const rawRules = text(raw.rulesHtml);
  const rules = sanitizeRulesHtml(rawRules);
  // Line breaks are written as <br /> now; only other changes are worth a note.
  const sameRules = (a: string) =>
    a
      .replace(/<br\s*\/?>/gi, '<br />')
      .replace(/\s+/g, ' ')
      .trim();
  if (sameRules(rules) !== sameRules(rawRules))
    note('info', 'event.rules_cleaned', 'The rules were cleaned to the allowed formatting (as every save does now).');

  // --- Images (copied by the image step) ------------------------------------
  const image = (value: unknown, what: string): ImageSource | null => {
    const src = imageSource(value);
    if (src === 'none') return null;
    if (src === 'unknown') {
      note(
        'warning',
        'image.unknown',
        `The ${what} is neither a web address nor an embedded image, so it is left out.`,
      );
      return null;
    }
    return src;
  };
  const logo = image(raw.logo, 'logo');
  const sponsorsNode = isRecord(raw.sponsors) ? raw.sponsors : {};
  const sponsors: EventPlan['sponsors'] = [];
  const major = image(sponsorsNode.major, 'major sponsor');
  if (major) sponsors.push({ tier: 'major', source: major, sort_order: 0 });
  values(sponsorsNode.minor).forEach((m, i) => {
    const src = image(m, `minor sponsor ${i + 1}`);
    if (src)
      sponsors.push({ tier: 'minor', source: src, sort_order: sponsors.filter((s) => s.tier === 'minor').length });
  });

  // --- Divisions and teams --------------------------------------------------
  const divisions: DivisionPlan[] = [];
  const teamHome = new Map<string, string>(); // team code -> division key
  entries(raw.divisions).forEach(([key, div], di) => {
    if (!isRecord(div)) {
      note('warning', 'division.not_object', `Division ${key} is not an object and was left out.`);
      return;
    }
    const divColour = colour(div.color);
    if (!divColour)
      note(
        'warning',
        'division.colour',
        `Division "${text(div.name)}" had no usable colour; the next one in the old cycle is used.`,
      );
    let brackets = int(div.bracketCount);
    if (Number.isNaN(brackets)) brackets = 1; // the old `|| 1`
    if (brackets < 1 || brackets > 4) {
      note(
        'warning',
        'division.brackets',
        `Division "${text(div.name)}" had ${brackets} brackets; ${brackets < 1 ? 1 : 4} is used.`,
      );
      brackets = Math.min(4, Math.max(1, brackets));
    }
    const custom = div.customGamesPerTeam === true;
    let perTeam = div.gamesPerTeam === undefined ? null : intOrNull(div.gamesPerTeam);
    if (perTeam !== null && (perTeam < 0 || perTeam > 20)) {
      note(
        'warning',
        'division.games_per_team',
        `Division "${text(div.name)}" had ${perTeam} games per team; it is kept between 0 and 20.`,
      );
      perTeam = Math.min(20, Math.max(0, perTeam));
    }
    const teams: TeamPlan[] = [];
    entries(div.teams).forEach(([code, team]) => {
      if (!isRecord(team)) {
        note('warning', 'team.not_object', `Team ${code} in "${text(div.name)}" is not an object and was left out.`);
        return;
      }
      if (teamHome.has(code)) {
        note('error', 'team.code_reused', `Team code ${code} is used in two divisions; the second is left out.`);
        return;
      }
      teamHome.set(code, key);
      const players = values(team.players)
        .filter(isRecord)
        .map((p, pi) => ({
          name: clip(p.name, 120, 'A player name'),
          number: clip(p.num ?? p.number, 10, 'A player number'),
          sort_order: pi,
        }));
      teams.push({
        legacy_code: code,
        name: clip(team.name, 120, 'A team name'),
        coach: clip(team.coach, 120, 'A coach name'),
        sort_order: teams.length,
        players,
      });
    });

    let mobileLink: DivisionPlan['mobile_link'] = null;
    if (isRecord(div.mobileLink)) {
      const link = div.mobileLink;
      const leagueId = text(link.leagueId).trim();
      if (!leagueId)
        note(
          'warning',
          'mobile_link.no_league',
          `The mobile link on "${text(div.name)}" has no league and was left out.`,
        );
      else {
        const seen = new Set<string>();
        const pairs: { legacy_code: string; mobile_team_id: string }[] = [];
        for (const [code, mobileId] of entries(link.teams)) {
          const id = text(mobileId).trim();
          if (!id) continue;
          if (!teams.some((t) => t.legacy_code === code))
            note(
              'warning',
              'mobile_link.team_missing',
              `The mobile link on "${text(div.name)}" pairs team ${code}, which is not in the division; that pair is left out.`,
            );
          else if (seen.has(id))
            note(
              'warning',
              'mobile_link.duplicate',
              `The mobile link on "${text(div.name)}" pairs mobile team ${id} twice; only the first is kept.`,
            );
          else {
            seen.add(id);
            pairs.push({ legacy_code: code, mobile_team_id: id });
          }
        }
        mobileLink = {
          league_id: leagueId,
          league_name: text(link.leagueName),
          season: text(link.season) || null,
          linked_at: isoTime(link.linkedAt),
          linked_by_legacy: text(link.linkedBy) || null,
          teams: pairs,
        };
      }
    }

    divisions.push({
      legacy_key: key,
      name: clip(div.name, 120, 'A division name'),
      color: divColour ?? DIVISION_COLOURS[di % DIVISION_COLOURS.length]!,
      bracket_count: brackets,
      custom_games_per_team: custom,
      games_per_team: perTeam,
      sort_order: divisions.length,
      teams,
      mobile_link: mobileLink,
    });
  });
  const divisionKeys = new Set(divisions.map((d) => d.legacy_key));

  // --- Schedule and scores --------------------------------------------------
  const migrated = Boolean(raw.scoresMigratedAt);
  const scoresById = raw.scoresById;
  const positional = raw.scores;
  const sources = isRecord(raw.scoreSources) ? raw.scoreSources : {};
  const rows = entries(raw.schedule).filter(([k, g]) => {
    if (isRecord(g)) return true;
    note('warning', 'game.not_object', `Schedule row ${k} is not an object and was left out.`);
    return false;
  }) as [string, Record<string, unknown>][];

  const originalGids = new Set(rows.map(([, g]) => text(g.gid)).filter(Boolean));
  const usedGids = new Set<string>();
  const slots = new Set<string>();
  const bracketIds = new Set<string>();
  const counts = { assigned: 0, positionalUsed: 0, rowScores: 0 };
  const games: GamePlan[] = [];

  const score = (value: unknown, where: string): number | null => {
    if (value === null || value === undefined) return null;
    const n = int(value);
    if (Number.isNaN(n)) {
      note('warning', 'score.not_number', `A score on ${where} ("${text(value)}") is not a number and was left out.`);
      return null;
    }
    if (n < 0) {
      note('warning', 'score.negative', `A score of ${n} on ${where} cannot be stored, so 0 is used.`);
      return 0;
    }
    if (n > 300) note('info', 'score.large', `A score of ${n} on ${where} is over 300 (kept).`);
    return n;
  };

  const resolveTeam = (value: unknown, divisionKey: string | null, where: string): TeamRef | null => {
    const code = text(value).trim();
    if (!code || code === 'TBD') return null;
    const home = teamHome.get(code);
    if (!home) {
      note(
        'warning',
        'game.team_missing',
        `${where} names team ${code}, which no longer exists; it shows as TBD (the code is kept).`,
      );
      return null;
    }
    if (divisionKey && home !== divisionKey)
      note('info', 'game.team_other_division', `${where} names a team from another division.`);
    return { divisionKey: home, code };
  };

  const source = (value: unknown): PlayoffSourceJson | null => {
    if (!isRecord(value)) return null;
    const rank = int(value.rank);
    if (value.type === 'seed' && rank >= 1) return { type: 'seed', rank };
    const ref = text(value.bracketId ?? value.bracketGameId);
    if (value.type === 'winner' && ref) return { type: 'winner', bracketGameId: ref };
    return null;
  };

  rows.forEach(([key, g]) => {
    const index = Number(key);
    const where = `game ${index + 1} ("${cleanLabel(text(g.label)) || 'no label'}")`;

    // Scores exactly as the old page showed them (applyScoresToSchedule,
    // app.js 1673-1685): the fixture's gid entry wins; positions only for an
    // event that was never migrated. Worked out before any gid is assigned.
    const gid = text(g.gid);
    let shown: unknown = null;
    const byId = gid ? child(scoresById, gid) : undefined;
    if (gid && byId) shown = byId;
    else if (!migrated && child(positional, index)) {
      shown = child(positional, index);
      counts.positionalUsed++;
    }
    const s1 = isRecord(shown) ? score(shown.s1, where) : null;
    const s2 = isRecord(shown) ? score(shown.s2, where) : null;
    if ((s1 === null) !== (s2 === null))
      note('info', 'score.one_sided', `${where} has only one side of its score (kept, not counted).`);
    if (g.s1 !== undefined || g.s2 !== undefined) counts.rowScores++;

    // A stable gid for every row (ensureGameIds, app.js 1546-1556), but
    // repeatable: a row without one, or with a copy of another's, gets one
    // from its position so a second import finds the same game.
    let legacyGid = gid;
    if (!gid || usedGids.has(gid)) {
      if (gid) note('warning', 'game.gid_repeated', `${where} repeats another game's id; it gets its own.`);
      else counts.assigned++;
      legacyGid = `import-${index}`;
      for (let n = 2; originalGids.has(legacyGid) || usedGids.has(legacyGid); n++) legacyGid = `import-${index}-${n}`;
    }
    usedGids.add(legacyGid);

    // Division.
    const divId = text(g.divId);
    let divisionKey: string | null = null;
    if (divId && divisionKeys.has(divId)) divisionKey = divId;
    else if (divId)
      note(
        'warning',
        'game.division_missing',
        `${where} belongs to a division that no longer exists; it is kept without one.`,
      );

    // Slot: fully scheduled or not at all (isUnscheduledGame, app.js 206-208).
    const rawDay = text(g.day);
    const rawTime = text(g.time);
    let day: string | null = null;
    let time: string | null = null;
    let court: number | null = null;
    if (rawDay && rawDay !== 'TBD' && rawTime && rawTime !== 'TBD') {
      const parsed = parseOldTime(rawTime);
      const c = int(g.court);
      if (!isRealDay(rawDay))
        note(
          'warning',
          'game.day_invalid',
          `${where} has the day "${rawDay}", which is not a date; it is unscheduled.`,
        );
      else if (!parsed)
        note(
          'warning',
          'game.time_invalid',
          `${where} has the time "${rawTime}", which cannot be read; it is unscheduled.`,
        );
      else if (Number.isNaN(c) || c < 1)
        note('warning', 'game.court_invalid', `${where} is on court "${text(g.court)}"; it is unscheduled.`);
      else {
        const slot = `${rawDay}|${parsed.hhmm}|${c}`;
        if (slots.has(slot))
          note(
            'warning',
            'game.slot_repeated',
            `${where} shares its day, time and court with an earlier game; it is unscheduled.`,
          );
        else {
          slots.add(slot);
          [day, time, court] = [rawDay, parsed.hhmm, c];
          if (!parsed.canonical)
            note(
              'info',
              'game.time_typed',
              `${where} had the time "${rawTime}" typed by hand; it is read as ${parsed.hhmm}.`,
            );
          if (c > courts)
            note('warning', 'game.court_beyond', `${where} is on court ${c}, beyond the event's ${courts} court(s).`);
          if (!days.includes(rawDay))
            note('info', 'game.day_outside', `${where} is on ${rawDay}, which is not one of the event days.`);
        }
      }
    }

    const team1 = resolveTeam(g.team1, divisionKey, where);
    let team2 = resolveTeam(g.team2, divisionKey, where);
    if (team1 && team2 && team1.code === team2.code) {
      note('warning', 'game.same_team', `${where} has the same team on both sides; the second side shows as TBD.`);
      team2 = null;
    }

    const rawType = text(g.type) || 'group';
    const type = rawType === 'group' || rawType === 'semi' || rawType === 'final' ? rawType : 'group';
    if (type !== rawType)
      note('warning', 'game.type_unknown', `${where} has the type "${rawType}"; it is kept as a group game.`);
    const group = text(g.bracketId);
    const groupId = ['A', 'B', 'C', 'D'].includes(group) ? group : null;
    if (group && !groupId)
      note(
        'warning',
        'game.group_unknown',
        `${where} is in group "${group}", which is not A to D; it is kept without a group.`,
      );

    const isPlayoff = Boolean(g.playoff);
    const bracketGameId = text(g.bracketGameId) || null;
    if (isPlayoff && bracketGameId) {
      if (bracketIds.has(bracketGameId))
        note(
          'info',
          'playoff.id_repeated',
          `${where} repeats the playoff id ${bracketGameId} (a second playoff); winners follow the first, as before.`,
        );
      bracketIds.add(bracketGameId);
    }

    // Approval provenance, keyed by the gid the old app used.
    const rawSource = gid ? sources[gid] : undefined;
    const src: SourcePlan | null = isRecord(rawSource)
      ? {
          mobile_game_id: text(rawSource.mobileGameId) || null,
          league_id: text(rawSource.leagueId) || null,
          s1: intOrNull(rawSource.s1),
          s2: intOrNull(rawSource.s2),
          home_pts: intOrNull(rawSource.homePts),
          away_pts: intOrNull(rawSource.awayPts),
          event_count: intOrNull(rawSource.eventCount),
          last_event_at: isoTime(rawSource.lastEventAt),
          finished_at: isoTime(rawSource.finishedAt),
          approved_by_legacy: text(rawSource.approvedBy) || null,
          approved_at: isoTime(rawSource.approvedAt),
          method: text(rawSource.method) || null,
          dismissed_at: isoTime(rawSource.dismissedAt),
        }
      : null;

    games.push({
      legacy_gid: legacyGid,
      legacy_index: index,
      legacy_team1: text(g.team1) || null,
      legacy_team2: text(g.team2) || null,
      division_key: divisionKey,
      day,
      start_time: time,
      court,
      group_id: groupId,
      team1,
      team2,
      label: cleanLabel(text(g.label)),
      type,
      is_playoff: isPlayoff,
      bracket_game_id: isPlayoff ? bracketGameId : null,
      team1_source: isPlayoff ? source(g.team1Source) : null,
      team2_source: isPlayoff ? source(g.team2Source) : null,
      playoff_round: isPlayoff ? intOrNull(g.playoffRound) : null,
      position: games.length,
      score: s1 === null && s2 === null ? null : { s1, s2 },
      source: src,
    });
  });

  if (counts.assigned)
    note(
      'info',
      'game.gid_assigned',
      `${counts.assigned} game(s) had no id (older events) and were given one from their position.`,
    );
  if (counts.positionalUsed)
    note(
      'info',
      'score.by_position',
      `${counts.positionalUsed} score(s) came from the old position-based store, as the old page showed them.`,
    );
  if (counts.rowScores)
    note(
      'info',
      'game.row_scores',
      `${counts.rowScores} schedule row(s) carried their own s1/s2, which the old page never showed; ignored.`,
    );
  const orphanById = entries(scoresById).filter(([k]) => !originalGids.has(k)).length;
  if (orphanById)
    note(
      'info',
      'score.orphan',
      `${orphanById} score(s) belong to no game on the schedule (deleted games); not imported.`,
    );
  const orphanSources = Object.keys(sources).filter((k) => !originalGids.has(k)).length;
  if (orphanSources)
    note(
      'info',
      'source.orphan',
      `${orphanSources} mobile approval record(s) belong to no game on the schedule; not imported.`,
    );

  const status = raw.status === 'published' ? 'published' : 'draft';
  return {
    plan: {
      legacyId,
      event: {
        legacy_firebase_id: legacyId,
        legacy_created_by: text(raw.createdBy) || null,
        name: clip(raw.name, 200, 'The event name'),
        status,
        schedule_days: days,
        time_start: timeStart,
        time_end: timeEnd,
        courts,
        court_names: courtNames,
        timezone: options.timezone,
        theme_primary: themeColour('primary'),
        theme_bg: themeColour('bg'),
        theme_text: themeColour('textPrimary'),
        theme_text_secondary: themeColour('textSecondary'),
        theme_heading: themeColour('headingColor'),
        rules_html: rules,
        created_at: pushIdTime(legacyId)?.toISOString() ?? null,
      },
      logo,
      sponsors,
      divisions,
      games,
    },
    issues,
  };
}
