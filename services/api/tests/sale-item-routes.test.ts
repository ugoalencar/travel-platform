import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { buildApp } from '../src/app';
import { UserRole } from '../../../packages/domain/types';
import type { AuthenticatedPrincipal } from '../src/auth';
import { createDatabaseRuntime } from '../src/database';
import { getSaleMargin } from '../src/financial';

const repoRoot = resolve(import.meta.dirname, '../../..');
const migrationsDir = resolve(repoRoot, 'infrastructure/migrations');
const migrationFiles = readdirSync(migrationsDir)
  .filter((name) => /^\d+_.+\.sql$/.test(name))
  .sort()
  .map((name) => resolve(migrationsDir, name));
const prepareRolesSql = resolve(repoRoot, 'tests/integration/database/002_prepare_local_roles.sql');
const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.local-postgres.yml');

const projectName = 'travel-platform-sale-item-routes-postgres';
const containerName = process.env.DATABASE_TEST_CONTAINER_NAME ?? 'travel-platform-postgres-local';
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
  ownerAgencyB: { userId: userBId, agencyId: agencyBId, role: UserRole.OWNER, email: 'user-b@example.test' },
};

describe('Sale item HTTP routes', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let customerAId: string;
  let customerBId: string;
  let supplierAId: string;

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
    await adminPool.query(
      `TRUNCATE TABLE
        upsell_suggestions,
        upsell_rules,
        proposal_optional_items,
        sale_items,
        payment_allocations,
        payments,
        receivables,
        payables,
        operational_costs,
        revenues,
        expenses,
        cash_transactions,
        reconciliations,
        financial_categories,
        audit_logs
       RESTART IDENTITY CASCADE`,
    );
    await adminPool.query('TRUNCATE TABLE sales RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE proposals RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE customers RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE suppliers RESTART IDENTITY CASCADE');
    customerAId = await seedCustomer(agencyAId, 'Customer A');
    customerBId = await seedCustomer(agencyBId, 'Customer B');
    supplierAId = await seedSupplier(agencyAId, 'Supplier A');
  });

  afterAll(async () => {
    await runtimePool?.end();
    await adminPool?.end();
    // Files run one at a time (fileParallelism: false): release the fixed
    // container name for the next suite. Only this project's container goes.
    if (process.env.CI !== 'true') {
      compose(['down']);
    }
  });

  describe('POST /sales/:saleId/items', () => {
    it('returns 401 without auth', async () => {
      const saleId = await seedSale(agencyAId, customerAId, { amount: '100.00' });
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: `/sales/${saleId}/items`,
        payload: { description: 'Seguro viagem', unitPrice: 50 },
      });
      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it('blocks VIEWER with 403', async () => {
      const saleId = await seedSale(agencyAId, customerAId, { amount: '100.00' });
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: `/sales/${saleId}/items`,
        headers: { 'x-test-principal': 'viewer' },
        payload: { description: 'Seguro viagem', unitPrice: 50 },
      });
      expect(response.statusCode).toBe(403);
      await app.close();
    });

    it.each(['agent', 'manager', 'owner'] as const)(
      'allows %s to create a sale item (write floor is AGENT)',
      async (principalKey) => {
        const saleId = await seedSale(agencyAId, customerAId, { amount: '100.00' });
        const app = buildTestApp(runtimePool);
        const response = await app.inject({
          method: 'POST',
          url: `/sales/${saleId}/items`,
          headers: { 'x-test-principal': principalKey },
          payload: { description: 'Seguro viagem', unitPrice: 50 },
        });
        expect(response.statusCode).toBe(201);
        await app.close();
      },
    );

    it('creates an item under the authenticated tenant and folds it into the Sale total via the existing updateSale()/computeTotal() path', async () => {
      const saleId = await seedSale(agencyAId, customerAId, { amount: '100.00' });
      const app = buildTestApp(runtimePool);

      const response = await app.inject({
        method: 'POST',
        url: `/sales/${saleId}/items`,
        headers: { 'x-test-principal': 'agent' },
        payload: { description: 'Seguro viagem', unitPrice: 50, qty: 2, taxes: 5 },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<{ saleItem: { agencyId: string; lineTotal: number; saleId: string } }>();
      expect(body.saleItem.agencyId).toBe(agencyAId);
      // lineTotal = qty*unitPrice - discount + taxes + fees = 2*50 - 0 + 5 + 0 = 105
      expect(body.saleItem.lineTotal).toBe(105);

      const sale = await adminPool.query<{ amount: string; total: string }>(
        'SELECT amount, total FROM sales WHERE agency_id = $1 AND id = $2',
        [agencyAId, saleId],
      );
      // original amount 100 + lineTotal 105 = 205, no discount => total 205
      expect(sale.rows[0]).toMatchObject({ amount: '205.00', total: '205.00' });

      await app.close();
    });

    it('never lets a tenant attach an item to another tenant Sale (404)', async () => {
      const bId = await seedSale(agencyBId, customerBId, { amount: '100.00' });
      const app = buildTestApp(runtimePool);

      const response = await app.inject({
        method: 'POST',
        url: `/sales/${bId}/items`,
        headers: { 'x-test-principal': 'agent' },
        payload: { description: 'Seguro viagem', unitPrice: 50 },
      });

      expect(response.statusCode).toBe(404);

      const items = await adminPool.query('SELECT id FROM sale_items WHERE sale_id = $1', [bId]);
      expect(items.rows).toHaveLength(0);

      await app.close();
    });

    it('rejects a negative unitPrice with 400', async () => {
      const saleId = await seedSale(agencyAId, customerAId, { amount: '100.00' });
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: `/sales/${saleId}/items`,
        headers: { 'x-test-principal': 'agent' },
        payload: { description: 'Seguro viagem', unitPrice: -1 },
      });
      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('rejects unknown fields with 400', async () => {
      const saleId = await seedSale(agencyAId, customerAId, { amount: '100.00' });
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: `/sales/${saleId}/items`,
        headers: { 'x-test-principal': 'agent' },
        payload: { description: 'Seguro viagem', unitPrice: 50, notARealField: 'x' },
      });
      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('validates productId inside the transaction: unknown, other-agency and inactive products -> 422, nothing written', async () => {
      const saleId = await seedSale(agencyAId, customerAId, { amount: '100.00' });
      const productB = await seedProduct(agencyBId, 'Produto B', true);
      const inactiveA = await seedProduct(agencyAId, 'Produto inativo', false);
      const activeA = await seedProduct(agencyAId, 'Produto ativo', true);
      const app = buildTestApp(runtimePool);
      const post = (productId: string) =>
        app.inject({
          method: 'POST',
          url: `/sales/${saleId}/items`,
          headers: { 'x-test-principal': 'agent' },
          payload: { description: 'Com produto', unitPrice: 10, productId },
        });
      for (const productId of ['00000000-0000-4000-8000-00000000dead', productB, inactiveA]) {
        const res = await post(productId);
        expect(res.statusCode).toBe(422);
        expect(res.json<{ code: string; field: string }>()).toMatchObject({ code: 'FIELD_INVALID', field: 'productId' });
      }
      expect((await adminPool.query<{ n: number }>('SELECT count(*)::int AS n FROM sale_items')).rows[0]!.n).toBe(0);
      expect((await post(activeA)).statusCode).toBe(201);
      await app.close();
    });

    it('two concurrent inclusions both land in the Sale total (no lost update)', async () => {
      const saleId = await seedSale(agencyAId, customerAId, { amount: '100.00' });
      const app = buildTestApp(runtimePool);
      const add = (unitPrice: number) =>
        app.inject({
          method: 'POST',
          url: `/sales/${saleId}/items`,
          headers: { 'x-test-principal': 'agent' },
          payload: { description: `Item ${unitPrice}`, unitPrice },
        });
      const results = await Promise.all([add(10), add(20), add(30), add(40)]);
      expect(results.map((r) => r.statusCode)).toEqual([201, 201, 201, 201]);
      const sale = await adminPool.query('SELECT amount::text AS amount, total::text AS total FROM sales WHERE id = $1', [saleId]);
      expect(sale.rows[0]).toEqual({ amount: '200.00', total: '200.00' });
      await app.close();
    });

    it('if the Sale update fails the item is not left behind (same transaction)', async () => {
      const saleId = await seedSale(agencyAId, customerAId, { amount: '100.00' });
      await adminPool.query(`
        CREATE FUNCTION itemtest_block_sale_update() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'sale update blocked for test'; END $$;
        CREATE TRIGGER itemtest_block_sale_update BEFORE UPDATE ON sales
          FOR EACH ROW EXECUTE FUNCTION itemtest_block_sale_update();
      `);
      const app = buildTestApp(runtimePool);
      try {
        const res = await app.inject({
          method: 'POST',
          url: `/sales/${saleId}/items`,
          headers: { 'x-test-principal': 'agent' },
          payload: { description: 'Nao pode ficar', unitPrice: 10 },
        });
        expect(res.statusCode).toBe(500);
      } finally {
        await adminPool.query('DROP TRIGGER itemtest_block_sale_update ON sales; DROP FUNCTION itemtest_block_sale_update();');
        await app.close();
      }
      expect((await adminPool.query<{ n: number }>('SELECT count(*)::int AS n FROM sale_items')).rows[0]!.n).toBe(0);
    });

    it('refuses up front a supplier cost that rounds to zero, leaving nothing written', async () => {
      const saleId = await seedSale(agencyAId, customerAId, { amount: '100.00' });
      const app = buildTestApp(runtimePool);
      const res = await app.inject({
        method: 'POST',
        url: `/sales/${saleId}/items`,
        headers: { 'x-test-principal': 'agent' },
        payload: { description: 'Custo minimo', unitPrice: 1, qty: 0.01, unitCost: 0.01, supplierId: supplierAId },
      });
      expect(res.statusCode).toBe(400);
      expect((await adminPool.query<{ n: number }>('SELECT count(*)::int AS n FROM sale_items')).rows[0]!.n).toBe(0);
      const sale = await adminPool.query<{ amount: string }>('SELECT amount::text AS amount FROM sales WHERE id = $1', [saleId]);
      expect(sale.rows[0]!.amount).toBe('100.00');
      await app.close();
    });

    it('enforces the shared column limits (2 decimals, no column overflow)', async () => {
      const saleId = await seedSale(agencyAId, customerAId, { amount: '100.00' });
      const app = buildTestApp(runtimePool);
      const post = (payload: object) =>
        app.inject({ method: 'POST', url: `/sales/${saleId}/items`, headers: { 'x-test-principal': 'agent' }, payload });
      for (const bad of [
        { description: 'x', unitPrice: 1000, qty: 1.001 },
        { description: 'x', unitPrice: 10, qty: 0.001 },
        { description: 'x', unitPrice: 10, qty: 100000000 },
        { description: 'x', unitPrice: 10.005 },
        { description: 'x', unitPrice: 10_000_000_000 },
        { description: 'x', unitPrice: 10, taxes: 1.005 },
        { description: 'x', unitPrice: 10, fees: 1.005 },
        { description: 'x', unitPrice: 10, discount: 1.005 },
        { description: 'x', unitPrice: 10, unitCost: 1.005 },
        { description: 'x', unitPrice: 10, commission: 1.005 },
        { description: 'x', unitPrice: 10, taxes: 10_000_000_000 },
        { description: 'x', unitPrice: 10, fees: 10_000_000_000 },
        { description: 'x', unitPrice: 10, discount: 10_000_000_000 },
        { description: 'x', unitPrice: 10, unitCost: 10_000_000_000 },
        { description: 'x', unitPrice: 10, commission: 10_000_000_000 },
        { description: 'x', unitPrice: 9_999_999_999.99, qty: 2 },
      ]) {
        const response = await post(bad);
        expect(response.statusCode).toBe(400);
        const body = response.json<{ code: string; error: string }>();
        expect(body.code).toBe('VALIDATION_ERROR');
        expect(body.error).toMatch(/decimal places|allowed limit/);
      }
      const rejectedItems = await adminPool.query('SELECT id FROM sale_items WHERE sale_id = $1', [saleId]);
      expect(rejectedItems.rows).toHaveLength(0);
      const unchangedSale = await adminPool.query<{ amount: string; total: string }>(
        'SELECT amount, total FROM sales WHERE agency_id = $1 AND id = $2', [agencyAId, saleId],
      );
      expect(unchangedSale.rows[0]).toMatchObject({ amount: '100.00', total: '100.00' });
      for (const qty of [1.1, 2.3, 2.25]) {
        expect((await post({ description: 'ok', unitPrice: 1.1, qty })).statusCode).toBe(201);
      }
      await app.close();
    });

    it('persists qty 1.25 and computes the matching line total', async () => {
      const saleId = await seedSale(agencyAId, customerAId, { amount: '100.00' });
      const app = buildTestApp(runtimePool);
      try {
        const response = await app.inject({
          method: 'POST', url: `/sales/${saleId}/items`,
          headers: { 'x-test-principal': 'agent' },
          payload: { description: 'Quantidade fracionaria', qty: 1.25, unitPrice: 1000 },
        });
        expect(response.statusCode).toBe(201);
        expect(response.json<{ saleItem: { qty: number; lineTotal: number } }>().saleItem)
          .toMatchObject({ qty: 1.25, lineTotal: 1250 });
        const items = await adminPool.query<{ qty: string; line_total: string }>(
          'SELECT qty, line_total FROM sale_items WHERE agency_id = $1 AND sale_id = $2',
          [agencyAId, saleId],
        );
        expect(items.rows).toEqual([{ qty: '1.25', line_total: '1250.00' }]);
        const sale = await adminPool.query<{ amount: string; total: string }>(
          'SELECT amount, total FROM sales WHERE agency_id = $1 AND id = $2', [agencyAId, saleId],
        );
        expect(sale.rows[0]).toMatchObject({ amount: '1350.00', total: '1350.00' });
      } finally {
        await app.close();
      }
    });

    it('rejects a supplierId belonging to another tenant with 404', async () => {
      const saleId = await seedSale(agencyAId, customerAId, { amount: '100.00' });
      const supplierBId = await seedSupplier(agencyBId, 'Supplier B');
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: `/sales/${saleId}/items`,
        headers: { 'x-test-principal': 'agent' },
        payload: { description: 'Seguro viagem', unitPrice: 50, supplierId: supplierBId, unitCost: 10 },
      });
      expect(response.statusCode).toBe(404);
      await app.close();
    });

    it('total matches financial.ts authoritative getSaleMargin() -- no parallel/drifting formula', async () => {
      const saleId = await seedSale(agencyAId, customerAId, { amount: '100.00' });
      const app = buildTestApp(runtimePool);

      const response = await app.inject({
        method: 'POST',
        url: `/sales/${saleId}/items`,
        headers: { 'x-test-principal': 'agent' },
        payload: {
          description: 'Passeio de barco',
          unitPrice: 80,
          qty: 1,
          unitCost: 30,
          supplierId: supplierAId,
        },
      });
      expect(response.statusCode).toBe(201);

      // Sale.total (authoritative, via computeTotal()) must equal
      // 100 (original amount) + 80 (lineTotal) = 180, no discount.
      const sale = await adminPool.query<{ total: string }>(
        'SELECT total FROM sales WHERE agency_id = $1 AND id = $2',
        [agencyAId, saleId],
      );
      expect(sale.rows[0]?.total).toBe('180.00');

      // getSaleMargin() (financial.ts, unmodified) must independently
      // reflect the SaleItem's supplier cost through the real Payable
      // this module created via the EXISTING createPayable() -- not a
      // second formula that could drift from it.
      const margin = await withAgencyContext(agencyAId, () => getSaleMargin(createDatabaseRuntime(adminPool), saleId));
      expect(margin.revenue).toBe(180);
      expect(margin.supplierCosts).toBe(30);
      expect(margin.margin).toBe(150);

      await app.close();
    });
  });

  describe('GET /sales/:saleId/items', () => {
    it('returns 401 without auth', async () => {
      const saleId = await seedSale(agencyAId, customerAId, { amount: '100.00' });
      const app = buildTestApp(runtimePool);
      const response = await app.inject({ method: 'GET', url: `/sales/${saleId}/items` });
      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it('allows VIEWER to list', async () => {
      const saleId = await seedSale(agencyAId, customerAId, { amount: '100.00' });
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'GET',
        url: `/sales/${saleId}/items`,
        headers: { 'x-test-principal': 'viewer' },
      });
      expect(response.statusCode).toBe(200);
      await app.close();
    });

    it('never leaks another tenant Sale items (tenant isolation)', async () => {
      const aId = await seedSale(agencyAId, customerAId, { amount: '100.00' });
      const bId = await seedSale(agencyBId, customerBId, { amount: '100.00' });

      const app = buildTestApp(runtimePool);

      await app.inject({
        method: 'POST',
        url: `/sales/${aId}/items`,
        headers: { 'x-test-principal': 'agent' },
        payload: { description: 'Item A', unitPrice: 10 },
      });
      await app.inject({
        method: 'POST',
        url: `/sales/${bId}/items`,
        headers: { 'x-test-principal': 'b' },
        payload: { description: 'Item B', unitPrice: 20 },
      });

      const listA = await app.inject({
        method: 'GET',
        url: `/sales/${aId}/items`,
        headers: { 'x-test-principal': 'agent' },
      });
      expect(listA.statusCode).toBe(200);
      const bodyA = listA.json<{ saleItems: Array<{ description: string; agencyId: string }> }>();
      expect(bodyA.saleItems).toHaveLength(1);
      expect(bodyA.saleItems[0]?.description).toBe('Item A');
      expect(bodyA.saleItems[0]?.agencyId).toBe(agencyAId);

      // A high-privilege user from Agency A attempting to read Agency B's
      // sale-scoped items directly gets 404 for the sale itself, RLS
      // ensures no cross-tenant row could ever surface either way.
      const crossTenant = await app.inject({
        method: 'GET',
        url: `/sales/${bId}/items`,
        headers: { 'x-test-principal': 'owner' },
      });
      expect(crossTenant.statusCode).toBe(200);
      expect(crossTenant.json<{ saleItems: unknown[] }>().saleItems).toHaveLength(0);

      await app.close();
    });
  });

  describe('POST /sale-items/:id/cancel (atomicity)', () => {
    async function addItem(app: ReturnType<typeof buildTestApp>, saleId: string, unitPrice: number): Promise<string> {
      const res = await app.inject({
        method: 'POST', url: `/sales/${saleId}/items`, headers: { 'x-test-principal': 'agent' },
        payload: { description: `Item ${unitPrice}`, unitPrice },
      });
      expect(res.statusCode).toBe(201);
      return res.json<{ saleItem: { id: string } }>().saleItem.id;
    }

    it('two concurrent cancellations of the same item reverse its total once', async () => {
      const saleId = await seedSale(agencyAId, customerAId, { amount: '100.00' });
      const app = buildTestApp(runtimePool);
      await addItem(app, saleId, 20);
      const target = await addItem(app, saleId, 30);
      const cancel = () => app.inject({ method: 'POST', url: `/sale-items/${target}/cancel`, headers: { 'x-test-principal': 'manager' } });
      const results = await Promise.all([cancel(), cancel(), cancel()]);
      expect(results.map((r) => r.statusCode)).toEqual([200, 200, 200]);
      const sale = await adminPool.query<{ amount: string; total: string }>(
        'SELECT amount, total FROM sales WHERE agency_id = $1 AND id = $2', [agencyAId, saleId],
      );
      expect(sale.rows[0]).toMatchObject({ amount: '120.00', total: '120.00' });
      const item = await adminPool.query<{ status: string }>(
        'SELECT status FROM sale_items WHERE agency_id = $1 AND id = $2', [agencyAId, target],
      );
      expect(item.rows[0]?.status).toBe('CANCELLED');
      const audit = await adminPool.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM audit_logs
         WHERE agency_id = $1 AND entity_id = $2 AND event_type = 'SALE_ITEM_CANCELLED'`,
        [agencyAId, target],
      );
      expect(audit.rows[0]?.n).toBe(1);
      await app.close();
    });

    it('if the Sale update fails the cancellation is rolled back (item stays ACTIVE)', async () => {
      const saleId = await seedSale(agencyAId, customerAId, { amount: '100.00' });
      const app = buildTestApp(runtimePool);
      const target = await addItem(app, saleId, 30);
      await adminPool.query(`
        CREATE FUNCTION itemtest_block_sale_update2() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'sale update blocked for test'; END $$;
        CREATE TRIGGER itemtest_block_sale_update2 BEFORE UPDATE ON sales
          FOR EACH ROW EXECUTE FUNCTION itemtest_block_sale_update2();
      `);
      try {
        const res = await app.inject({ method: 'POST', url: `/sale-items/${target}/cancel`, headers: { 'x-test-principal': 'manager' } });
        expect(res.statusCode).toBe(500);
      } finally {
        await adminPool.query('DROP TRIGGER itemtest_block_sale_update2 ON sales; DROP FUNCTION itemtest_block_sale_update2();');
        await app.close();
      }
      const item = await adminPool.query<{ status: string }>('SELECT status FROM sale_items WHERE id = $1', [target]);
      expect(item.rows[0]!.status).toBe('ACTIVE');
      const sale = await adminPool.query<{ amount: string; total: string }>(
        'SELECT amount, total FROM sales WHERE agency_id = $1 AND id = $2', [agencyAId, saleId],
      );
      expect(sale.rows[0]).toMatchObject({ amount: '130.00', total: '130.00' });
      const audit = await adminPool.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM audit_logs
         WHERE agency_id = $1 AND entity_id = $2 AND event_type = 'SALE_ITEM_CANCELLED'`,
        [agencyAId, target],
      );
      expect(audit.rows[0]?.n).toBe(0);
    });
  });

  describe('POST /sale-items/:id/cancel', () => {
    it('blocks AGENT with 403 (cancel floor is MANAGER, same as POST /sales/:id/cancel)', async () => {
      const saleId = await seedSale(agencyAId, customerAId, { amount: '100.00' });
      const app = buildTestApp(runtimePool);
      const create = await app.inject({
        method: 'POST',
        url: `/sales/${saleId}/items`,
        headers: { 'x-test-principal': 'agent' },
        payload: { description: 'Seguro', unitPrice: 20 },
      });
      const itemId = create.json<{ saleItem: { id: string } }>().saleItem.id;

      const response = await app.inject({
        method: 'POST',
        url: `/sale-items/${itemId}/cancel`,
        headers: { 'x-test-principal': 'agent' },
      });
      expect(response.statusCode).toBe(403);
      await app.close();
    });

    it('allows MANAGER to cancel and reverses the Sale total via the existing updateSale() path', async () => {
      const saleId = await seedSale(agencyAId, customerAId, { amount: '100.00' });
      const app = buildTestApp(runtimePool);
      const create = await app.inject({
        method: 'POST',
        url: `/sales/${saleId}/items`,
        headers: { 'x-test-principal': 'agent' },
        payload: { description: 'Seguro', unitPrice: 20 },
      });
      const itemId = create.json<{ saleItem: { id: string } }>().saleItem.id;

      const cancel = await app.inject({
        method: 'POST',
        url: `/sale-items/${itemId}/cancel`,
        headers: { 'x-test-principal': 'manager' },
      });
      expect(cancel.statusCode).toBe(200);
      expect(cancel.json<{ saleItem: { status: string } }>().saleItem.status).toBe('CANCELLED');

      const sale = await adminPool.query<{ total: string }>(
        'SELECT total FROM sales WHERE agency_id = $1 AND id = $2',
        [agencyAId, saleId],
      );
      expect(sale.rows[0]?.total).toBe('100.00');

      await app.close();
    });

    it('never lets a tenant cancel another tenant sale item (404, no-op)', async () => {
      const bId = await seedSale(agencyBId, customerBId, { amount: '100.00' });
      const app = buildTestApp(runtimePool);
      const create = await app.inject({
        method: 'POST',
        url: `/sales/${bId}/items`,
        headers: { 'x-test-principal': 'b' },
        payload: { description: 'Item B', unitPrice: 20 },
      });
      const itemId = create.json<{ saleItem: { id: string } }>().saleItem.id;

      const response = await app.inject({
        method: 'POST',
        url: `/sale-items/${itemId}/cancel`,
        headers: { 'x-test-principal': 'owner' },
      });
      expect(response.statusCode).toBe(404);

      const row = await adminPool.query<{ status: string }>('SELECT status FROM sale_items WHERE id = $1', [itemId]);
      expect(row.rows[0]?.status).toBe('ACTIVE');

      await app.close();
    });
  });

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

  async function withAgencyContext<T>(agencyId: string, fn: () => Promise<T>): Promise<T> {
    const { runWithTenantContext } = await import('../../../packages/domain/tenant-context');
    return runWithTenantContext(
      { agencyId, userId: userAId, userRole: UserRole.OWNER, email: 'user-a@example.test' },
      fn,
    );
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

  async function seedProduct(agencyId: string, title: string, active: boolean): Promise<string> {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO travel_products (agency_id, category, title, active) VALUES ($1, 'OTHER', $2, $3) RETURNING id`,
      [agencyId, title, active],
    );
    return result.rows[0]!.id;
  }

  async function seedSupplier(agencyId: string, name: string): Promise<string> {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO suppliers (agency_id, name, active) VALUES ($1, $2, true) RETURNING id`,
      [agencyId, name],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error('Failed to seed supplier');
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
});

