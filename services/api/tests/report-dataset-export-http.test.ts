import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runWithTenantContext } from '../../../packages/domain/tenant-context';
import { UserRole } from '../../../packages/domain/types';
import type { DatabaseRuntime } from '../src/database';
import { registerErrorHandler } from '../src/errors';
import { registerReportsRoutes } from '../src/routes/reports';

const agencyId = '10000000-0000-4000-8000-000000000001';
const apps: FastifyInstance[] = [];

async function makeApp(role: UserRole) {
  const query = vi.fn((sql: string, _values?: readonly unknown[]) => {
    if (sql.startsWith('SELECT')) {
      return Promise.resolve({ rows: [{ sale_id: 'sale-1', customer_name: '=SUM(A1)', total: '250.00' }] });
    }
    return Promise.resolve({ rows: [] });
  });
  const database = {
    withTenantTransaction: vi.fn((operation: (client: { query: typeof query }) => Promise<unknown>) => operation({ query })),
  } as unknown as DatabaseRuntime;
  const app = Fastify();
  apps.push(app);
  registerErrorHandler(app);
  app.addHook('onRequest', (_request, _reply, done) => {
    runWithTenantContext({ agencyId, userId: 'owner-1', userRole: role, email: 'owner@example.test' }, done);
  });
  registerReportsRoutes(app, { database, protectedHooks: [] });
  await app.ready();
  return { app, database, query };
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map(app => app.close()));
});

describe('configurable report export HTTP routes', () => {
  it('returns an allowlisted catalog to OWNER without caching it', async () => {
    const { app } = await makeApp(UserRole.OWNER);
    const response = await app.inject('/reports/export/catalog');

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.json()).toMatchObject({ datasets: [
      { id: 'sales' }, { id: 'customers' }, { id: 'receivables' },
      { id: 'payables' }, { id: 'expenses' }, { id: 'agency_revenue' },
    ] });
  });

  it('runs within tenant context, neutralizes formulas, and audits without values', async () => {
    const { app, query } = await makeApp(UserRole.OWNER);
    const response = await app.inject({
      method: 'POST', url: '/reports/export',
      payload: {
        dataset: 'sales', from: '2026-10-01', to: '2026-10-31',
        columns: ['sale_id', 'customer_name', 'total'], filters: { customerId: 'customer-1' },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.body).toContain("'=SUM(A1)");
    expect(response.body).toContain('sale-1');
    const select = query.mock.calls.find(([sql]) => sql.startsWith('SELECT'))!;
    expect(select[1]).toEqual([agencyId, '2026-10-01', '2026-11-01', 'customer-1']);
    const audit = query.mock.calls.find(([sql]) => sql.includes('INSERT INTO audit_logs'))!;
    expect(audit[1]?.[3]).toBe('REPORT_EXPORTED');
    expect(String(audit[1]?.[7])).not.toContain('owner@example.test');
    expect(String(audit[1]?.[7])).not.toContain('customer-1');
  });

  it('denies non-OWNER before querying and rejects unrecognized request fields', async () => {
    const manager = await makeApp(UserRole.MANAGER);
    const request = {
      dataset: 'sales', from: '2026-10-01', to: '2026-10-31', columns: ['sale_id'], filters: {},
    };
    expect((await manager.app.inject({ method: 'POST', url: '/reports/export', payload: request })).statusCode).toBe(403);
    expect(manager.query).not.toHaveBeenCalled();

    const owner = await makeApp(UserRole.OWNER);
    expect((await owner.app.inject({ method: 'POST', url: '/reports/export', payload: { ...request, agencyId } })).statusCode).toBe(400);
    expect(owner.query).not.toHaveBeenCalled();
  });
});
