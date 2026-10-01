import type { ReportDocument } from './model';
import styles from './reports.module.css';

/** The same document shape drives preview and the three export formats. */
export function ReportPreview({ report }: { report: ReportDocument }) {
  return (
    <section className={styles.preview} aria-labelledby="preview-title">
      <div className={styles.previewHeading}>
        <div>
          <p className={styles.eyebrow}>Preview · {report.generatedAt.slice(0, 16).replace('T', ' ')} UTC</p>
          <h2 id="preview-title">{report.title}</h2>
          <p>
            {report.eventName} · {report.includedCount} of {report.selectedCount} selected games
          </p>
        </div>
      </div>
      {report.notes.map((note) => (
        <p className={styles.note} key={note}>
          {note}
        </p>
      ))}
      {report.exclusions.length ? (
        <details className={styles.exclusions}>
          <summary>{report.exclusions.length} excluded games</summary>
          <ul>
            {report.exclusions.map((item) => (
              <li key={item.gameId}>
                {item.gameId}: {item.reason}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {report.tables.map((table, index) => (
        <section key={`${index}-${table.title}`} className={styles.tableSection}>
          <h3>{table.title}</h3>
          {table.rows.length ? (
            <>
              {table.columns.length > 4 ? (
                <p className={styles.scrollHint}>Swipe table sideways for more columns.</p>
              ) : null}
              <div className={styles.tableScroll} tabIndex={0} role="region" aria-label={`${table.title} table`}>
                <table>
                  <thead>
                    <tr>
                      {table.columns.map((column) => (
                        <th scope="col" key={column.key}>
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        {table.columns.map((column) => (
                          <td key={column.key}>{row[column.key] ?? '—'}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className={styles.empty}>No supported rows for this selection.</p>
          )}
        </section>
      ))}
    </section>
  );
}
