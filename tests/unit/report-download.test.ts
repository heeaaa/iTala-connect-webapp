import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from '@/app/admin/reports/snapshots/[snapshotId]/export/route';

const mocks = vi.hoisted(() => ({
  getAccess: vi.fn(),
  createClient: vi.fn(),
  exportCsvZip: vi.fn(),
  exportPdf: vi.fn(),
  exportXlsx: vi.fn(),
}));

vi.mock('@/server/auth', () => ({ getAccess: mocks.getAccess }));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }));
vi.mock('@/features/reports/exports', () => ({
  exportCsvZip: mocks.exportCsvZip,
  exportPdf: mocks.exportPdf,
  exportXlsx: mocks.exportXlsx,
}));

const eventId = '10000000-0000-4000-8000-000000000191';
const snapshotId = '30000000-0000-4000-8000-000000000191';
const document = {
  version: 1,
  template: 'results',
  title: 'Results and Standings',
  eventId,
  eventName: 'October League',
  timezone: 'Pacific/Auckland',
  generatedAt: '2026-10-02T00:00:00.000Z',
  sourceReadAt: '2026-10-01T23:59:00.000Z',
  selectedCount: 0,
  includedCount: 0,
  gameIds: [],
  exclusions: [],
  notes: ['No scored games yet'],
  tables: [{ title: 'Results', columns: [{ key: 'score', label: 'Score', kind: 'number' }], rows: [] }],
};

function request(format: string) {
  return new Request(`https://connect.itala.fyi/admin/reports/snapshots/${snapshotId}/export?format=${format}`);
}
const context = { params: Promise.resolve({ snapshotId }) };

describe('report snapshot downloads', () => {
  const maybeSingle = vi.fn();
  const from = vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }));

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAccess.mockResolvedValue({ kind: 'admin' });
    mocks.createClient.mockResolvedValue({ from });
    maybeSingle.mockResolvedValue({ data: { document }, error: null });
    mocks.exportCsvZip.mockReturnValue(new Uint8Array([1, 2, 3]));
  });

  it('does not query snapshots for a signed-out visitor or an invalid format', async () => {
    mocks.getAccess.mockResolvedValueOnce({ kind: 'signed-out' });
    expect((await GET(request('csv'), context)).status).toBe(404);
    expect((await GET(request('exe'), context)).status).toBe(400);
    expect(from).not.toHaveBeenCalled();
  });

  it('does not export a row hidden by RLS or invalid stored JSON', async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    expect((await GET(request('csv'), context)).status).toBe(404);
    maybeSingle.mockResolvedValueOnce({ data: { document: { ...document, eventId: 'wrong' } }, error: null });
    expect((await GET(request('csv'), context)).status).toBe(422);
    expect(mocks.exportCsvZip).not.toHaveBeenCalled();
  });

  it('exports only the stored document with private download headers', async () => {
    const response = await GET(request('csv'), context);
    expect(response.status).toBe(200);
    expect(from).toHaveBeenCalledWith('report_snapshots');
    expect(mocks.exportCsvZip).toHaveBeenCalledWith(document);
    expect(mocks.exportPdf).not.toHaveBeenCalled();
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('Content-Disposition')).toContain(`${snapshotId}.zip`);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });
});
