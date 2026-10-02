import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { PlatformFrame, TitlePlate, platformStyles } from '@/components/platform/platform-frame';
import { serverEnv } from '@/env';
import type { ReportDocument } from '@/features/reports/model';
import { ReportPreview } from '@/features/reports/preview';

import { platformFontClassName } from '../../platform-fonts';

export const metadata: Metadata = { title: 'Reports sample', robots: { index: false, follow: false } };

const sample: ReportDocument = {
  version: 1,
  template: 'box-score',
  title: 'Game Box Score Book',
  eventId: 'sample-event',
  eventName: 'Te Whānau League',
  timezone: 'Pacific/Auckland',
  generatedAt: '2026-10-02T00:00:00.000Z',
  sourceReadAt: '2026-10-01T23:59:00.000Z',
  selectedCount: 3,
  includedCount: 2,
  gameIds: ['g1', 'g2'],
  exclusions: [{ gameId: 'g3', reason: 'Game has no recorded score' }],
  notes: ['Scores come from Connect.', 'Mobile player coverage is unknown for historical games.'],
  tables: [
    {
      title: '01/10/2026: Kōwhai Warriors 61 - 58 Te Kapa Rangi',
      columns: [
        { key: 'team', label: 'Team', kind: 'text' },
        { key: 'entry', label: 'Entry', kind: 'text' },
        { key: 'player', label: 'Player', kind: 'text' },
        { key: 'points', label: 'Points', kind: 'number' },
        { key: 'fg2', label: '2PT made', kind: 'number' },
        { key: 'fg3', label: '3PT made', kind: 'number' },
        { key: 'ft', label: 'FT made', kind: 'number' },
      ],
      rows: [
        { team: 'Kōwhai Warriors', entry: 'Connect score', player: '', points: 61, fg2: null, fg3: null, ft: null },
        {
          team: 'Kōwhai Warriors',
          entry: 'Recorded player',
          player: 'Māia Te Aroha',
          points: 18,
          fg2: 6,
          fg3: 1,
          ft: 3,
        },
        { team: 'Te Kapa Rangi', entry: 'Connect score', player: '', points: 58, fg2: null, fg3: null, ft: null },
      ],
    },
    {
      title: '02/10/2026: Kōwhai Warriors 0 - 2 Te Kapa Rangi',
      columns: [
        { key: 'team', label: 'Team', kind: 'text' },
        { key: 'entry', label: 'Entry', kind: 'text' },
        { key: 'points', label: 'Points', kind: 'number' },
      ],
      rows: [
        { team: 'Kōwhai Warriors', entry: 'Connect score', points: 0 },
        { team: 'Te Kapa Rangi', entry: 'Connect score', points: 2 },
      ],
    },
  ],
};

export default function ReportsPrototype() {
  if (!serverEnv().ENABLE_PROTOTYPES) notFound();
  return (
    <PlatformFrame
      current="admin"
      viewer={{ name: 'Sample admin', role: 'admin' }}
      fontClassName={platformFontClassName}
      signOut={<button type="button">Sign out</button>}
    >
      <main className={`${platformStyles.wrap} pb-12`}>
        <TitlePlate title="Reports" sub="Sample data for visual review" />
        <ReportPreview report={sample} />
      </main>
    </PlatformFrame>
  );
}
