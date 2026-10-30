import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { registerErrorHandler } from '../src/errors';
import {
  escapeCsvCell, isCsvRequest, MAX_CSV_BYTES, MAX_CSV_ROWS, sendReportCsv, toCsv,
} from '../src/report-csv';

describe('report CSV serialization', () => {
  it('quotes delimiters, quotes and line breaks', () => {
    expect(escapeCsvCell('A,"B"\nC')).toBe('"A,""B""\nC"');
  });

  it.each(['=1+1', '+1+1', '-1+1', '@SUM(A1)', '\t=1', '\r=1', '\n=1', '  =1', '\uFEFF=1'])(
    'neutralizes text beginning with formula/control content: %j', (value) => {
      expect(escapeCsvCell(value).replace(/^"/, '')).toMatch(/^'/);
    },
  );

  it('preserves negative numbers, zeros and null values', () => {
    expect(escapeCsvCell(-150.5)).toBe('-150.5');
    expect(escapeCsvCell(0)).toBe('0');
    expect(escapeCsvCell(null)).toBe('');
    expect(escapeCsvCell(undefined)).toBe('');
    expect(escapeCsvCell('2026-10-23')).toBe('2026-10-23');
  });

  it('rejects non-finite numeric values instead of silently corrupting a report', () => {
    expect(() => escapeCsvCell(Number.NaN)).toThrow();
    expect(() => escapeCsvCell(Number.POSITIVE_INFINITY)).toThrow();
  });

  it('writes BOM, CRLF and headers for an empty result', () => {
    expect(toCsv(['name', 'amount'], [])).toBe('\uFEFFname,amount\r\n');
    expect(toCsv(['name', 'amount'], [['Example', 1.5]]))
      .toBe('\uFEFFname,amount\r\nExample,1.5\r\n');
  });

  it('validates the requested format', () => {
    expect(isCsvRequest(undefined)).toBe(false);
    expect(isCsvRequest('csv')).toBe(true);
    expect(isCsvRequest('json')).toBe(false);
    expect(() => isCsvRequest('xml')).toThrow();
    expect(() => isCsvRequest(['csv', 'json'])).toThrow();
  });
});

describe('report CSV edge cases', () => {
  it('quotes CR and CRLF inside a cell without altering them', () => {
    expect(escapeCsvCell('a\rb')).toBe('"a\rb"');
    expect(escapeCsvCell('a\r\nb')).toBe('"a\r\nb"');
  });

  it.each(['\tabc', '\rabc', '\nabc', '\t', '\r\n'])(
    'prefixes tab/CR/LF-leading text even without a formula: %j',
    (value) => {
      const cell = escapeCsvCell(value);
      expect(cell.replace(/^"/, '').startsWith("'")).toBe(true);
    },
  );

  it('does not touch dangerous characters that are not at the start', () => {
    expect(escapeCsvCell('a=1+1')).toBe('a=1+1');
    expect(escapeCsvCell('x-@y')).toBe('x-@y');
  });

  it('combines formula neutralization with quote, comma and line-break escaping', () => {
    expect(escapeCsvCell('=HYPERLINK("http://x","y"),\nz'))
      .toBe('"\'=HYPERLINK(""http://x"",""y""),\nz"');
    expect(escapeCsvCell('@a,b')).toBe('"\'@a,b"');
    expect(escapeCsvCell('-"q"')).toBe('"\'-""q"""');
  });

  it('escapes headers like any other cell', () => {
    expect(toCsv(['=bad', 'a,b'], [])).toBe('﻿\'=bad,"a,b"\r\n');
  });
});

describe('sendReportCsv', () => {
  const apps: FastifyInstance[] = [];
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  async function appWith(filename: string, rows: readonly (readonly (string | number)[])[]) {
    const app = Fastify();
    apps.push(app);
    registerErrorHandler(app);
    app.get('/r', (_request, reply) => sendReportCsv(reply, filename, ['a'], rows));
    await app.ready();
    return app;
  }

  it.each([
    '../x.csv', '..\\x.csv', 'a/b.csv', 'a"b.csv', 'a b.csv', 'A.csv', 'x.CSV', 'x.csv.exe',
    'x.csv\r\nSet-Cookie: a=b', 'x\u0000.csv', '.csv', 'x', '',
  ])('rejects malicious or malformed filename %j with a handled 400', async (filename) => {
    const response = await (await appWith(filename, [])).inject('/r');
    expect(response.statusCode).toBe(400);
    expect(response.headers['content-disposition']).toBeUndefined();
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('accepts exactly the row ceiling', async () => {
    const rows = Array.from({ length: MAX_CSV_ROWS }, (_, i) => [i]);
    const response = await (await appWith('ok.csv', rows)).inject('/r');
    expect(response.statusCode).toBe(200);
    expect(response.body.split('\r\n')).toHaveLength(MAX_CSV_ROWS + 2); // header + rows + trailing empty
  });

  it('refuses to truncate: more rows than the ceiling is a clear 422 with no partial file', async () => {
    const rows = Array.from({ length: MAX_CSV_ROWS + 1 }, (_, i) => [i]);
    const response = await (await appWith('big.csv', rows)).inject('/r');
    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ code: 'REPORT_TOO_LARGE' });
    expect(response.json<{ error: string }>().error).toContain(String(MAX_CSV_ROWS));
    expect(response.headers['content-disposition']).toBeUndefined();
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.headers['cache-control']).toBe('private, no-store');
  });

  it('refuses a payload above the byte ceiling even with few rows', async () => {
    const cell = 'x'.repeat(1024 * 1024);
    const rows = Array.from({ length: Math.ceil(MAX_CSV_BYTES / cell.length) + 1 }, () => [cell]);
    const response = await (await appWith('wide.csv', rows)).inject('/r');
    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ code: 'REPORT_TOO_LARGE' });
    expect(response.headers['content-disposition']).toBeUndefined();
  });
});

describe('toCsv byte ceiling', () => {
  it('returns null as soon as the ceiling is crossed and the full text otherwise', () => {
    const rows = [['a'.repeat(100)], ['b'.repeat(100)]];
    expect(toCsv(['h'], rows, 150)).toBeNull();
    expect(toCsv(['h'], rows, 1000)).toBe(`﻿h\r\n${'a'.repeat(100)}\r\n${'b'.repeat(100)}\r\n`);
  });
});
