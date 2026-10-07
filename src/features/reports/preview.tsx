import { displayColumns, displayValue, leftOut, madeAt } from './display';
import { MOBILE_UNVERIFIED, type ReportDocument, type ReportTable } from './model';
import styles from './reports.module.css';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** A box score's rows, one block per team in the order they appear (the team names its block). */
function teamBlocks(table: ReportTable) {
  const blocks: { teamId: string; team: string; rows: ReportTable['rows'] }[] = [];
  for (const row of table.rows) {
    const teamId = String(row.teamId ?? '');
    const last = blocks.at(-1);
    if (last && last.teamId === teamId) last.rows.push(row);
    else blocks.push({ teamId, team: String(row.team ?? ''), rows: [row] });
  }
  return blocks;
}

function rowClass(row: ReportTable['rows'][number]) {
  return row.entry === 'Team total' ? styles.lineTotal : row.entry === 'Final score' ? styles.lineFinal : undefined;
}

/** The same document shape drives preview and the three export formats. */
export function ReportPreview({ report, saved = false }: { report: ReportDocument; saved?: boolean }) {
  const problems = leftOut(report);
  return (
    <section className={styles.preview} aria-labelledby="preview-title">
      <div className={styles.previewHeading}>
        <h2 id="preview-title">{report.title}</h2>
        <p>
          {report.eventName} · {plural(report.includedCount, 'game')}
          {problems.length ? ` · ${problems.length} left out` : ''}
        </p>
        <p className={styles.meta}>
          {saved ? 'Saved preview' : 'Draft preview'}, made {madeAt(report)} · dates in {report.timezone}
        </p>
      </div>
      {report.notes.includes(MOBILE_UNVERIFIED) ? <p className={styles.notice}>{MOBILE_UNVERIFIED}</p> : null}
      {report.includedCount === 0 ? (
        <p className={styles.empty}>No games with a score match this selection. Try other dates or games.</p>
      ) : null}
      {report.notes.length ? (
        <details className={styles.disclosure}>
          <summary>About these numbers</summary>
          <ul>
            {report.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </details>
      ) : null}
      {problems.length ? (
        <details className={styles.disclosure}>
          <summary>{plural(problems.length, 'chosen game')} left out</summary>
          <ul>
            {problems.map((item) => (
              <li key={item.gameId}>
                {item.label ?? item.gameId}: {item.reason}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {report.tables.map((table, index) => {
        // A box score groups its rows under each team, so the team column is not repeated.
        const boxScore = table.columns.some((c) => c.key === 'entry') && table.columns.some((c) => c.key === 'teamId');
        const columns = displayColumns(table).filter((c) => !(boxScore && c.key === 'team'));
        const cells = (row: ReportTable['rows'][number]) =>
          columns.map((column) => (
            <td key={column.key} className={column.kind === 'number' ? styles.number : undefined}>
              {displayValue(row, column.key) ?? '-'}
            </td>
          ));
        return (
          <section key={`${index}-${table.title}`} className={styles.tableSection}>
            <h3>{table.title}</h3>
            {table.rows.length ? (
              <>
                {columns.length > 4 ? (
                  <p className={styles.scrollHint}>Swipe the table sideways for more columns.</p>
                ) : null}
                <div
                  className={
                    // Players listed by team: the team and the player both stay in view while the stats scroll.
                    columns[0]?.key === 'team' && columns[1]?.key === 'player'
                      ? `${styles.tableScroll} ${styles.teamPlayer}`
                      : styles.tableScroll
                  }
                  tabIndex={0}
                  role="region"
                  aria-label={`${table.title} table`}
                >
                  <table>
                    <thead>
                      <tr>
                        {columns.map((column) => (
                          <th
                            scope="col"
                            key={column.key}
                            className={column.kind === 'number' ? styles.number : undefined}
                          >
                            {column.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    {boxScore ? (
                      teamBlocks(table).map((block, blockIndex) => (
                        <tbody key={`${blockIndex}-${block.teamId}`}>
                          <tr className={styles.teamRow}>
                            <th scope="rowgroup" colSpan={columns.length}>
                              <span>{block.team}</span>
                            </th>
                          </tr>
                          {block.rows.map((row, rowIndex) => (
                            <tr key={rowIndex} className={rowClass(row)}>
                              {cells(row)}
                            </tr>
                          ))}
                        </tbody>
                      ))
                    ) : (
                      <tbody>
                        {table.rows.map((row, rowIndex) => (
                          <tr key={rowIndex} className={rowClass(row)}>
                            {cells(row)}
                          </tr>
                        ))}
                      </tbody>
                    )}
                  </table>
                </div>
              </>
            ) : (
              <p className={styles.empty}>No supported rows for this selection.</p>
            )}
          </section>
        );
      })}
    </section>
  );
}
