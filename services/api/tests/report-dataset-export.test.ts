import { describe, expect, it } from 'vitest';
import {
  compileDatasetExport,
  getReportExportCatalog,
  parseDatasetExportRequest,
} from '../src/report-dataset-export';

const agencyId = '10000000-0000-4000-8000-000000000001';

describe('configurable report export catalog', () => {
  it('exposes only the approved operational and financial datasets', () => {
    expect(getReportExportCatalog().map(dataset => dataset.id)).toEqual([
      'sales', 'customers', 'receivables', 'payables', 'expenses', 'agency_revenue',
    ]);
  });

  it('builds a parameterized sales export with customer relation and allowlisted filters', () => {
    const compiled = compileDatasetExport({
      dataset: 'sales',
      from: '2026-10-01',
      to: '2026-10-31',
      columns: ['sale_id', 'customer_name', 'seller_name', 'total', 'status'],
      filters: { statuses: ['CONFIRMED', 'PAID'], customerId: 'customer-1' },
    }, agencyId);

    expect(compiled.sql).toContain('LEFT JOIN public.customers');
    expect(compiled.sql).toContain('s.agency_id = $1');
    expect(compiled.sql).toContain('= ANY(');
    expect(compiled.sql).toContain('s.customer_id =');
    expect(compiled.values).toEqual([
      agencyId, '2026-10-01', '2026-11-01', ['CONFIRMED', 'PAID'], 'customer-1',
    ]);
    expect(compiled.headers).toEqual(['Venda (ID)', 'Cliente', 'Vendedor', 'Total da venda', 'Situação']);
  });

  it('relates payables to the customer through the sale without exposing raw table selection', () => {
    const compiled = compileDatasetExport({
      dataset: 'payables', from: '2026-01-01', to: '2026-01-31',
      columns: ['payable_id', 'customer_name', 'supplier_name', 'amount'],
      filters: { statuses: ['OPEN'] },
    }, agencyId);

    expect(compiled.sql).toContain('LEFT JOIN public.sales');
    expect(compiled.sql).toContain('LEFT JOIN public.customers');
    expect(compiled.sql).toContain('LEFT JOIN public.suppliers');
  });

  it('rejects arbitrary dataset names, columns, filters, tenant IDs, malformed dates, and empty selections', () => {
    const valid = {
      dataset: 'sales', from: '2026-10-01', to: '2026-10-31', columns: ['sale_id'], filters: {},
    };
    expect(() => parseDatasetExportRequest({ ...valid, dataset: 'sales; DROP TABLE users' })).toThrow();
    expect(() => parseDatasetExportRequest({ ...valid, columns: ['sales.agency_id'] })).toThrow();
    expect(() => parseDatasetExportRequest({ ...valid, filters: { agencyId } })).toThrow();
    expect(() => parseDatasetExportRequest({ ...valid, tenantId: agencyId })).toThrow();
    expect(() => parseDatasetExportRequest({ ...valid, from: '2026-02-30' })).toThrow();
    expect(() => parseDatasetExportRequest({ ...valid, columns: [] })).toThrow();
    expect(() => parseDatasetExportRequest({ ...valid, filters: { statuses: ['OPEN;--'] } })).toThrow();
  });

  it('keeps user strings in bound values and limits date ranges and free-text searches', () => {
    const search = "' OR 1=1 --";
    const compiled = compileDatasetExport({
      dataset: 'customers', from: '2026-01-01', to: '2026-12-31',
      columns: ['customer_name', 'email'], filters: { search },
    }, agencyId);

    expect(compiled.sql).not.toContain(search);
    expect(compiled.values).toContain(`%${search}%`);
    expect(() => parseDatasetExportRequest({
      dataset: 'customers', from: '2000-01-01', to: '2026-12-31', columns: ['customer_name'], filters: {},
    })).toThrow(/range/i);
    expect(() => parseDatasetExportRequest({
      dataset: 'customers', from: '2026-01-01', to: '2026-12-31', columns: ['customer_name'], filters: { search: 'x'.repeat(300) },
    })).toThrow();
  });
});
