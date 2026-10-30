import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from './api';

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

const csv = (headers: Record<string, string>, body = '﻿a,b\r\n') =>
  new Response(body, { status: 200, headers: { 'content-type': 'text/csv; charset=utf-8', ...headers } });

describe('api.downloadCsv', () => {
  it('requests format=csv on the same filtered path and returns the blob with the server filename', async () => {
    fetchMock.mockResolvedValue(csv({ 'content-disposition': 'attachment; filename="vendas-customer.csv"' }));

    const result = await api.downloadCsv('/reports/sales?groupBy=customer');

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url as string).toMatch(/\/api\/reports\/sales\?groupBy=customer&format=csv$/);
    expect(new Headers(init?.headers).has('Content-Type')).toBe(false);
    expect(result.filename).toBe('vendas-customer.csv');
    // Response uses the fetch runtime's Blob, which can differ from jsdom's constructor.
    expect(result.blob.type).toContain('text/csv');
    expect(result.blob.size).toBe(new TextEncoder().encode('﻿a,b\r\n').length);
  });

  it('starts the query string when the path has no filters', async () => {
    fetchMock.mockResolvedValue(csv({ 'content-disposition': 'attachment; filename="payables-aging.csv"' }));
    await api.downloadCsv('/reports/financial/payables-aging');
    expect(fetchMock.mock.calls[0]![0] as string).toMatch(/payables-aging\?format=csv$/);
  });

  it('ignores a suspicious filename from the response and falls back', async () => {
    fetchMock.mockResolvedValue(csv({ 'content-disposition': 'attachment; filename="../../evil.exe"' }));
    expect((await api.downloadCsv('/reports/sales')).filename).toBe('relatorio.csv');
  });

  it('surfaces the sanitized API error for an oversized export', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Relatório grande demais.', code: 'REPORT_TOO_LARGE' }), {
        status: 422,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await expect(api.downloadCsv('/reports/sales')).rejects.toMatchObject({
      status: 422,
      code: 'REPORT_TOO_LARGE',
      message: 'Relatório grande demais.',
    });
  });

  it('rejects a non-CSV success response instead of saving it', async () => {
    fetchMock.mockResolvedValue(
      new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } }),
    );
    await expect(api.downloadCsv('/reports/sales')).rejects.toBeInstanceOf(ApiError);
  });
});
