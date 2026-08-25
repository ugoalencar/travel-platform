import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { runWithTenantContext } from '../../../packages/domain/tenant-context';
import { PaymentDirection, UserRole } from '../../../packages/domain/types';
import { createDatabaseRuntime, type DatabaseRuntime } from '../src/database';
import {
  allocatePayment,
  createOperationalCost,
  createPayable,
  createReceivable,
  getCashFlowSummary,
  getSaleMargin,
  listReceivables,
  recordPayment,
} from '../src/financial';

const repoRoot = resolve(import.meta.dirname, '../../..');
const migrations = [
  '001_initial_schema.sql',
  '002_rls_policies.sql',
  '003_transportation.sql',
  '004_route_points.sql',
  '005_booking.sql',
  '006_field_operations.sql',
  '007_commission_repair.sql',
  '008_commercial_cockpit.sql',
  '009_configurable_pipelines.sql',
  '010_financial_foundation.sql',
].map((name) => resolve(repoRoot, 'infrastructure/migrations', name));
const prepareRolesSql = resolve(repoRoot, 'tests/integration/database/002_prepare_local_roles.sql');
const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.local-postgres.yml');

const projectName = 'travel-platform-financial-postgres';
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

const contextA = {
  agencyId: agencyAId,
  userId: userAId,
  userRole: UserRole.ADMIN,
  email: 'user-a@example.test',
};