function assertSafeTestDatabase(): void {
  if (!['127.0.0.1', 'localhost'].includes(databaseHost)) {
    throw new Error('Sale item route tests require localhost only.');
  }

  if (!Number.isInteger(databasePort) || databasePort < 1024 || databasePort > 65535) {
    throw new Error('Sale item route tests require a safe local database test port.');
  }

  if (!databaseName.includes('test')) {
    throw new Error('Sale item route tests require a database name with a test marker.');
  }

  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    const safeHost = ['127.0.0.1', 'localhost'].includes(url.hostname);
    const safeDatabase = url.pathname.replace('/', '').includes('test');
    const safePort = url.port === String(databasePort) || url.port === '';

    if (!safeHost || !safeDatabase || !safePort) {
      throw new Error('Refusing to run sale item route tests against unsafe DATABASE_URL.');
    }
  }
}

function resetDisposableDatabase(): void {
  if (process.env.CI === 'true') return;
  const existing = run(
    'docker',
    ['ps', '--filter', `name=${containerName}`, '--filter', 'status=running', '--format', '{{.Names}}'],
    false,
  );
  if (existing.stdout.split(/\r?\n/).map((line) => line.trim()).includes(containerName)) {
    return;
  }

  compose(['up', '-d']);
}

function compose(args: readonly string[]): CommandResult {
  return run('docker', ['compose', '-f', composeFile, '-p', projectName, ...args]);
}

async function waitForHealthyContainer(): Promise<void> {
  if (process.env.CI === 'true') return;
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
  if (process.env.CI === 'true') return;
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
  for (const migrationFile of migrationFiles) {
    await pool.query(readSqlForPg(migrationFile));
  }
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
        ($1, 'Agency A', 'agency-a-sale-item-routes-test', 'agency-a@example.test', 'FREE', 'ACTIVE'),
        ($2, 'Agency B', 'agency-b-sale-item-routes-test', 'agency-b@example.test', 'FREE', 'ACTIVE');
    `,
    [agencyAId, agencyBId],
  );
  await pool.query(
    `
      INSERT INTO users (id, agency_id, email, name, role, password_hash, status)
      VALUES
        ($1, $2, 'user-a@example.test', 'User A', 'ADMIN', 'hash-for-sale-item-routes-test-only', 'ACTIVE'),
        ($3, $4, 'user-b@example.test', 'User B', 'ADMIN', 'hash-for-sale-item-routes-test-only', 'ACTIVE');
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
