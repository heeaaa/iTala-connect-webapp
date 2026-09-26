import { matchupCounts } from '@/domain/schedule-edit';
import { type Game } from '@/domain/types';
import { type EditorDivision } from '@/lib/event-editor';
import w from '../../admin-workspace.module.css';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function divisionReport(division: EditorDivision, games: readonly Game[]) {
  const ids = division.teams.map((t) => t.id);
  const { counts, totalGames } = matchupCounts(games, division.id, ids);
  const count = (a: string, b: string) => counts.get([a, b].sort().join('|')) ?? 0;
  let repeated = 0;
  let unplayed = 0;
  ids.forEach((a, i) =>
    ids.slice(i + 1).forEach((b) => {
      const n = count(a, b);
      if (n > 1) repeated++;
      if (n === 0) unplayed++;
    }),
  );
  return { count, totalGames, repeated, unplayed };
}

/** Total repeated matchups, for the section heading (E-31). */
export function repeatedMatchups(divisions: readonly EditorDivision[], games: readonly Game[]): number {
  return divisions.reduce((sum, d) => sum + (d.teams.length < 2 ? 0 : divisionReport(d, games).repeated), 0);
}

/**
 * Team matchup report (PRD E-30, E-31): per division, how many group games
 * each pair of teams plays. Playoffs and TBD games are not counted;
 * unscheduled games are.
 */
export function MatchupReport({ divisions, games }: { divisions: readonly EditorDivision[]; games: readonly Game[] }) {
  if (!divisions.length) return <p className={w.note}>Add a division to see its matchups.</p>;
  return (
    <div className={w.stack}>
      <p className={w.note}>
        Per team, how many round-robin games are scheduled against each other team. A count above 1 is a repeat fixture
        and is highlighted. Playoff games are not counted.
      </p>
      {divisions.map((d) => {
        const title = d.name || 'Untitled division';
        if (d.teams.length < 2)
          return (
            <section key={d.id} className={w.matchup} style={{ borderInlineStartColor: d.color }}>
              <h3>{title}</h3>
              <p className={w.note}>This division needs at least 2 teams.</p>
            </section>
          );
        const r = divisionReport(d, games);
        return (
          <section key={d.id} className={w.matchup} style={{ borderInlineStartColor: d.color }}>
            <h3>{title}</h3>
            <ul className={w.tags} aria-label={`${title} summary`}>
              <li className={w.chip}>{plural(r.totalGames, 'game')}</li>
              <li className={r.repeated ? `${w.chip} ${w.chipWarn}` : w.chip}>
                {r.repeated ? plural(r.repeated, 'repeated matchup') : 'No repeated matchups'}
              </li>
              {r.unplayed > 0 && <li className={w.chip}>{plural(r.unplayed, 'pairing')} not scheduled</li>}
            </ul>
            <div className={w.matchupScroll} tabIndex={0} role="region" aria-label={`${title} matchups`}>
              <table className={w.matchupTable}>
                <thead>
                  <tr>
                    <td />
                    {d.teams.map((t) => (
                      <th key={t.id} scope="col">
                        {t.name || 'Unnamed team'}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.teams.map((row) => (
                    <tr key={row.id}>
                      <th scope="row">{row.name || 'Unnamed team'}</th>
                      {d.teams.map((col) => {
                        if (row.id === col.id)
                          return (
                            <td key={col.id}>
                              -<span className="sr-only"> same team</span>
                            </td>
                          );
                        const n = r.count(row.id, col.id);
                        return n > 1 ? (
                          <td key={col.id} className={w.repeat} title={`${n} games between these teams`}>
                            {n}
                            <span className="sr-only"> games, repeated</span>
                          </td>
                        ) : (
                          <td key={col.id}>
                            {n === 0 ? '-' : '1'}
                            {n === 0 && <span className="sr-only"> no games</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