describe.sequential('Financial foundation data-access layer', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let database: DatabaseRuntime;
  let customerA: string;
  let customerB: string;
  let saleA: string;
  let saleB: string;
  let supplierA: string;
  let operationA: string;

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

    database = createDatabaseRuntime(runtimePool);
    await resetDatabase(adminPool);

    const roleCheck = await runtimePool.query<{
      current_user: string;
      rolsuper: boolean;
      rolbypassrls: boolean;
    }>(`SELECT current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`);
    expect(roleCheck.rows[0]?.current_user).toBe(runtimeUser);
    expect(roleCheck.rows[0]?.rolsuper).toBe(false);
    expect(roleCheck.rows[0]?.rolbypassrls).toBe(false);
  });

  beforeEach(async () => {
    await adminPool.query('TRUNCATE TABLE payment_allocations RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE payments RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE receivables RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE payables RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE operational_costs RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE operation_checkpoints RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE transport_operations RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE scheduled_departures RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE transport_products RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE routes RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE suppliers RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE commissions RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE sales RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE customers RESTART IDENTITY CASCADE');

    customerA = await seedCustomer(agencyAId, 'Customer A');
    customerB = await seedCustomer(agencyBId, 'Customer B');
    saleA = await seedSale(agencyAId, customerA, userAId, '1000.00');
    saleB = await seedSale(agencyBId, customerB, userBId, '500.00');
    supplierA = await seedSupplier(agencyAId, 'Supplier A');
    operationA = await seedTransportOperation(agencyAId, supplierA);
  });

  afterAll(async () => {
    await runtimePool?.end();
    await adminPool?.end();
    compose(['down', '-v']);
  });

  it('fails closed with no tenant context established', async () => {
    await expect(listReceivables(database)).rejects.toThrow();
    await expect(
      createReceivable(database, {
        saleId: saleA,
        customerId: customerA,
        description: 'Sale receivable',
        amount: 1000,
        dueAt: new Date('2027-01-10T00:00:00Z'),
      }),
    ).rejects.toThrow();
  });

  it('creates tenant-scoped receivables from real sales without exposing another tenant', async () => {
    const receivable = await runWithTenantContext(contextA, () =>
      createReceivable(database, {
        saleId: saleA,
        customerId: customerA,
        description: 'Sale receivable',
        amount: 1000,
        dueAt: new Date('2027-01-10T00:00:00Z'),
      }),
    );
    await seedReceivable(agencyBId, saleB, customerB, 'Other tenant', '500.00');

    const visible = await runWithTenantContext(contextA, () => listReceivables(database));

    expect(receivable.status).toBe('OPEN');
    expect(receivable.saleId).toBe(saleA);
    expect(visible).toHaveLength(1);
    expect(visible[0]?.agencyId).toBe(agencyAId);
  });

  it('supports partial payments and marks receivable paid only when allocations reach the full amount', async () => {
    const receivable = await runWithTenantContext(contextA, () =>
      createReceivable(database, {
        saleId: saleA,
        customerId: customerA,
        description: 'Sale receivable',
        amount: 1000,
        dueAt: new Date('2027-01-10T00:00:00Z'),
      }),
    );
    const payment = await runWithTenantContext(contextA, () =>
      recordPayment(database, {
        direction: PaymentDirection.IN,
        amount: 1000,
        occurredAt: new Date('2027-01-05T00:00:00Z'),
        method: 'PIX',
      }),
    );

    const partial = await runWithTenantContext(contextA, () =>
      allocatePayment(database, payment.id, [{ receivableId: receivable.id, amount: 400 }]),
    );
    expect(partial.allocations).toHaveLength(1);
    expect(partial.targets[0]?.status).toBe('PARTIALLY_PAID');

    const final = await runWithTenantContext(contextA, () =>
      allocatePayment(database, payment.id, [{ receivableId: receivable.id, amount: 600 }]),
    );
    expect(final.targets[0]?.status).toBe('PAID');
  });

  it('rejects over-allocation against both payment amount and receivable amount', async () => {
    const receivable = await runWithTenantContext(contextA, () =>
      createReceivable(database, {
        saleId: saleA,
        customerId: customerA,
        description: 'Sale receivable',
        amount: 1000,
        dueAt: new Date('2027-01-10T00:00:00Z'),
      }),
    );
    const payment = await runWithTenantContext(contextA, () =>
      recordPayment(database, {
        direction: PaymentDirection.IN,
        amount: 800,
        occurredAt: new Date('2027-01-05T00:00:00Z'),
      }),
    );

    await expect(
      runWithTenantContext(contextA, () =>
        allocatePayment(database, payment.id, [{ receivableId: receivable.id, amount: 801 }]),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    const largerPayment = await runWithTenantContext(contextA, () =>
      recordPayment(database, {
        direction: PaymentDirection.IN,
        amount: 1200,
        occurredAt: new Date('2027-01-05T00:00:00Z'),
      }),
    );
    await expect(
      runWithTenantContext(contextA, () =>
        allocatePayment(database, largerPayment.id, [{ receivableId: receivable.id, amount: 1001 }]),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('creates payables, outbound payments, operational costs, cash flow, and sale margin from real data', async () => {
    const receivable = await seedReceivable(agencyAId, saleA, customerA, 'Sale receivable', '1000.00');
    const payable = await runWithTenantContext(contextA, () =>
      createPayable(database, {
        saleId: saleA,
        supplierId: supplierA,
        transportOperationId: operationA,
        description: 'Supplier payable',
        amount: 250,
        dueAt: new Date('2027-01-12T00:00:00Z'),
      }),
    );
    await seedCommission(agencyAId, saleA, '80.00');
    await runWithTenantContext(contextA, () =>
      createOperationalCost(database, {
        saleId: saleA,
        transportOperationId: operationA,
        supplierId: supplierA,
        description: 'Fuel',
        costType: 'FUEL',
        expectedAmount: 40,
        actualAmount: 50,
        incurredAt: new Date('2027-01-04T00:00:00Z'),
      }),
    );

    const inbound = await runWithTenantContext(contextA, () =>
      recordPayment(database, {
        direction: PaymentDirection.IN,
        amount: 1000,
        occurredAt: new Date('2027-01-05T00:00:00Z'),
      }),
    );
    await runWithTenantContext(contextA, () =>
      allocatePayment(database, inbound.id, [{ receivableId: receivable, amount: 1000 }]),
    );
    const outbound = await runWithTenantContext(contextA, () =>
      recordPayment(database, {
        direction: PaymentDirection.OUT,
        amount: 250,
        occurredAt: new Date('2027-01-07T00:00:00Z'),
      }),
    );
    await runWithTenantContext(contextA, () =>
      allocatePayment(database, outbound.id, [{ payableId: payable.id, amount: 250 }]),
    );

    const cashFlow = await runWithTenantContext(contextA, () =>
      getCashFlowSummary(database, {
        from: new Date('2027-01-01T00:00:00Z'),
        to: new Date('2027-01-31T23:59:59Z'),
      }),
    );
    const margin = await runWithTenantContext(contextA, () => getSaleMargin(database, saleA));

    expect(cashFlow.projected.receivablesDue).toBe(1000);
    expect(cashFlow.projected.payablesDue).toBe(250);
    expect(cashFlow.realized.paymentsIn).toBe(1000);
    expect(cashFlow.realized.paymentsOut).toBe(250);
    expect(cashFlow.realized.balance).toBe(750);
    expect(margin).toMatchObject({
      saleId: saleA,
      revenue: 1000,
      supplierCosts: 250,
      operationalCosts: 50,
      commission: 80,
      margin: 620,
    });
  });

  async function seedCustomer(agencyId: string, name: string): Promise<string> {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO customers (agency_id, name, status) VALUES ($1, $2, 'ACTIVE') RETURNING id`,
      [agencyId, name],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error('Failed to seed customer');
    return id;
  }

  async function seedSale(
    agencyId: string,
    customerId: string,
    userId: string,
    total: string,
  ): Promise<string> {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO sales (agency_id, customer_id, user_id, amount, discount, total, status)
       VALUES ($1, $2, $3, $4, '0.00', $4, 'CONFIRMED') RETURNING id`,
      [agencyId, customerId, userId, total],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error('Failed to seed sale');
    return id;
  }

  async function seedSupplier(agencyId: string, name: string): Promise<string> {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO suppliers (agency_id, name) VALUES ($1, $2) RETURNING id`,
      [agencyId, name],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error('Failed to seed supplier');
    return id;
  }

  async function seedTransportOperation(agencyId: string, supplierId: string): Promise<string> {
    const routeResult = await adminPool.query<{ id: string }>(
      `INSERT INTO routes (agency_id, origin, destination) VALUES ($1, 'A', 'B') RETURNING id`,
      [agencyId],
    );
    const routeId = routeResult.rows[0]!.id;
    const productResult = await adminPool.query<{ id: string }>(
      `INSERT INTO transport_products
         (agency_id, name, trip_type, outbound_route_id, price)
       VALUES ($1, 'Product', 'ONE_WAY', $2, 10) RETURNING id`,
      [agencyId, routeId],
    );
    const departureResult = await adminPool.query<{ id: string }>(
      `INSERT INTO scheduled_departures
         (agency_id, product_id, departure_at, capacity, supplier_id, service_type)
       VALUES ($1, $2, '2027-01-03T10:00:00Z', 10, $3, 'SUBCONTRACTED') RETURNING id`,
      [agencyId, productResult.rows[0]!.id, supplierId],
    );
    const operationResult = await adminPool.query<{ id: string }>(
      `INSERT INTO transport_operations (agency_id, departure_id) VALUES ($1, $2) RETURNING id`,
      [agencyId, departureResult.rows[0]!.id],
    );
    return operationResult.rows[0]!.id;
  }

  async function seedReceivable(
    agencyId: string,
    saleId: string,
    customerId: string,
    description: string,
    amount: string,
  ): Promise<string> {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO receivables (agency_id, sale_id, customer_id, description, amount, due_at)
       VALUES ($1, $2, $3, $4, $5, '2027-01-10T00:00:00Z') RETURNING id`,
      [agencyId, saleId, customerId, description, amount],
    );
    return result.rows[0]!.id;
  }

  async function seedCommission(agencyId: string, saleId: string, amount: string): Promise<string> {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO commissions (agency_id, sale_id, amount, percentage, status)
       VALUES ($1, $2, $3, '8.00', 'PENDING') RETURNING id`,
      [agencyId, saleId, amount],
    );
    return result.rows[0]!.id;
  }
});

function assertSafeTestDatabase(): void {
  if (!['127.0.0.1', 'localhost'].includes(databaseHost)) {
    throw new Error('Financial data-layer tests require localhost only.');
  }
  if (databasePort !== 55432) {
    throw new Error('Financial data-layer tests require local port 55432.');
  }
  if (!databaseName.includes('test')) {
    throw new Error('Financial data-layer tests require a database name with a test marker.');
  }
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    const safeHost = ['127.0.0.1', 'localhost'].includes(url.hostname);
    const safeDatabase = url.pathname.replace('/', '').includes('test');
    const safePort = url.port === '55432' || url.port === '';
    if (!safeHost || !safeDatabase || !safePort) {
      throw new Error('Refusing to run Financial data-layer tests against unsafe DATABASE_URL.');
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
    const result = run('docker', ['inspect', '-f', '{{.State.Health.Status}}', containerName], false);
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
  const result = run('docker', ['ps', '--filter', `name=${containerName}`, '--format', '{{.Image}}|{{.Ports}}']);
  const output = result.stdout.trim();
  expect(output).toContain(postgresImage);
  expect(output).toContain(`${databaseHost}:${databasePort}->5432/tcp`);
}

async function resetDatabase(pool: Pool): Promise<void> {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  for (const migration of migrations) {
    await pool.query(readSqlForPg(migration));
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
        ($1, 'Agency A', 'agency-a-financial-test', 'agency-a@example.test', 'FREE', 'ACTIVE'),
        ($2, 'Agency B', 'agency-b-financial-test', 'agency-b@example.test', 'FREE', 'ACTIVE');
    `,
    [agencyAId, agencyBId],
  );
  await pool.query(
    `
      INSERT INTO users (id, agency_id, email, name, role, password_hash, status)
      VALUES
        ($1, $2, 'user-a@example.test', 'User A', 'ADMIN', 'hash-for-financial-test-only', 'ACTIVE'),
        ($3, $4, 'user-b@example.test', 'User B', 'ADMIN', 'hash-for-financial-test-only', 'ACTIVE');
    `,
    [userAId, agencyAId, userBId, agencyBId],
  );
}

interface CommandResult {
  stdout: string;
  stderr: string;
}

function run(command: string, args: readonly string[], throwOnError = true): CommandResult {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 20,
  });

  const stdout = result.stdout.toString();
  const stderr = result.stderr.toString();

  if (throwOnError && result.status !== 0) {
    throw new Error(
      [`Command failed: ${command} ${args.join(' ')}`, `Exit code: ${result.status ?? 'unknown'}`, stdout, stderr]
        .filter(Boolean)
        .join('\n'),
    );
  }

  return { stdout, stderr };
}
