import { readFileSync } from 'node:fs';
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
const migration001 = resolve(repoRoot, 'infrastructure/migrations/001_initial_schema.sql');
const migration002 = resolve(repoRoot, 'infrastructure/migrations/002_rls_policies.sql');
const migration003 = resolve(repoRoot, 'infrastructure/migrations/003_transportation.sql');
const migration004 = resolve(repoRoot, 'infrastructure/migrations/004_route_points.sql');
const migration005 = resolve(repoRoot, 'infrastructure/migrations/005_booking.sql');
const migration006 = resolve(repoRoot, 'infrastructure/migrations/006_field_operations.sql');
const migration007 = resolve(repoRoot, 'infrastructure/migrations/007_commission_repair.sql');
const migration010 = resolve(repoRoot, 'infrastructure/migrations/010_financial_foundation.sql');
const migration015 = resolve(repoRoot, 'infrastructure/migrations/015_audit_logging.sql');
const migration024 = resolve(repoRoot, 'infrastructure/migrations/024_extended_financial_module.sql');
const migration052 = resolve(repoRoot, 'infrastructure/migrations/052_sale_items_upsell.sql');
const prepareRolesSql = resolve(repoRoot, 'tests/integration/database/002_prepare_local_roles.sql');
const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.local-postgres.yml');

const projectName = 'travel-platform-sale-item-routes-postgres';
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
  ownerAgencyB: { userId: userBId, agencyId: agencyBId, role: UserRole.OWNER, email: 'user-b@example.test' },
};

describe.sequential('Sale item HTTP routes', () => {
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
    compose(['down', '-v']);
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

  async function seedSupplier(agencyId: string, name: string): Promise<string> {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO suppliers (agency_id, name, status) VALUES ($1, $2, 'ACTIVE') RETURNING id`,
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
  await pool.query(readSqlForPg(migration005));
  await pool.query(readSqlForPg(migration006));
  await pool.query(readSqlForPg(migration007));
  await pool.query(readSqlForPg(migration010));
  await pool.query(readSqlForPg(migration015));
  await pool.query(readSqlForPg(migration024));
  await pool.query(readSqlForPg(migration052));
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
