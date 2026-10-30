import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { runWithTenantContext } from '../../../packages/domain/tenant-context';
import { UserRole } from '../../../packages/domain/types';
import type { DatabaseRuntime, TenantTransactionClient } from '../src/database';
import { registerReportProjectionRoutes } from '../src/routes/report-projections';
import { parseProjectionFilters } from '../src/report-projections-service';
import { registerAllRoutes } from '../src/route-inventory';
import { clearRouteRegistry, getRegisteredRoutes, RouteClassification } from '../src/route-classification';

vi.mock('../src/permission-restrictions', () => ({ assertNotRestricted: vi.fn() }));
vi.mock('../src/area-grants', () => ({ requireRoleOrAreaGrant: vi.fn() }));
vi.mock('../src/commission-release-service', () => ({ computeEntryRelease: vi.fn(() => Promise.resolve({ released: 30, paid: 10 })) }));

describe('D9 shared projection filters and CSV', () => {
  it('classifies projection, batch, import, dashboard and backup routes with their server role floors', () => {
    clearRouteRegistry();
    registerAllRoutes();
    for (const [method, path, role] of [
      ['GET','/reports/receivables-projection','MANAGER'], ['GET','/reports/revenue-forecast','MANAGER'],
      ['GET','/reports/supplier-balances','MANAGER'], ['GET','/reports/commissions-projection','MANAGER'],
      ['GET','/dashboard/widgets','VIEWER'], ['GET','/settings/dashboard','ADMIN'], ['PUT','/settings/dashboard','ADMIN'],
      ['POST','/imports/sales/dry-run','MANAGER'], ['POST','/imports/sales/confirm','MANAGER'],
      ['GET','/agency-revenue/settlement-policy','MANAGER'], ['PUT','/agency-revenue/settlement-policy','ADMIN'],
      ['GET','/agency-revenue/batches','MANAGER'], ['POST','/agency-revenue/batches/close','ADMIN'], ['POST','/agency-revenue/batches/:id/receive','ADMIN'],
      ['GET','/settings/backup/status','OWNER'], ['POST','/settings/backup/export','OWNER'],
      ['POST','/settings/backup/verify','OWNER'], ['POST','/settings/backup/restore','OWNER'],
      ['PUT','/settings/backup/schedule','OWNER'],
      ['POST','/settings/backup/runs/:runId/download','OWNER'], ['POST','/settings/backup/runs/:runId/verify','OWNER'], ['POST','/settings/backup/runs/:runId/restore','OWNER'],
      ['GET','/reports/export/catalog','OWNER'], ['POST','/reports/export','OWNER'],
    ]) {
      const routes = getRegisteredRoutes().filter(route => route.method === method && route.path === path);
      expect(routes, `${method} ${path}`).toHaveLength(1);
      expect(routes[0]).toMatchObject({ role, classification: RouteClassification.STAFF_SCOPED, authPipeline: 'protectedHooks' });
    }
    clearRouteRegistry();
  });
  it('applies every filter to every report and uses identical query parameters for CSV', async () => {
    const query = vi.fn((sql: string, _params?: readonly unknown[]) => {
      if (sql.includes('FROM agency_revenue_entries e')) return Promise.resolve({ rows: [{ id: 'revenue', supplier_id: 'supplier', status: 'AVAILABLE', amount: '70', received_amount: null, entitled_on: '2026-01-10', expected_on: '2026-03-15' }] });
      if (sql.includes('FROM commission_entries ce')) return Promise.resolve({ rows: [{ id: 'commission', amount: '100', status: 'APPROVED' }] });
      return Promise.resolve({ rows: [] });
    });
    const client = { query } as unknown as TenantTransactionClient;
    const database = { withTenantTransaction: async <T>(fn: (client: TenantTransactionClient) => Promise<T>) => fn(client) } as DatabaseRuntime;
    const app = Fastify();
    registerReportProjectionRoutes(app, { database, protectedHooks: [] });
    const filters = { saleFrom: '2026-01-01', saleTo: '2026-12-31', travelFrom: '2026-02-01', travelTo: '2026-02-28', origin: 'Origem', destination: 'Destino', categoryId: 'category', supplierId: 'supplier', employeeId: 'employee', status: 'CONFIRMED' };
    try {
      await runWithTenantContext({ agencyId: 'agency-A', userId: 'owner', userRole: UserRole.OWNER, email: 'owner@example.test' }, async () => {
        for (const path of ['receivables-projection', 'revenue-forecast', 'supplier-balances', 'commissions-projection']) {
          const url = `/reports/${path}?${new URLSearchParams(filters)}`;
          query.mockClear();
          const json = await app.inject({ url });
          expect(json.statusCode).toBe(200);
          const calls = query.mock.calls.map(([sql, params]) => ({ sql, params }));
          const main = calls.find(call => call.sql.includes('JOIN sales s'))!;
          expect(main.sql).toMatch(/s\.sale_date>=/);
          expect(main.sql).toMatch(/s\.sale_date<=/);
          expect(main.sql).toMatch(/s\.travel_start_date>=/);
          expect(main.sql).toMatch(/s\.travel_start_date<=/);
          expect(main.sql).toContain('s.origin_text ILIKE');
          expect(main.sql).toContain('s.destination_text ILIKE');
          expect(main.sql).toContain('s.category_id=');
          expect(main.sql).toContain('fi.supplier_id=');
          expect(main.sql).toContain('fc.employee_id=');
          expect(main.sql).toContain('s.status::text=');
          expect(main.params).toEqual(expect.arrayContaining(['agency-A', ...Object.values(filters).filter(value => !['Origem', 'Destino'].includes(value)), '%Origem%', '%Destino%']));
          query.mockClear();
          const csv = await app.inject({ url: `${url}&format=csv` });
          expect(csv.statusCode).toBe(200);
          expect(csv.headers['content-type']).toContain('text/csv');
          expect(query.mock.calls.map(([sql, params]) => ({ sql, params }))).toEqual(calls);
          if (path === 'revenue-forecast') {
            expect(json.json<{ contracted: { byMonth: unknown }; totals: unknown }>().contracted.byMonth).toEqual([{ month: '2026-03', amount: 70 }]);
            expect(json.json<{ totals: unknown }>().totals).toEqual({ forecast: 70, released: 70, paid: 0 });
            expect(csv.body).toContain('2026-03-15,70,70,0');
          }
          if (path === 'commissions-projection') expect(csv.body).toContain('100,30,10,20,70');
        }
      });
    } finally { await app.close(); }
  });

  it('rejects invalid dates, ranges and unknown tenant selectors', () => {
    for (const input of [{ saleFrom: '2026-02-30' }, { travelFrom: '2026-03-01', travelTo: '2026-02-01' }, { agencyId: 'other' }]) {
      expect(() => parseProjectionFilters(input)).toThrow();
    }
  });
});
