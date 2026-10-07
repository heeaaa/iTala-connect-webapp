import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ReportPreview } from '@/features/reports/preview';
import { MOBILE_UNVERIFIED, type ReportDocument } from '@/features/reports/model';

const document: ReportDocument = {
  version: 1,
  template: 'box-score',
  title: 'Game Box Score Book',
  eventId: 'e',
  eventName: 'League night',
  timezone: 'Pacific/Auckland',
  generatedAt: '2026-10-02T00:00:00.000Z',
  sourceReadAt: '2026-10-01T23:59:00.000Z',
  selectedCount: 2,
  includedCount: 1,
  gameIds: ['g1'],
  exclusions: [{ gameId: 'g2', reason: 'Game has no recorded score' }],
  notes: ['Player statistics are unavailable for this game.'],
  tables: [
    {
      title: 'Aces 0 - 2 Blues',
      columns: [
        { key: 'team', label: 'Team', kind: 'text' },
        { key: 'points', label: 'Points', kind: 'number' },
      ],
      rows: [
        { team: 'Aces', points: 0 },
        { team: 'Blues', points: 2 },
      ],
    },
  ],
};

describe('Reports preview', () => {
  it('keeps zero scores, coverage notes and exclusion reasons visible and labelled', () => {
    render(<ReportPreview report={document} />);
    expect(screen.getByRole('heading', { name: 'Game Box Score Book' })).toBeInTheDocument();
    expect(screen.getByText('Player statistics are unavailable for this game.')).toBeInTheDocument();
    const region = screen.getByRole('region', { name: 'Aces 0 - 2 Blues table' });
    expect(region).toHaveAttribute('tabindex', '0');
    expect(within(region).getByRole('row', { name: 'Aces 0' })).toBeInTheDocument();
    expect(screen.getByText('g2: Game has no recorded score')).toBeInTheDocument();
  });

  it('reads like a box score: names not IDs, the team total stands out, and left-out games are named', () => {
    const box: ReportDocument = {
      ...document,
      selectedCount: 3,
      exclusions: [
        { gameId: 'g2', label: 'Sat 03/10/2026 · Aces vs Blues', reason: 'Game has no recorded score' },
        // Saved by the first version, which listed games outside the chosen dates as excluded.
        { gameId: 'g3', reason: 'Outside selected dates' },
      ],
      tables: [
        {
          title: 'Sat 03/10/2026 · 6:00 pm · Senior: Aces 6 - 2 Blues',
          columns: [
            { key: 'gameId', label: 'Game ID', kind: 'text' },
            { key: 'teamId', label: 'Team ID', kind: 'text' },
            { key: 'team', label: 'Team', kind: 'text' },
            { key: 'entry', label: 'Entry', kind: 'text' },
            { key: 'playerId', label: 'Player ID', kind: 'text' },
            { key: 'player', label: 'Player', kind: 'text' },
            { key: 'points', label: 'Points', kind: 'number' },
          ],
          rows: [
            { gameId: 'g1', teamId: 'a', team: 'Aces', entry: 'Player', playerId: 'p', player: 'Ari', points: 5 },
            {
              gameId: 'g1',
              teamId: 'a',
              team: 'Aces',
              entry: 'Team total',
              playerId: '',
              player: 'Team total',
              points: 5,
            },
            {
              gameId: 'g1',
              teamId: 'a',
              team: 'Aces',
              entry: 'Final score',
              playerId: '',
              player: 'Final score',
              points: 6,
            },
          ],
        },
      ],
    };
    render(<ReportPreview report={box} />);
    const region = screen.getByRole('region', { name: 'Sat 03/10/2026 · 6:00 pm · Senior: Aces 6 - 2 Blues table' });
    // The team heads its own block instead of repeating in a column.
    expect(
      within(region.querySelector('thead')!)
        .getAllByRole('columnheader')
        .map((th) => th.textContent),
    ).toEqual(['Player', 'Points']);
    const block = region.querySelector('tbody')!;
    expect(
      within(block)
        .getAllByRole('row')
        .map((tr) => tr.textContent),
    ).toEqual(['Aces', 'Ari5', 'Team total5', 'Final score6']);
    expect(within(block).getByRole('row', { name: 'Team total 5' }).className).toMatch(/lineTotal/);
    expect(within(block).getByRole('row', { name: 'Final score 6' }).className).toMatch(/lineFinal/);
    expect(screen.getByText('League night · 1 game · 1 left out')).toBeInTheDocument();
    expect(screen.getByText('1 chosen game left out')).toBeInTheDocument();
    expect(screen.getByText('Sat 03/10/2026 · Aces vs Blues: Game has no recorded score')).toBeInTheDocument();
    expect(screen.queryByText(/Outside selected dates/)).not.toBeInTheDocument();
    // Made at 2 October 2026 00:00 UTC, which is 1:00 pm in Auckland (NZDT).
    expect(screen.getByText('Draft preview, made 02/10/2026 1:00 pm · dates in Pacific/Auckland')).toBeInTheDocument();
  });

  it('keeps the notes one click away, but says plainly when nothing matched or stats could not be checked', () => {
    const notes = ['Dates use Pacific/Auckland.', MOBILE_UNVERIFIED, 'No eligible games match this selection.'];
    render(<ReportPreview report={{ ...document, includedCount: 0, gameIds: [], tables: [], notes }} />);
    expect(screen.getByText('No games with a score match this selection. Try other dates or games.')).toBeVisible();
    expect(screen.getByText(MOBILE_UNVERIFIED, { selector: 'p' })).toBeVisible();
    const about = screen.getByText('About these numbers').closest('details')!;
    expect(about).not.toHaveAttribute('open');
    expect(
      within(about)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(notes);
  });

  it('shows dates as DD/MM/YYYY and reads a box score saved before player lines were named', () => {
    const old: ReportDocument = {
      ...document,
      // Saved by the first version: no labels, the old reasons and line names, and an empty player cell.
      exclusions: [{ gameId: 'g9', reason: 'Outside selected dates' }],
      tables: [
        {
          title: '2026-10-01 · Senior: Aces 6 - 2 Blues',
          columns: [
            { key: 'gameId', label: 'Game ID', kind: 'text' },
            { key: 'teamId', label: 'Team ID', kind: 'text' },
            { key: 'team', label: 'Team', kind: 'text' },
            { key: 'entry', label: 'Entry', kind: 'text' },
            { key: 'playerId', label: 'Player ID', kind: 'text' },
            { key: 'player', label: 'Player', kind: 'text' },
            { key: 'points', label: 'Points', kind: 'number' },
          ],
          rows: [
            { gameId: 'g1', teamId: 'a', team: 'Aces', entry: 'Connect score', playerId: '', player: '', points: 6 },
            {
              gameId: 'g1',
              teamId: 'a',
              team: 'Aces',
              entry: 'Recorded player',
              playerId: 'p',
              player: 'Ari',
              points: 5,
            },
            { gameId: 'g1', teamId: 'a', team: 'Aces', entry: 'Score difference', playerId: '', player: '', points: 1 },
          ],
        },
        {
          title: 'Results',
          columns: [
            { key: 'gameId', label: 'Game ID', kind: 'text' },
            { key: 'date', label: 'Date', kind: 'text' },
            { key: 'home', label: 'Home', kind: 'text' },
          ],
          rows: [{ gameId: 'g1', date: '2026-10-01', home: 'Aces' }],
        },
      ],
    };
    render(<ReportPreview report={old} saved />);
    const box = screen.getByRole('region', { name: '2026-10-01 · Senior: Aces 6 - 2 Blues table' });
    expect(
      within(box.querySelector('tbody')!)
        .getAllByRole('row')
        .map((tr) => tr.textContent),
    ).toEqual(['Aces', 'Connect score6', 'Ari5', 'Score difference1']);
    const results = screen.getByRole('region', { name: 'Results table' });
    expect(within(results).getByRole('row', { name: '01/10/2026 Aces' })).toBeInTheDocument();
    expect(screen.queryByText(/left out/)).not.toBeInTheDocument();
  });

  it('shows a blank cell as a plain dash', () => {
    const blank: ReportDocument = {
      ...document,
      tables: [{ ...document.tables[0]!, rows: [{ team: 'Aces', points: null }] }],
    };
    render(<ReportPreview report={blank} />);
    expect(screen.getByRole('row', { name: 'Aces -' })).toBeInTheDocument();
  });

  it('labels a saved preview, and falls back to UTC for a time zone it cannot read', () => {
    render(<ReportPreview report={{ ...document, timezone: 'Not/AZone', exclusions: [] }} saved />);
    expect(screen.getByText('Saved preview, made 02/10/2026 12:00 am UTC · dates in Not/AZone')).toBeInTheDocument();
    expect(screen.queryByText(/left out/)).not.toBeInTheDocument();
  });

  it('shows an explicit empty state for a table without supported rows', () => {
    render(<ReportPreview report={{ ...document, tables: [{ ...document.tables[0]!, rows: [] }] }} />);
    expect(screen.getByText('No supported rows for this selection.')).toBeInTheDocument();
  });
});
