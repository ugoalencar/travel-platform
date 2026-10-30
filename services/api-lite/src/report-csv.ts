import { HttpError } from './errors';

/**
 * Row ceiling for report queries and CSV exports. Queries fetch one row more
 * than this so an oversized export is detected and refused with a clear 422
 * instead of being cut short silently.
 */
export const REPORT_ROW_LIMIT = 50_000;

export function rowsWithinLimit<T>(rows: T[], strict: boolean): T[] {
  if (rows.length <= REPORT_ROW_LIMIT) return rows;
  if (strict) {
    throw new HttpError(422, 'REPORT_TOO_LARGE', `O relatório excede o limite de exportação (${REPORT_ROW_LIMIT} linhas). Refine os filtros e tente novamente.`);
  }
  return rows.slice(0, REPORT_ROW_LIMIT);
}

export function escapeCsvCell(value: string | number | null): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value);
  // Protect text even when a spreadsheet discards leading whitespace.
  const text = /^[\t\r\n]/.test(value) || /^[\s\uFEFF]*[=+\-@]/.test(value) ? `'${value}` : value;
  return /[";\n\r,]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers: string[], rows: Array<Array<string | number | null>>): string {
  const lines = [headers.map(escapeCsvCell).join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeCsvCell).join(','));
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
