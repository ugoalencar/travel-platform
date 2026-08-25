import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { buildApp } from '../src/app';
import { UserRole } from '../../../packages/domain/types';
import type { AuthenticatedPrincipal } from '../src/auth';
import { createDatabaseRuntime } from '../src/database';

const repoRoot = resolve(import.meta.dirname, '../../..');
const migration001 = resolve(repoRoot, 'infrastructure/migrations/001_initial_schema.sql');
const migration002 = resolve(repoRoot, 'infrastructure/migrations/002_rls_policies.sql');
const migration003 = resolve(repoRoot, 'infrastructure/migrations/003_transportation.sql');
const migration004 = resolve(repoRoot, 'infrastructure/migrations/004_route_points.sql');
const migration006 = resolve(repoRoot, 'infrastructure/migrations/006_field_operations.sql');
const migration007 = resolve(repoRoot, 'infrastructure/migrations/007_commission_repair.sql');
const migration010 = resolve(repoRoot, 'infrastructure/migrations/010_financial_foundation.sql');
const prepareRolesSql = resolve(repoRoot, 'tests/integration/database/002_prepare_local_roles.sql');
const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.local-postgres.yml');

const projectName = 'travel-platform-sale-routes-postgres';
const containerName = 'travel-platform-postgres-local';
const postgresImage = 'postgres:15';
const databaseHost = process.env.DATABASE_TEST_HOST ?? '127.0.0.1';
const databasePort = Number(process.env.DATABASE_TEST_PORT ?? '55432');
const databaseName = process.env.DATABASE_TEST_NAME ?? 'travel_platform_test';
const adminUser = process.env.DATABASE_TEST_USER ?? 'travel_test';
const adminPassword = process.env.DATABASE_TEST_PASSWORD ?? 'travel_test_password';
const runtimeUser = 'travel_app_runtime_local';
const runtimePassword = 'travel_app_runtime_local_password';
const poolPasswordKey = 'pass' + 'word';

const agencyAId = '10000000-0000-4000-8000-000000000001';
const agencyBId = '20000000-0000-4000-8000-000000000001';
const userAId = '11000000-0000-4000-8000-000000000001';
const userBId = '21000000-0000-4000-8000-000000000001';

const principals: Record<string, AuthenticatedPrincipal> = {
  a: { userId: userAId, agencyId: agencyAId, role: UserRole.ADMIN, email: 'user-a@example.test' },
  b: { userId: userBId, agencyId: agencyBId, role: UserRole.ADMIN, email: 'user-b@example.test' },
  viewer: { userId: userAId, agencyId: agencyAId, role: UserRole.VIEWER, email: 'user-a@example.test' },
  agent: { userId: userAId, agencyId: agencyAId, role: UserRole.AGENT, email: 'user-a@example.test' },
  manager: { userId: userAId, agencyId: agencyAId, role: UserRole.MANAGER, email: 'user-a@example.test' },
  owner: { userId: userAId, agencyId: agencyAId, role: UserRole.OWNER, email: 'user-a@example.test' },
  unknownRole: {
    userId: userAId,
    agencyId: agencyAId,
    role: 'NOT_A_REAL_ROLE' as UserRole,
    email: 'user-a@example.test',
  },
  ownerAgencyB: { userId: userBId, agencyId: agencyBId, role: UserRole.OWNER, email: 'user-b@example.test' },
};

