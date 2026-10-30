import type { FastifyReply } from 'fastify';
import { ValidationError } from './errors';

type CsvValue = string | number | null | undefined;

/**
 * Conservative export ceilings. Reports are built in memory and sent as one
 * body, so an oversized export fails with a clear 422 instead of being cut
 * short or exhausting memory. Narrow the date range or grouping to export less.
 */
export const MAX_CSV_ROWS = 50_000;
export const MAX_CSV_BYTES = 10 * 1024 * 1024;

export function escapeCsvCell(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new ValidationError('Report contains an invalid numeric value');
    return String(value);
  }
  // Protect textual cells even when a spreadsheet discards leading whitespace.
  const safe = /^[\t\r\n]/.test(value) || /^[\s\uFEFF]*[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(headers: readonly string[], rows: readonly (readonly CsvValue[])[]): string;
export function toCsv(
  headers: readonly string[],
  rows: readonly (readonly CsvValue[])[],
  maxBytes: number,
): string | null;
export function toCsv(
  headers: readonly string[],
  rows: readonly (readonly CsvValue[])[],
  maxBytes = Number.POSITIVE_INFINITY,
): string | null {
  const lines = [headers.map(escapeCsvCell).join(',')];
  // Stop serializing as soon as the byte ceiling is crossed; the oversized body is never built.
  let bytes = Buffer.byteLength(lines[0]!, 'utf8');
  for (const row of rows) {
    const line = row.map(escapeCsvCell).join(',');
    bytes += Buffer.byteLength(line, 'utf8') + 2;
    if (bytes > maxBytes) return null;
    lines.push(line);
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export function isCsvRequest(format: unknown): boolean {
  if (format === undefined || format === 'json') return false;
  if (format === 'csv') return true;
  throw new ValidationError('Field "format" must be csv or json');
}

export function sendReportCsv(
  reply: FastifyReply,
  filename: string,
  headers: readonly string[],
  rows: readonly (readonly CsvValue[])[],
): FastifyReply {
  if (!/^[a-z0-9-]+\.csv$/.test(filename)) throw new ValidationError('Invalid report filename');
  const tooLarge = () =>
    reply
      .code(422)
      .header('cache-control', 'private, no-store')
      .send({
        error: `O relatório excede o limite de exportação (${MAX_CSV_ROWS} linhas ou ${MAX_CSV_BYTES / 1024 / 1024} MB). Refine os filtros e tente novamente.`,
        code: 'REPORT_TOO_LARGE',
      });
  if (rows.length > MAX_CSV_ROWS) return tooLarge();
  const body = toCsv(headers, rows, MAX_CSV_BYTES);
  if (body === null) return tooLarge();
  return reply
    .header('content-type', 'text/csv; charset=utf-8')
    .header('content-disposition', `attachment; filename="${filename}"`)
    .header('cache-control', 'private, no-store')
    .header('x-content-type-options', 'nosniff')
    .send(body);
}
