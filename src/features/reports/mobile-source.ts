import 'server-only';

import { serverEnv } from '@/env';
import { createClient } from '@/lib/supabase/server';

import { createReportsMobileReader } from './mobile-reader';
import type { ReportDefinition, ReportEvent, ReportGame, ReportSource } from './model';

const warning = 'Mobile player statistics could not be verified. Connect scores remain available.';

function candidates(source: ReportSource, definition: ReportDefinition): ReportGame[] {
  let games = source.games.filter(
    (game) =>
      game.homeScore !== null &&
      game.awayScore !== null &&
      (!definition.divisionId || game.divisionId === definition.divisionId) &&
      (!definition.teamId || game.homeTeamId === definition.teamId || game.awayTeamId === definition.teamId) &&
      (!definition.gameIds || definition.gameIds.includes(game.id)) &&
      (definition.dateMode === 'all' ||
        (definition.dateMode === 'range'
          ? game.date >= definition.dates[0]! && game.date <= definition.dates[1]!
          : definition.dates.includes(game.date))),
  );
  if (definition.relative) {
    games = games.sort(
      (a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id),
    );
    games = games.slice(definition.relative === 'latest' ? -1 : -5);
  }
  return games.filter((game) => game.mobileGameId);
}

/** Add only approved Mobile finals with matching league and side identities. */
export async function enrichReportSourceWithMobile(
  source: ReportSource,
  definition: ReportDefinition,
): Promise<ReportSource> {
  const env = serverEnv();
  if (!env.MOBILE_SUPABASE_URL || !env.MOBILE_REPORTS_READ_SECRET) return source;
  const selected = candidates(source, definition);
  if (!selected.length) return source;
  if (selected.length > 100) return { ...source, warnings: [warning] };
  try {
    const db = await createClient();
    const gameIds = selected.map((game) => game.id);
    const divisionIds = [...new Set(selected.map((game) => game.divisionId))];
    const [links, teamLinks, provenance] = await Promise.all([
      db.from('division_mobile_links').select('division_id, league_id').in('division_id', divisionIds),
      db
        .from('division_mobile_team_links')
        .select('division_id, team_id, mobile_team_id')
        .in('division_id', divisionIds),
      db.from('score_sources').select('game_id, mobile_game_id, league_id').in('game_id', gameIds),
    ]);
    if (links.error || teamLinks.error || provenance.error || !links.data || !teamLinks.data || !provenance.data)
      throw new Error('Mobile link unavailable');
    const leagueByDivision = new Map(links.data.map((link) => [link.division_id, link.league_id]));
    const mobileTeamByConnect = new Map(
      teamLinks.data.map((link) => [`${link.division_id}:${link.team_id}`, link.mobile_team_id]),
    );
    const approved = new Map(provenance.data.map((item) => [item.game_id, item]));
    type Mapping = { game: ReportGame; mobileHome: string; mobileAway: string; leagueId: string };
    const mapped = new Map<string, Mapping[]>();
    for (const game of selected) {
      const leagueId = leagueByDivision.get(game.divisionId);
      const sourceRow = approved.get(game.id);
      const mobileHome = mobileTeamByConnect.get(`${game.divisionId}:${game.homeTeamId}`);
      const mobileAway = mobileTeamByConnect.get(`${game.divisionId}:${game.awayTeamId}`);
      if (
        !leagueId ||
        !sourceRow ||
        sourceRow.league_id !== leagueId ||
        sourceRow.mobile_game_id !== game.mobileGameId ||
        !mobileHome ||
        !mobileAway ||
        mobileHome === mobileAway
      )
        continue;
      mapped.set(leagueId, [...(mapped.get(leagueId) ?? []), { game, mobileHome, mobileAway, leagueId }]);
    }
    if (!mapped.size) return source;
    const reader = createReportsMobileReader(env.MOBILE_SUPABASE_URL, env.MOBILE_REPORTS_READ_SECRET);
    const reads = await Promise.all(
      [...mapped].map(async ([leagueId, mappings]) => ({
        mappings,
        data: await reader(
          leagueId,
          mappings.map((mapping) => mapping.game.mobileGameId!),
        ),
      })),
    );
    const games = new Map(source.games.map((game) => [game.id, game]));
    const players = new Map(source.players.map((player) => [player.id, player]));
    for (const { mappings, data } of reads) {
      const finalById = new Map(data.games.map((game) => [game.id, game]));
      for (const mapping of mappings) {
        const final = finalById.get(mapping.game.mobileGameId!);
        if (
          !final ||
          final.default_winner_team_id ||
          new Set([final.home_team_id, final.away_team_id]).size !== 2 ||
          ![mapping.mobileHome, mapping.mobileAway].every(
            (id) => id === final.home_team_id || id === final.away_team_id,
          )
        )
          continue;
        const events = data.events.filter((event) => event.game_id === final.id);
        const teamId = (mobileId: string) =>
          mobileId === mapping.mobileHome
            ? mapping.game.homeTeamId
            : mobileId === mapping.mobileAway
              ? mapping.game.awayTeamId
              : null;
        if (events.some((event) => !teamId(event.team_id))) continue;
        const mobileEvents: ReportEvent[] = events.map((event) => ({
          id: event.id,
          teamId: teamId(event.team_id)!,
          playerId: event.player_id,
          type: event.type,
        }));
        games.set(mapping.game.id, { ...mapping.game, mobileFinal: true, mobileEvents, manifests: [] });
        for (const player of data.players)
          if (events.some((event) => event.player_id === player.id))
            players.set(player.id, { id: player.id, name: player.name });
      }
    }
    return {
      ...source,
      games: [...games.values()],
      players: [...players.values()],
      readAt: new Date().toISOString(),
      warnings: [
        ...(source.warnings ?? []),
        'Connect scores and Mobile events were read separately; their source times may differ.',
      ],
    };
  } catch {
    return { ...source, warnings: [warning] };
  }
}
