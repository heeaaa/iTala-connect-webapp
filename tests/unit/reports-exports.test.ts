import { writeFile } from 'node:fs/promises';

import ExcelJS from 'exceljs';
import { unzipSync, strFromU8 } from 'fflate';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { encodeCsv, exportCsvZip, exportPdf, exportXlsx } from '@/features/reports/exports';
import type { ReportDocument } from '@/features/reports/model';

function report(rows = 1): ReportDocument {
  return {
    version: 1,
    template: 'league',
    title: 'Cumulative League Statistics',
    eventId: 'event',
    eventName: 'Māori League',
    timezone: 'Pacific/Auckland',
    generatedAt: '2026-10-02T00:00:00.000Z',
    sourceReadAt: '2026-10-01T23:59:59.000Z',
    selectedCount: rows,
    includedCount: rows,
    gameIds: Array.from({ length: rows }, (_, i) => `game-${i}`),
    exclusions: [],
    notes: ['Unknown tracking is not zero.'],
    tables: [
      {
        title: 'Players',
        columns: [
          { key: 'id', label: 'Player ID', kind: 'text' },
          { key: 'name', label: 'Player name', kind: 'text' },
          { key: 'points', label: 'Points', kind: 'number' },
          { key: 'average', label: 'Average', kind: 'number' },
        ],
        rows: Array.from({ length: rows }, (_, i) => ({
          id: `p-${i}`,
          name: i === 0 ? '=Māia' : `Māia ${i}`,
          points: i + 2,
          average: null,
        })),
      },
    ],
  };
}

describe('report exports', () => {
  it('escapes spreadsheet formulas and quotes while leaving numeric cells numeric', () => {
    expect(
      encodeCsv([
        ['Name', 'Points'],
        ['=2+2', 4],
        ['Māia, "A"', null],
      ]),
    ).toBe('Name,Points\r\n\'=2+2,4\r\n"Māia, ""A""",\r\n');
    expect(encodeCsv([['\uFEFF=SUM(1,2)']])).toBe('"\'\uFEFF=SUM(1,2)"\r\n');
  });

  it('packages metadata and each table in CSV and keeps the same values in XLSX', async () => {
    const doc = report();
    const files = unzipSync(exportCsvZip(doc));
    expect(Object.keys(files).sort()).toEqual(['metadata.csv', 'table-01.csv']);
    expect(strFromU8(files['metadata.csv']!)).toContain('Included game 1,game-0');
    expect(strFromU8(files['table-01.csv']!)).toContain("p-0,'=Māia,2,");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(await exportXlsx(doc)) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    expect(workbook.getWorksheet('Metadata')!.getCell('B4').value).toBe('Māori League');
    expect(workbook.getWorksheet('Table 1')!.getCell('B2').value).toBe("'=Māia");
    expect(workbook.getWorksheet('Table 1')!.getCell('C2').value).toBe(2);
    expect(workbook.getWorksheet('Table 1')!.getCell('D2').value).toBeNull();
  });

  it('builds a Unicode PDF with pages for a long table', async () => {
    const bytes = await exportPdf(report(120));
    if (process.env.REPORT_PDF_PREVIEW === '1') await writeFile('tmp/pdfs/reports-sample.pdf', bytes);
    const parsed = await PDFDocument.load(bytes);
    expect(parsed.getPageCount()).toBeGreaterThan(1);
    expect(parsed.getTitle()).toContain('Cumulative League Statistics');
  });
});