describe.sequential('Sale HTTP routes', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let customerAId: string;
  let customerBId: string;

  beforeAll(async () => {
    assertSafeTestDatabase();
    resetDisposableDatabase();
    await waitForHealthyContainer();
    assertContainerIsLocal();

    adminPool = new Pool({
      host: databaseHost,
      port: databasePort,
      database: databaseName,
      user: adminUser,
      [poolPasswordKey]: adminPassword,
    });
    runtimePool = new Pool({
      host: databaseHost,
      port: databasePort,
      database: databaseName,
      user: runtimeUser,
      [poolPasswordKey]: runtimePassword,
    });

    await resetDatabase(adminPool);
  });

  beforeEach(async () => {
    await adminPool.query('TRUNCATE TABLE payment_allocations RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE payments RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE receivables RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE sales RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE proposals RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE customers RESTART IDENTITY CASCADE');
    customerAId = await seedCustomer(agencyAId, 'Customer A');
    customerBId = await seedCustomer(agencyBId, 'Customer B');
  });

  afterAll(async () => {
    await runtimePool?.end();
    await adminPool?.end();
    compose(['down', '-v']);
  });

  describe('GET /sales', () => {
    it('returns 401 without auth', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({ method: 'GET', url: '/sales' });
      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it('returns only Agency A sales for Agency A', async () => {
      await seedSale(agencyAId, customerAId, { amount: '100.00' });
      await seedSale(agencyBId, customerBId, { amount: '200.00' });

      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'GET',
        url: '/sales',
        headers: { 'x-test-principal': 'a' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ sales: Array<{ agencyId: string }> }>();
      expect(body.sales).toHaveLength(1);
      expect(body.sales[0]?.agencyId).toBe(agencyAId);

      await app.close();
    });
  });

  describe('GET /sales/:id', () => {
    it('returns 200 for own tenant sale', async () => {
      const id = await seedSale(agencyAId, customerAId, { amount: '100.00' });

      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'GET',
        url: `/sales/${id}`,
        headers: { 'x-test-principal': 'a' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ sale: { id: string } }>();
      expect(body.sale.id).toBe(id);

      await app.close();
    });

    it('never returns another tenant sale (404, not 403, no leak)', async () => {
      const bId = await seedSale(agencyBId, customerBId, { amount: '100.00' });

      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'GET',
        url: `/sales/${bId}`,
        headers: { 'x-test-principal': 'a' },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: 'Sale not found', code: 'NOT_FOUND' });

      await app.close();
    });
  });

  describe('POST /sales', () => {
    it('creates a sale under the authenticated tenant with a server-computed total', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/sales',
        headers: { 'x-test-principal': 'agent' },
        payload: { customerId: customerAId, amount: 199.99, discount: 50.50 },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<{ sale: { agencyId: string; amount: number; discount: number; total: number; status: string } }>();
      expect(body.sale.agencyId).toBe(agencyAId);
      expect(body.sale.total).toBe(149.49);
      expect(body.sale.status).toBe('PENDING');

      await app.close();
    });

    it('returns 401 without auth', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/sales',
        payload: { customerId: customerAId, amount: 1 },
      });
      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it('returns 404 when customerId belongs to another tenant', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/sales',
        headers: { 'x-test-principal': 'agent' },
        payload: { customerId: customerBId, amount: 100 },
      });

      expect(response.statusCode).toBe(404);
      await app.close();
    });

    it('rejects attempting a second Sale for the same Proposal cleanly (409, no raw constraint leak)', async () => {
      const proposalId = await seedProposal(agencyAId, customerAId);

      const app = buildTestApp(runtimePool);

      const first = await app.inject({
        method: 'POST',
        url: '/sales',
        headers: { 'x-test-principal': 'agent' },
        payload: { customerId: customerAId, proposalId, amount: 100 },
      });
      expect(first.statusCode).toBe(201);

      const second = await app.inject({
        method: 'POST',
        url: '/sales',
        headers: { 'x-test-principal': 'agent' },
        payload: { customerId: customerAId, proposalId, amount: 50 },
      });
      expect(second.statusCode).toBe(409);
      const body = second.json<{ code: string }>();
      expect(body.code).toBe('CONFLICT');
      expect(JSON.stringify(body)).not.toMatch(/sales_agency_proposal_key/);
      expect(JSON.stringify(body)).not.toMatch(/constraint/i);

      await app.close();
    });

    it.each(['agencyId', 'tenantId', 'id', 'createdAt', 'updatedAt', 'total', 'status', 'userId', 'paidAt'] as const)(
      'rejects forbidden field "%s" with 400',
      async (field) => {
        const app = buildTestApp(runtimePool);
        const response = await app.inject({
          method: 'POST',
          url: '/sales',
          headers: { 'x-test-principal': 'agent' },
          payload: { ...validSalePayload(customerAId), [field]: field === 'total' ? 1 : 'x' },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });

        await app.close();
      },
    );

    it('rejects unknown field with 400', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/sales',
        headers: { 'x-test-principal': 'agent' },
        payload: { ...validSalePayload(customerAId), notARealField: 'x' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });

      await app.close();
    });

    it('rejects a negative amount with 400', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/sales',
        headers: { 'x-test-principal': 'agent' },
        payload: { customerId: customerAId, amount: -10 },
      });

      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('rejects discount greater than amount with 400', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/sales',
        headers: { 'x-test-principal': 'agent' },
        payload: { customerId: customerAId, amount: 100, discount: 150 },
      });

      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('rejects missing amount with 400', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/sales',
        headers: { 'x-test-principal': 'agent' },
        payload: { customerId: customerAId },
      });

      expect(response.statusCode).toBe(400);
      await app.close();
    });
  });

  describe('PATCH /sales/:id', () => {
    it('updates amount/discount for its own tenant and recomputes total', async () => {
      const id = await seedSale(agencyAId, customerAId, { amount: '100.00', discount: '0.00' });

      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'PATCH',
        url: `/sales/${id}`,
        headers: { 'x-test-principal': 'agent' },
        payload: { amount: 200, discount: 20 },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ sale: { total: number } }>();
      expect(body.sale.total).toBe(180);

      await app.close();
    });

    it('never mutates another tenant sale (404, no-op)', async () => {
      const bId = await seedSale(agencyBId, customerBId, { amount: '100.00' });

      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'PATCH',
        url: `/sales/${bId}`,
        headers: { 'x-test-principal': 'agent' },
        payload: { amount: 1 },
      });

      expect(response.statusCode).toBe(404);

      const row = await adminPool.query<{ amount: string }>('SELECT amount FROM sales WHERE id = $1', [bId]);
      expect(row.rows[0]?.amount).toBe('100.00');

      await app.close();
    });

    it.each(['agencyId', 'tenantId', 'id', 'createdAt', 'updatedAt', 'total', 'status', 'userId', 'paidAt', 'customerId', 'proposalId', 'brokerId'] as const)(
      'rejects forbidden field "%s" with 400',
      async (field) => {
        const id = await seedSale(agencyAId, customerAId, { amount: '100.00' });

        const app = buildTestApp(runtimePool);
        const response = await app.inject({
          method: 'PATCH',
          url: `/sales/${id}`,
          headers: { 'x-test-principal': 'agent' },
          payload: { amount: 50, [field]: field === 'total' ? 1 : 'x' },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });

        await app.close();
      },
    );

    it('rejects status via PATCH with 400 (status is fully read-only in this vertical)', async () => {
      const id = await seedSale(agencyAId, customerAId, { amount: '100.00' });

      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'PATCH',
        url: `/sales/${id}`,
        headers: { 'x-test-principal': 'agent' },
        payload: { status: 'PAID' },
      });

      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('rejects unknown field with 400', async () => {
      const id = await seedSale(agencyAId, customerAId, { amount: '100.00' });

      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'PATCH',
        url: `/sales/${id}`,
        headers: { 'x-test-principal': 'agent' },
        payload: { notARealField: 'x' },
      });

      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('rejects a negative amount with 400', async () => {
      const id = await seedSale(agencyAId, customerAId, { amount: '100.00' });

      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'PATCH',
        url: `/sales/${id}`,
        headers: { 'x-test-principal': 'agent' },
        payload: { amount: -1 },
      });

      expect(response.statusCode).toBe(400);
      await app.close();
    });
  });

  describe('Sale lifecycle and receivable integration', () => {
    it('creates a receivable for new positive-total Sales and supports confirm then paid after full allocation', async () => {
      const app = buildTestApp(runtimePool);

      const create = await app.inject({
        method: 'POST',
        url: '/sales',
        headers: { 'x-test-principal': 'agent' },
        payload: validSalePayload(customerAId, { amount: 100, discount: 10 }),
      });
      expect(create.statusCode).toBe(201);
      const sale = create.json<{ sale: { id: string; status: string; total: number; paidAt?: string } }>().sale;
      expect(sale.status).toBe('PENDING');
      expect(sale.total).toBe(90);
      expect(sale.paidAt).toBeUndefined();

      const receivable = await adminPool.query<{ id: string; amount: string; status: string }>(
        'SELECT id, amount, status FROM receivables WHERE agency_id = $1 AND sale_id = $2',
        [agencyAId, sale.id],
      );
      expect(receivable.rows).toHaveLength(1);
      expect(receivable.rows[0]?.amount).toBe('90.00');
      expect(receivable.rows[0]?.status).toBe('OPEN');

      const confirm = await app.inject({
        method: 'POST',
        url: `/sales/${sale.id}/confirm`,
        headers: { 'x-test-principal': 'manager' },
      });
      expect(confirm.statusCode).toBe(200);
      expect(confirm.json<{ sale: { status: string } }>().sale.status).toBe('CONFIRMED');

      const paidTooEarly = await app.inject({
        method: 'POST',
        url: `/sales/${sale.id}/mark-paid`,
        headers: { 'x-test-principal': 'manager' },
      });
      expect(paidTooEarly.statusCode).toBe(409);

      await markReceivableFullyPaid(receivable.rows[0]!.id, '90.00');

      const paid = await app.inject({
        method: 'POST',
        url: `/sales/${sale.id}/mark-paid`,
        headers: { 'x-test-principal': 'manager' },
      });
      expect(paid.statusCode).toBe(200);
      const paidSale = paid.json<{ sale: { status: string; paidAt?: string } }>().sale;
      expect(paidSale.status).toBe('PAID');
      expect(paidSale.paidAt).toBeDefined();

      await app.close();
    });

    it('cancels PENDING Sales without deleting financial history', async () => {
      const saleId = await seedSale(agencyAId, customerAId, { amount: '120.00' });
      await seedReceivableForSale(saleId, customerAId, '120.00');

      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: `/sales/${saleId}/cancel`,
        headers: { 'x-test-principal': 'manager' },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json<{ sale: { status: string } }>().sale.status).toBe('CANCELLED');

      const receivable = await adminPool.query<{ status: string }>(
        'SELECT status FROM receivables WHERE agency_id = $1 AND sale_id = $2',
        [agencyAId, saleId],
      );
      expect(receivable.rows[0]?.status).toBe('CANCELLED');

      await app.close();
    });

    it('rejects invalid transitions and client-supplied status/paidAt changes', async () => {
      const pendingId = await seedSale(agencyAId, customerAId, { amount: '100.00' });
      const paidId = await seedSale(agencyAId, customerAId, { amount: '100.00', status: 'PAID' });

      const app = buildTestApp(runtimePool);

      const paidFromPending = await app.inject({
        method: 'POST',
        url: `/sales/${pendingId}/mark-paid`,
        headers: { 'x-test-principal': 'manager' },
      });
      expect(paidFromPending.statusCode).toBe(409);

      const cancelPaid = await app.inject({
        method: 'POST',
        url: `/sales/${paidId}/cancel`,
        headers: { 'x-test-principal': 'manager' },
      });
      expect(cancelPaid.statusCode).toBe(409);

      const statusPatch = await app.inject({
        method: 'PATCH',
        url: `/sales/${pendingId}`,
        headers: { 'x-test-principal': 'agent' },
        payload: { status: 'PAID', paidAt: '2027-01-01T00:00:00.000Z' },
      });
      expect(statusPatch.statusCode).toBe(400);

      await app.close();
    });

    it('enforces RBAC and tenant isolation on lifecycle actions', async () => {
      const aId = await seedSale(agencyAId, customerAId, { amount: '100.00' });
      const bId = await seedSale(agencyBId, customerBId, { amount: '100.00' });

      const app = buildTestApp(runtimePool);

      const viewerConfirm = await app.inject({
        method: 'POST',
        url: `/sales/${aId}/confirm`,
        headers: { 'x-test-principal': 'viewer' },
      });
      expect(viewerConfirm.statusCode).toBe(403);

      const crossTenant = await app.inject({
        method: 'POST',
        url: `/sales/${bId}/confirm`,
        headers: { 'x-test-principal': 'owner' },
      });
      expect(crossTenant.statusCode).toBe(404);

      await app.close();
    });
  });

  describe('RBAC', () => {
    it('allows VIEWER to GET /sales and GET /sales/:id (list-floor: lower of the two documented rows)', async () => {
      const id = await seedSale(agencyAId, customerAId, { amount: '100.00' });

      const app = buildTestApp(runtimePool);

      const list = await app.inject({
        method: 'GET',
        url: '/sales',
        headers: { 'x-test-principal': 'viewer' },
      });
      expect(list.statusCode).toBe(200);

      const get = await app.inject({
        method: 'GET',
        url: `/sales/${id}`,
        headers: { 'x-test-principal': 'viewer' },
      });
      expect(get.statusCode).toBe(200);

      await app.close();
    });

    it('blocks VIEWER from POST /sales and PATCH /sales/:id with 403', async () => {
      const id = await seedSale(agencyAId, customerAId, { amount: '100.00' });

      const app = buildTestApp(runtimePool);

      const create = await app.inject({
        method: 'POST',
        url: '/sales',
        headers: { 'x-test-principal': 'viewer' },
        payload: validSalePayload(customerAId),
      });
      expect(create.statusCode).toBe(403);
      expect(create.json()).toMatchObject({ code: 'FORBIDDEN' });

      const update = await app.inject({
        method: 'PATCH',
        url: `/sales/${id}`,
        headers: { 'x-test-principal': 'viewer' },
        payload: { amount: 1 },
      });
      expect(update.statusCode).toBe(403);
      expect(update.json()).toMatchObject({ code: 'FORBIDDEN' });

      await app.close();
    });

    it.each(['agent', 'manager', 'owner'] as const)(
      'allows %s to create and update via hierarchy inheritance (Sale write floor is AGENT)',
      async (principalKey) => {
        const app = buildTestApp(runtimePool);

        const create = await app.inject({
          method: 'POST',
          url: '/sales',
          headers: { 'x-test-principal': principalKey },
          payload: validSalePayload(customerAId, { amount: 111 }),
        });
        expect(create.statusCode).toBe(201);
        const createdId = create.json<{ sale: { id: string } }>().sale.id;

        const update = await app.inject({
          method: 'PATCH',
          url: `/sales/${createdId}`,
          headers: { 'x-test-principal': principalKey },
          payload: { amount: 222 },
        });
        expect(update.statusCode).toBe(200);

        await app.close();
      },
    );

    it('fails closed for an unknown/invalid role on both read and write routes', async () => {
      const id = await seedSale(agencyAId, customerAId, { amount: '100.00' });

      const app = buildTestApp(runtimePool);

      const list = await app.inject({
        method: 'GET',
        url: '/sales',
        headers: { 'x-test-principal': 'unknownRole' },
      });
      expect(list.statusCode).toBe(403);

      const get = await app.inject({
        method: 'GET',
        url: `/sales/${id}`,
        headers: { 'x-test-principal': 'unknownRole' },
      });
      expect(get.statusCode).toBe(403);

      const create = await app.inject({
        method: 'POST',
        url: '/sales',
        headers: { 'x-test-principal': 'unknownRole' },
        payload: validSalePayload(customerAId),
      });
      expect(create.statusCode).toBe(403);

      await app.close();
    });

    it('keeps a high role from Agency A blocked from Agency B sales (role does not bypass tenant isolation)', async () => {
      const bId = await seedSale(agencyBId, customerBId, { amount: '100.00' });

      const app = buildTestApp(runtimePool);

      const get = await app.inject({
        method: 'GET',
        url: `/sales/${bId}`,
        headers: { 'x-test-principal': 'owner' },
      });
      expect(get.statusCode).toBe(404);

      const patch = await app.inject({
        method: 'PATCH',
        url: `/sales/${bId}`,
        headers: { 'x-test-principal': 'owner' },
        payload: { amount: 1 },
      });
      expect(patch.statusCode).toBe(404);

      const row = await adminPool.query<{ amount: string }>('SELECT amount FROM sales WHERE id = $1', [bId]);
      expect(row.rows[0]?.amount).toBe('100.00');

      await app.close();
    });

    it('lets Agency B OWNER read only Agency B data, never Agency A', async () => {
      const aId = await seedSale(agencyAId, customerAId, { amount: '100.00' });

      const app = buildTestApp(runtimePool);

      const get = await app.inject({
        method: 'GET',
        url: `/sales/${aId}`,
        headers: { 'x-test-principal': 'ownerAgencyB' },
      });
      expect(get.statusCode).toBe(404);

      await app.close();
    });
  });

  function validSalePayload(customerId: string, overrides: Partial<{ amount: number; discount: number }> = {}) {
    return {
      customerId,
      amount: overrides.amount ?? 100,
      ...(overrides.discount !== undefined ? { discount: overrides.discount } : {}),
    };
  }

  function buildTestApp(pool: Pool) {
    return buildApp({
      authProvider: {
        authenticate(request) {
          const key = request.headers['x-test-principal'];
          return Promise.resolve(typeof key === 'string' ? principals[key] ?? null : null);
        },
      },
      validateUserAgencyAccess(userId, agencyId) {
        return Promise.resolve(
          (userId === userAId && agencyId === agencyAId) ||
            (userId === userBId && agencyId === agencyBId),
        );
      },
      database: createDatabaseRuntime(pool),
    });
  }

  async function seedCustomer(agencyId: string, name: string): Promise<string> {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO customers (agency_id, name, status) VALUES ($1, $2, 'ACTIVE') RETURNING id`,
      [agencyId, name],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error('Failed to seed customer');
    return id;
  }

  async function seedProposal(agencyId: string, customerId: string): Promise<string> {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO proposals (agency_id, customer_id, proposed_price, discount, total)
       VALUES ($1, $2, '100.00', '0.00', '100.00') RETURNING id`,
      [agencyId, customerId],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error('Failed to seed proposal');
    return id;
  }

  async function seedSale(
    agencyId: string,
    customerId: string,
    data: { amount?: string; discount?: string; status?: string },
  ): Promise<string> {
    const userId = agencyId === agencyAId ? userAId : userBId;
    const amount = data.amount ?? '100.00';
    const discount = data.discount ?? '0.00';
    const total = (Number(amount) - Number(discount)).toFixed(2);
    const status = data.status ?? 'PENDING';
    const paidAt = status === 'PAID' ? new Date() : null;
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO sales (agency_id, customer_id, user_id, amount, discount, total, status, paid_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [agencyId, customerId, userId, amount, discount, total, status, paidAt],
    );
    const id = result.rows[0]?.id;
    if (!id) {
      throw new Error('Failed to seed sale');
    }
    return id;
  }

  async function seedReceivableForSale(
    saleId: string,
    customerId: string,
    amount: string,
  ): Promise<string> {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO receivables (agency_id, sale_id, customer_id, description, amount, due_at)
       VALUES ($1, $2, $3, 'Sale receivable', $4, now()) RETURNING id`,
      [agencyAId, saleId, customerId, amount],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error('Failed to seed receivable');
    return id;
  }

  async function markReceivableFullyPaid(receivableId: string, amount: string): Promise<void> {
    const payment = await adminPool.query<{ id: string }>(
      `INSERT INTO payments (agency_id, direction, amount, occurred_at, created_by)
       VALUES ($1, 'IN', $2, now(), $3) RETURNING id`,
      [agencyAId, amount, userAId],
    );
    const paymentId = payment.rows[0]?.id;
    if (!paymentId) throw new Error('Failed to seed payment');

    await adminPool.query(
      `INSERT INTO payment_allocations (agency_id, payment_id, receivable_id, amount)
       VALUES ($1, $2, $3, $4)`,
      [agencyAId, paymentId, receivableId, amount],
    );
    await adminPool.query(
      `UPDATE receivables SET status = 'PAID', updated_at = now() WHERE id = $1`,
      [receivableId],
    );
  }
});

function assertSafeTestDatabase(): void {
  if (!['127.0.0.1', 'localhost'].includes(databaseHost)) {
    throw new Error('Sale route tests require localhost only.');
  }

  if (databasePort !== 55432) {
    throw new Error('Sale route tests require local port 55432.');
  }

  if (!databaseName.includes('test')) {
    throw new Error('Sale route tests require a database name with a test marker.');
  }

  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    const safeHost = ['127.0.0.1', 'localhost'].includes(url.hostname);
    const safeDatabase = url.pathname.replace('/', '').includes('test');
    const safePort = url.port === '55432' || url.port === '';

    if (!safeHost || !safeDatabase || !safePort) {
      throw new Error('Refusing to run sale route tests against unsafe DATABASE_URL.');
    }
  }
}

function resetDisposableDatabase(): void {
  compose(['down', '-v']);
  compose(['up', '-d']);
}

function compose(args: readonly string[]): CommandResult {
  return run('docker', ['compose', '-f', composeFile, '-p', projectName, ...args]);
}

async function waitForHealthyContainer(): Promise<void> {
  const timeoutAt = Date.now() + 120_000;

  while (Date.now() < timeoutAt) {
    const result = run(
      'docker',
      ['inspect', '-f', '{{.State.Health.Status}}', containerName],
      false,
    );

    if (result.stdout.trim() === 'healthy') {
      return;
    }

    await new Promise((resolveWait) => {
      setTimeout(resolveWait, 2_000);
    });
  }

  throw new Error('Local PostgreSQL container did not become healthy in time.');
}

function assertContainerIsLocal(): void {
  const result = run('docker', [
    'ps',
    '--filter',
    `name=${containerName}`,
    '--format',
    '{{.Image}}|{{.Ports}}',
  ]);
  const output = result.stdout.trim();

  expect(output).toContain(postgresImage);
  expect(output).toContain(`${databaseHost}:${databasePort}->5432/tcp`);
}

async function resetDatabase(pool: Pool): Promise<void> {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await pool.query(readSqlForPg(migration001));
  await pool.query(readSqlForPg(migration002));
  await pool.query(readSqlForPg(migration003));
  await pool.query(readSqlForPg(migration004));
  await pool.query(readSqlForPg(migration006));
  await pool.query(readSqlForPg(migration007));
  await pool.query(readSqlForPg(migration010));
  await pool.query(readSqlForPg(prepareRolesSql));
  await seedAgenciesAndUsers(pool);
}

function readSqlForPg(filePath: string): string {
  return readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith('\\'))
    .join('\n');
}

async function seedAgenciesAndUsers(pool: Pool): Promise<void> {
  await pool.query(
    `
      INSERT INTO agencies (id, name, slug, email, plan, status)
      VALUES
        ($1, 'Agency A', 'agency-a-sale-routes-test', 'agency-a@example.test', 'FREE', 'ACTIVE'),
        ($2, 'Agency B', 'agency-b-sale-routes-test', 'agency-b@example.test', 'FREE', 'ACTIVE');
    `,
    [agencyAId, agencyBId],
  );
  await pool.query(
    `
      INSERT INTO users (id, agency_id, email, name, role, password_hash, status)
      VALUES
        ($1, $2, 'user-a@example.test', 'User A', 'ADMIN', 'hash-for-sale-routes-test-only', 'ACTIVE'),
        ($3, $4, 'user-b@example.test', 'User B', 'ADMIN', 'hash-for-sale-routes-test-only', 'ACTIVE');
    `,
    [userAId, agencyAId, userBId, agencyBId],
  );
}

interface CommandResult {
  stdout: string;
  stderr: string;
}

function run(
  command: string,
  args: readonly string[],
  throwOnError = true,
): CommandResult {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 20,
  });

  const stdout = result.stdout.toString();
  const stderr = result.stderr.toString();

  if (throwOnError && result.status !== 0) {
    throw new Error(
      [
        `Command failed: ${command} ${args.join(' ')}`,
        `Exit code: ${result.status ?? 'unknown'}`,
        stdout,
        stderr,
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }

  return { stdout, stderr };
}
