import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ReportPreview } from '@/features/reports/preview';
import type { ReportDocument } from '@/features/reports/model';

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

  it('shows an explicit empty state for a table without supported rows', () => {
    render(<ReportPreview report={{ ...document, tables: [{ ...document.tables[0]!, rows: [] }] }} />);
    expect(screen.getByText('No supported rows for this selection.')).toBeInTheDocument();
  });
});
