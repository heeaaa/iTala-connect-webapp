import { type Game } from '@/domain/types';
import { computeStandings } from '@/domain/standings';

import styles from './event-content.module.css';
import { divisionVars } from './theme';

/*
 * Standings, Teams and Rules tabs (PRD P-09 to P-11), Painted Lines world:
 * organiser colours only, rank and difference never shown by colour alone.
 */

interface DivisionInfo {
  id: string;
  name: string;
  color: string;
  teamIds: string[];
}

export function StandingsTab(props: {
  divisions: DivisionInfo[];
  games: readonly Game[];
  teamName: (id: string) => string;
}) {
  const { divisions, games, teamName } = props;
  if (divisions.length === 0) return <p className={styles.empty}>No standings data.</p>;
  return (
    <div className={styles.stack}>
      {divisions.map((d) => {
        const rows = computeStandings(d.teamIds, games, d.id);
        const headingId = `standings-${d.id}`;
        return (
          <section key={d.id} aria-labelledby={headingId} style={divisionVars(d.color)}>
            <h2 id={headingId} className={styles.divisionTitle}>
              <span className={styles.swatch} aria-hidden="true" />
              {d.name || 'Division'}
            </h2>
            {rows.length === 0 ? (
              <p className={styles.empty}>No teams yet.</p>
            ) : (
              <div
                className={styles.tableScroll}
                tabIndex={0}
                role="region"
                aria-label={`${d.name || 'Division'} standings`}
              >
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th scope="col">
                        <abbr title="Rank">#</abbr>
                      </th>
                      <th scope="col" className={styles.teamCol}>
                        Team
                      </th>
                      <th scope="col">
                        <abbr title="Wins">W</abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Losses">L</abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Points for">PF</abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Points against">PA</abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Points difference">+/-</abbr>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={r.teamId}>
                        <td>
                          <span className={styles.rank} data-rank={i < 3 ? i + 1 : undefined}>
                            {i + 1}
                          </span>
                        </td>
                        <th scope="row" className={styles.teamCol}>
                          {teamName(r.teamId)}
                        </th>
                        <td className={styles.strong}>{r.w}</td>
                        <td>{r.l}</td>
                        <td>{r.pf}</td>
                        <td>{r.pa}</td>
                        <td className={styles.diff} data-sign={Math.sign(r.diff)}>
                          {r.diff > 0 ? `+${r.diff}` : r.diff}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

export interface TeamInfo {
  id: string;
  divisionId: string;
  name: string;
  coach: string;
  players: { id: string; name: string; number: string }[];
}

export function TeamsTab({ divisions, teams }: { divisions: Omit<DivisionInfo, 'teamIds'>[]; teams: TeamInfo[] }) {
  const groups = divisions
    .map((d) => ({ d, teams: teams.filter((t) => t.divisionId === d.id) }))
    .filter((g) => g.teams.length);
  if (groups.length === 0) return <p className={styles.empty}>No teams.</p>;
  return (
    <div className={styles.stack}>
      {groups.map(({ d, teams: list }) => (
        <section key={d.id} aria-labelledby={`teams-${d.id}`} style={divisionVars(d.color)}>
          <h2 id={`teams-${d.id}`} className={styles.divisionTitle}>
            <span className={styles.swatch} aria-hidden="true" />
            {d.name || 'Division'}
          </h2>
          <ul className={styles.teamList}>
            {list.map((t) => (
              <li key={t.id}>
                <details className={styles.team}>
                  <summary>
                    <span className={styles.teamName}>{t.name || 'Unnamed team'}</span>
                    <span className={styles.teamMeta}>
                      {t.coach ? <span>Coach: {t.coach}</span> : null}
                      <span>
                        {t.players.length} {t.players.length === 1 ? 'player' : 'players'}
                      </span>
                    </span>
                  </summary>
                  {t.players.length ? (
                    <ol className={styles.players}>
                      {t.players.map((p, i) => (
                        <li key={p.id}>
                          <span className={styles.playerIndex} aria-hidden="true">
                            {i + 1}
                          </span>
                          <span className={styles.playerNumber}>{p.number ? `#${p.number}` : ''}</span>
                          <span>{p.name}</span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className={styles.quiet}>No players listed.</p>
                  )}
                </details>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** html must already be sanitised (src/lib/rules-html.ts). */
export function RulesTab({ html, empty }: { html: string; empty: boolean }) {
  if (empty) return <p className={styles.empty}>No rules.</p>;
  return <div className={styles.rules} dangerouslySetInnerHTML={{ __html: html }} />;
}

/**
 * P-01 sponsor rows and event logo. Sponsor logos share one neutral section;
 * the event logo stays outside it. Empty rows are left out.
 */
export function EventMedia(props: {
  logoUrl: string | null;
  sponsors: {
    major: { url: string } | string | null;
    minor: ({ url: string } | string)[];
    platformPrimary: ({ url: string } | string)[];
    platformSecondary: ({ url: string } | string)[];
  };
  eventName: string;
}) {
  const { logoUrl, sponsors, eventName } = props;
  const toSponsor = (item: { url: string } | string) => (typeof item === 'string' ? { url: item } : item);
  const small = [...sponsors.platformSecondary, ...sponsors.minor].map(toSponsor);
  const large = [...sponsors.platformPrimary, ...(sponsors.major ? [sponsors.major] : [])].map(toSponsor);
  if (!logoUrl && small.length === 0 && large.length === 0) return null;
  const sponsor = (item: { url: string }) => (
    <li key={item.url}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.url} alt="Sponsor logo" loading="lazy" />
    </li>
  );
  return (
    <div className={styles.media}>
      {logoUrl ? (
        // Plain img: storage URLs are already sized on upload (E-18), and the free tier has no image optimiser budget.
        // eslint-disable-next-line @next/next/no-img-element
        <img className={styles.logo} src={logoUrl} alt={`${eventName} logo`} />
      ) : null}
      {large.length || small.length ? (
        <section className={styles.sponsorSection} aria-label="Event sponsors">
          {large.length ? (
            <div className={styles.sponsorGroup}>
              <h2 className={styles.sponsorHeading}>Major sponsors</h2>
              <ul className={styles.sponsorsLarge} aria-label="Major sponsors">
                {large.map(sponsor)}
              </ul>
            </div>
          ) : null}
          {small.length ? (
            <div className={styles.sponsorGroup}>
              <h2 className={styles.sponsorHeading}>Sponsors</h2>
              <ul className={styles.sponsorsSmall} aria-label="Sponsors">
                {small.map(sponsor)}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
