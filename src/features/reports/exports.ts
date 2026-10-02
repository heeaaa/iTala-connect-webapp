import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import fontkit from '@pdf-lib/fontkit';
import ExcelJS from 'exceljs';
import { strToU8, zipSync } from 'fflate';
import { PDFDocument, rgb, type PDFPage, type PDFFont } from 'pdf-lib';

import type { ReportCell, ReportDocument, ReportTable } from './model';

/** CSV encoding adapted from iTala-web (MIT, revision 8385a7a). */
function safeSpreadsheetText(value: string): string {
  return /^[\s\p{Cc}\p{Cf}]*[=+\-@]/u.test(value) || /^[\t\r\n]/.test(value) ? `'${value}` : value;
}

export function encodeCsv(rows: ReportCell[][]): string {
  return (
    rows
      .map((row) =>
        row
          .map((cell) => {
            if (cell === null) return '';
            if (typeof cell === 'number') return String(cell);
            const value = safeSpreadsheetText(cell);
            return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
          })
          .join(','),
      )
      .join('\r\n') + '\r\n'
  );
}

function metadata(report: ReportDocument): ReportCell[][] {
  return [
    ['Field', 'Value'],
    ['Template', report.title],
    ['Event ID', report.eventId],
    ['Event', report.eventName],
    ['Timezone', report.timezone],
    ['Generated at', report.generatedAt],
    ['Source read at', report.sourceReadAt],
    ['Selected games', report.selectedCount],
    ['Included games', report.includedCount],
    ['Excluded games', report.exclusions.length],
    ['Calculation version', report.version],
    ...report.gameIds.map((gameId, index): ReportCell[] => [`Included game ${index + 1}`, gameId]),
    ...report.tables.map((table, index): ReportCell[] => [`Table ${index + 1}`, table.title]),
    ...report.notes.map((note, index): ReportCell[] => [`Note ${index + 1}`, note]),
    ...report.exclusions.map((excluded): ReportCell[] => [`Excluded ${excluded.gameId}`, excluded.reason]),
  ];
}

function tableCells(table: ReportTable): ReportCell[][] {
  return [
    table.columns.map((column) => column.label),
    ...table.rows.map((row) => table.columns.map((column) => row[column.key] ?? null)),
  ];
}

/** A ZIP makes every multi-table CSV export one download. */
export function exportCsvZip(report: ReportDocument): Uint8Array {
  const files: Record<string, Uint8Array> = { 'metadata.csv': strToU8(encodeCsv(metadata(report))) };
  report.tables.forEach((table, index) => {
    files[`table-${String(index + 1).padStart(2, '0')}.csv`] = strToU8(encodeCsv(tableCells(table)));
  });
  return zipSync(files, { level: 6 });
}

function addRows(sheet: ExcelJS.Worksheet, rows: ReportCell[][]): void {
  for (const row of rows)
    sheet.addRow(row.map((cell) => (typeof cell === 'string' ? safeSpreadsheetText(cell) : cell)));
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B3241' } };
  sheet.columns.forEach((column) => {
    column.width = 20;
  });
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, rows.length), column: rows[0]?.length ?? 1 },
  };
}

export async function exportXlsx(report: ReportDocument): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'iTala Connect';
  workbook.created = new Date(report.generatedAt);
  addRows(workbook.addWorksheet('Metadata'), metadata(report));
  report.tables.forEach((table, index) => addRows(workbook.addWorksheet(`Table ${index + 1}`), tableCells(table)));
  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}

const INK = rgb(0.04, 0.09, 0.14);
const MUTED = rgb(0.31, 0.39, 0.44);
const TEAL = rgb(0.04, 0.48, 0.53);
const PALE = rgb(0.92, 0.97, 0.97);
const MARGIN = 36;

function fit(text: string, font: PDFFont, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let end = text.length;
  while (end > 0 && font.widthOfTextAtSize(`${text.slice(0, end)}…`, size) > maxWidth) end--;
  return `${text.slice(0, end)}…`;
}

/** Landscape pages use A3 for wide tables; headers repeat after every page break. */
export async function exportPdf(report: ReportDocument): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fontBytes = await readFile(join(process.cwd(), 'public', 'reports', 'NotoSans-Regular.ttf'));
  const font = await doc.embedFont(fontBytes, { subset: true });
  doc.setTitle(`${report.title} | ${report.eventName}`);
  doc.setAuthor('iTala Connect');
  const wide = report.tables.some((table) => table.columns.length > 8);
  const dimensions: [number, number] = wide ? [1191, 842] : [842, 595];
  let page!: PDFPage;
  let y = 0;
  const pageStart = () => {
    page = doc.addPage(dimensions);
    y = dimensions[1] - MARGIN;
    page.drawRectangle({ x: 0, y: dimensions[1] - 14, width: dimensions[0], height: 14, color: TEAL });
    page.drawText(report.eventName, { x: MARGIN, y, font, size: 12, color: INK });
    y -= 25;
  };
  const line = (text: string, size = 9, color = MUTED) => {
    if (y < MARGIN + 35) pageStart();
    page.drawText(fit(text, font, size, dimensions[0] - MARGIN * 2), { x: MARGIN, y, font, size, color });
    y -= size + 8;
  };
  pageStart();
  line(report.title, 19, INK);
  line(`Generated ${report.generatedAt} · Source read ${report.sourceReadAt} · ${report.timezone}`);
  line(`${report.includedCount} included of ${report.selectedCount} selected games`);
  for (const note of report.notes) line(note);
  for (const table of report.tables) {
    const colWidth = (dimensions[0] - MARGIN * 2) / Math.max(1, table.columns.length);
    const header = () => {
      if (y < MARGIN + 55) pageStart();
      page.drawRectangle({ x: MARGIN, y: y - 11, width: dimensions[0] - MARGIN * 2, height: 27, color: TEAL });
      table.columns.forEach((column, index) => {
        page.drawText(fit(column.label, font, 8, colWidth - 12), {
          x: MARGIN + index * colWidth + 6,
          y,
          font,
          size: 8,
          color: rgb(1, 1, 1),
        });
      });
      y -= 27;
    };
    if (y < MARGIN + 75) pageStart();
    line(table.title, 12, INK);
    header();
    if (!table.rows.length) line('No supported rows for this selection.');
    for (const [rowIndex, row] of table.rows.entries()) {
      if (y < MARGIN + 28) {
        pageStart();
        line(`${table.title} (continued)`, 11, INK);
        header();
      }
      if (rowIndex % 2 === 0)
        page.drawRectangle({ x: MARGIN, y: y - 7, width: dimensions[0] - MARGIN * 2, height: 21, color: PALE });
      table.columns.forEach((column, index) => {
        const value = row[column.key];
        const text = value === null || value === undefined ? '—' : String(value);
        page.drawText(fit(text, font, 8, colWidth - 12), {
          x: MARGIN + index * colWidth + 6,
          y,
          font,
          size: 8,
          color: INK,
        });
      });
      y -= 21;
    }
    y -= 15;
  }
  const pages = doc.getPages();
  pages.forEach((current, index) => {
    current.drawText(`iTala Connect · ${index + 1} / ${pages.length}`, {
      x: MARGIN,
      y: 18,
      size: 8,
      font,
      color: MUTED,
    });
  });
  return doc.save();
}
