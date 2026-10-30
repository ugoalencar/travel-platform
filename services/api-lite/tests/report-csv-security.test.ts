import { describe, expect, it } from 'vitest';
import { escapeCsvCell, REPORT_ROW_LIMIT, rowsWithinLimit, toCsv } from '../src/report-csv';

describe('Lite report CSV security', () => {
  it.each([
    ['=1+1', "'=1+1"],
    ['+1+1', "'+1+1"],
    ['-1+1', "'-1+1"],
    ['@SUM(A1)', "'@SUM(A1)"],
    ['-150.5', "'-150.5"],
    ['\tplain', "'\tplain"],
    ['\rplain', '"\'\rplain"'],
    ['\nplain', '"\'\nplain"'],
    ['\t=1', "'\t=1"],
    ['\r=1', '"\'\r=1"'],
    ['\n=1', '"\'\n=1"'],
    ['  =1', "'  =1"],
    [' \t+1', "' \t+1"],
    [' \r-1', '"\' \r-1"'],
    [' \n@SUM(A1)', '"\' \n@SUM(A1)"'],
    ['\uFEFF=1', "'\uFEFF=1"],
    [' \uFEFF @SUM(A1)', "' \uFEFF @SUM(A1)"],
    ['\u00a0+1', "'\u00a0+1"],
    ['=SUM("A",1)', '"\'=SUM(""A"",1)"'],
  ])('neutralizes dangerous text %j', (value, expected) => {
    expect(escapeCsvCell(value)).toBe(expected);
  });

  it('preserves actual numbers and null cells', () => {
    expect(escapeCsvCell(-150.5)).toBe('-150.5');
    expect(escapeCsvCell(0)).toBe('0');
    expect(escapeCsvCell(150.5)).toBe('150.5');
    expect(escapeCsvCell(null)).toBe('');
  });

  it.each(['', 'Example', '2026-10-23', '  plain', 'A+B', "'=1", '\uFEFFplain'])(
    'preserves harmless text %j',
    (value) => {
      expect(escapeCsvCell(value)).toBe(value);
    },
  );

  it('preserves delimiter, quote and embedded newline escaping', () => {
    expect(escapeCsvCell('A,"B"\nC\rD;E')).toBe('"A,""B""\nC\rD;E"');
    expect(escapeCsvCell('A;B')).toBe('"A;B"');
  });

  it('preserves BOM, CRLF, column order and empty results', () => {
    expect(toCsv(['name', 'amount', 'optional'], [])).toBe('\uFEFFname,amount,optional\r\n');
    expect(toCsv(['name', 'amount', 'optional'], [['Example', -150.5, null]]))
      .toBe('\uFEFFname,amount,optional\r\nExample,-150.5,\r\n');
  });

  it('protects headers and rows through the report serializer', () => {
    expect(toCsv(['=name', 'amount'], [['@SUM(A1)', -10], ['A,B', 0]]))
      .toBe('\uFEFF\'=name,amount\r\n\'@SUM(A1),-10\r\n"A,B",0\r\n');
  });
});

describe('Lite report row ceiling', () => {
  it('keeps exactly the ceiling and refuses one row more instead of truncating', () => {
    const rows = (n: number) => Array.from({ length: n }, (_, i) => i);
    expect(rowsWithinLimit(rows(REPORT_ROW_LIMIT), true)).toHaveLength(REPORT_ROW_LIMIT);
    expect(() => rowsWithinLimit(rows(REPORT_ROW_LIMIT + 1), true)).toThrowError(
      expect.objectContaining({ statusCode: 422, code: 'REPORT_TOO_LARGE' }) as Error,
    );
  });

  it('keeps the historical truncation for non-strict (dashboard) callers', () => {
    const rows = Array.from({ length: REPORT_ROW_LIMIT + 1 }, (_, i) => i);
    expect(rowsWithinLimit(rows, false)).toHaveLength(REPORT_ROW_LIMIT);
  });
});
