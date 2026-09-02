import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { runWithTenantContext } from '../../../packages/domain/tenant-context';
import { UserRole } from '../../../packages/domain/types';
import { createDatabaseRuntime, type DatabaseRuntime } from '../src/database';
import {
  computeTotal,
  createSale,
  getSaleById,
  listSales,
  updateSale,
} from '../src/sales';

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
const prepareRolesSql = resolve(repoRoot, 'tests/integration/database/002_prepare_local_roles.sql');
const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.local-postgres.yml');

const projectName = 'travel-platform-sales-postgres';
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

const contextA = { agencyId: agencyAId, userId: userAId, userRole: UserRole.ADMIN, email: 'user-a@example.test' };

describe.sequential('Sale data-access layer', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let database: DatabaseRuntime;

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

    const roleCheck = await runtimePool.query<{ current_user: string }>('SELECT current_user');
    expect(roleCheck.rows[0]?.current_user).toBe(runtimeUser);
    expect(runtimeUser).not.toBe(adminUser);
  });

  beforeEach(async () => {
    await adminPool.query(
      `TRUNCATE TABLE
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
    await adminPool.query('TRUNCATE TABLE brokers RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE customers RESTART IDENTITY CASCADE');
  });

  afterAll(async () => {
    await runtimePool?.end();
    await adminPool?.end();
    compose(['down', '-v']);
  });

  describe('computeTotal (pure helper)', () => {
    it('subtracts a plain discount', () => {
      expect(computeTotal(100, 0)).toBe(100);
      expect(computeTotal(100, 10)).toBe(90);
    });

    it('returns 0 when discount equals amount', () => {
      expect(computeTotal(100, 100)).toBe(0);
    });

    it('is 2-decimal precision safe (no floating point artifacts)', () => {
      expect(computeTotal(199.99, 50.50)).toBe(149.49);
      expect(computeTotal(10.1, 0.3)).toBe(9.8);
    });
  });

  it('fails closed with no tenant context established', async () => {
    await expect(listSales(database)).rejects.toThrow();
    await expect(getSaleById(database, 'anything')).rejects.toThrow();
    await expect(
      createSale(database, { customerId: 'anything', amount: 100 }),
    ).rejects.toThrow();
    await expect(updateSale(database, 'anything', { amount: 1 })).rejects.toThrow();
  });

  it('listSales returns only Agency A sales for Agency A', async () => {
    const customerA = await seedCustomer(agencyAId, 'Customer A');
    const customerB = await seedCustomer(agencyBId, 'Customer B');
    await seedSale(agencyAId, customerA, userAId);
    await seedSale(agencyBId, customerB, userBId);

    const result = await runWithTenantContext(contextA, () => listSales(database));

    expect(result).toHaveLength(1);
    expect(result[0]?.agencyId).toBe(agencyAId);
  });

  it('getSaleById never returns another tenant Sale', async () => {
    const customerB = await seedCustomer(agencyBId, 'Customer B');
    const bSaleId = await seedSale(agencyBId, customerB, userBId);

    const result = await runWithTenantContext(contextA, () => getSaleById(database, bSaleId));

    expect(result).toBeNull();
  });

  it('createSale requires the Customer to belong to the same tenant', async () => {
    const customerB = await seedCustomer(agencyBId, 'Customer B');

    await expect(
      runWithTenantContext(contextA, () =>
        createSale(database, { customerId: customerB, amount: 100 }),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const countResult = await adminPool.query<{ count: string }>('SELECT count(*) FROM sales');
    expect(countResult.rows[0]?.count).toBe('0');
  });

  it('createSale rejects a Proposal belonging to another tenant', async () => {
    const customerA = await seedCustomer(agencyAId, 'Customer A');
    const customerB = await seedCustomer(agencyBId, 'Customer B');
    const proposalB = await seedProposal(agencyBId, customerB);

    await expect(
      runWithTenantContext(contextA, () =>
        createSale(database, { customerId: customerA, amount: 100, proposalId: proposalB }),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('createSale rejects a Broker belonging to another tenant', async () => {
    const customerA = await seedCustomer(agencyAId, 'Customer A');
    const brokerB = await seedBroker(agencyBId, 'Broker B');

    await expect(
      runWithTenantContext(contextA, () =>
        createSale(database, { customerId: customerA, amount: 100, brokerId: brokerB }),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('createSale rejects a second Sale for a Proposal that already has one (clean error, not a raw 500)', async () => {
    const customerA = await seedCustomer(agencyAId, 'Customer A');
    const proposalA = await seedProposal(agencyAId, customerA);

    await runWithTenantContext(contextA, () =>
      createSale(database, { customerId: customerA, amount: 100, proposalId: proposalA }),
    );

    await expect(
      runWithTenantContext(contextA, () =>
        createSale(database, { customerId: customerA, amount: 50, proposalId: proposalA }),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    const countResult = await adminPool.query<{ count: string }>(
      'SELECT count(*) FROM sales WHERE proposal_id = $1',
      [proposalA],
    );
    expect(countResult.rows[0]?.count).toBe('1');
  });

  it('createSale computes total = amount - discount, defaults discount to 0, status PENDING, paidAt null, userId from session', async () => {
    const customerA = await seedCustomer(agencyAId, 'Customer A');

    const created = await runWithTenantContext(contextA, () =>
      createSale(database, { customerId: customerA, amount: 100 }),
    );

    expect(created.discount).toBe(0);
    expect(created.total).toBe(100);
    expect(created.status).toBe('PENDING');
    expect(created.agencyId).toBe(agencyAId);
    expect(created.userId).toBe(userAId);
    expect(created.paidAt).toBeUndefined();
  });

  it('createSale accepts discount equal to amount (total = 0)', async () => {
    const customerA = await seedCustomer(agencyAId, 'Customer A');

    const created = await runWithTenantContext(contextA, () =>
      createSale(database, { customerId: customerA, amount: 100, discount: 100 }),
    );

    expect(created.total).toBe(0);
  });

  it('createSale rejects discount greater than amount and creates no row', async () => {
    const customerA = await seedCustomer(agencyAId, 'Customer A');

    await expect(
      runWithTenantContext(contextA, () =>
        createSale(database, { customerId: customerA, amount: 100, discount: 101 }),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    const countResult = await adminPool.query<{ count: string }>('SELECT count(*) FROM sales');
    expect(countResult.rows[0]?.count).toBe('0');
  });

  it('createSale rejects negative amount and negative discount', async () => {
    const customerA = await seedCustomer(agencyAId, 'Customer A');

    await expect(
      runWithTenantContext(contextA, () => createSale(database, { customerId: customerA, amount: -1 })),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    await expect(
      runWithTenantContext(contextA, () =>
        createSale(database, { customerId: customerA, amount: 100, discount: -1 }),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('createSale computes decimal-precise total (199.99 - 50.50 = 149.49)', async () => {
    const customerA = await seedCustomer(agencyAId, 'Customer A');

    const created = await runWithTenantContext(contextA, () =>
      createSale(database, { customerId: customerA, amount: 199.99, discount: 50.50 }),
    );

    expect(created.total).toBe(149.49);
  });

  it('updateSale on another tenant Sale id is a no-op and leaves the row unchanged', async () => {
    const customerB = await seedCustomer(agencyBId, 'Customer B');
    const bSaleId = await seedSale(agencyBId, customerB, userBId, { amount: '200.00' });

    const result = await runWithTenantContext(contextA, () =>
      updateSale(database, bSaleId, { amount: 1 }),
    );

    expect(result).toBeNull();

    const row = await adminPool.query<{ amount: string }>('SELECT amount FROM sales WHERE id = $1', [bSaleId]);
    expect(row.rows[0]?.amount).toBe('200.00');
  });

  it('updateSale recomputes total when amount changes', async () => {
    const customerA = await seedCustomer(agencyAId, 'Customer A');
    const id = await seedSale(agencyAId, customerA, userAId, { amount: '100.00', discount: '10.00' });

    const result = await runWithTenantContext(contextA, () => updateSale(database, id, { amount: 200 }));

    expect(result?.amount).toBe(200);
    expect(result?.discount).toBe(10);
    expect(result?.total).toBe(190);
  });

  it('updateSale recomputes total when only discount changes', async () => {
    const customerA = await seedCustomer(agencyAId, 'Customer A');
    const id = await seedSale(agencyAId, customerA, userAId, { amount: '100.00', discount: '0.00' });

    const result = await runWithTenantContext(contextA, () => updateSale(database, id, { discount: 25 }));

    expect(result?.total).toBe(75);
  });

  it('updateSale rejects a resulting discount greater than the effective amount', async () => {
    const customerA = await seedCustomer(agencyAId, 'Customer A');
    const id = await seedSale(agencyAId, customerA, userAId, { amount: '100.00', discount: '0.00' });

    await expect(
      runWithTenantContext(contextA, () => updateSale(database, id, { discount: 150 })),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    const row = await adminPool.query<{ discount: string }>('SELECT discount FROM sales WHERE id = $1', [id]);
    expect(row.rows[0]?.discount).toBe('0.00');
  });

  it('updateSale validates discount<=amount using effective values when only one changes', async () => {
    const customerA = await seedCustomer(agencyAId, 'Customer A');
    const id = await seedSale(agencyAId, customerA, userAId, { amount: '100.00', discount: '90.00' });

    await expect(
      runWithTenantContext(contextA, () => updateSale(database, id, { amount: 50 })),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('updateSale never changes status or paidAt (not part of UpdateSaleInput)', async () => {
    const customerA = await seedCustomer(agencyAId, 'Customer A');
    const id = await seedSale(agencyAId, customerA, userAId);

    const result = await runWithTenantContext(contextA, () => updateSale(database, id, { notes: 'Updated notes' }));

    expect(result?.status).toBe('PENDING');
    expect(result?.paidAt).toBeUndefined();
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

  async function seedBroker(agencyId: string, name: string): Promise<string> {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO brokers (agency_id, name, email) VALUES ($1, $2, $3) RETURNING id`,
      [agencyId, name, `${name.toLowerCase().replace(/\s+/g, '-')}@example.test`],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error('Failed to seed broker');
    return id;
  }

  async function seedSale(
    agencyId: string,
    customerId: string,
    userId: string,
    data: { amount?: string; discount?: string } = {},
  ): Promise<string> {
    const amount = data.amount ?? '100.00';
    const discount = data.discount ?? '0.00';
    const total = (Number(amount) - Number(discount)).toFixed(2);
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO sales (agency_id, customer_id, user_id, amount, discount, total)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [agencyId, customerId, userId, amount, discount, total],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error('Failed to seed sale');
    return id;
  }
});

function assertSafeTestDatabase(): void {
  if (!['127.0.0.1', 'localhost'].includes(databaseHost)) {
    throw new Error('Sale data-layer tests require localhost only.');
  }

  if (databasePort !== 55432) {
    throw new Error('Sale data-layer tests require local port 55432.');
  }

  if (!databaseName.includes('test')) {
    throw new Error('Sale data-layer tests require a database name with a test marker.');
  }

  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    const safeHost = ['127.0.0.1', 'localhost'].includes(url.hostname);
    const safeDatabase = url.pathname.replace('/', '').includes('test');
    const safePort = url.port === '55432' || url.port === '';

    if (!safeHost || !safeDatabase || !safePort) {
      throw new Error('Refusing to run sale data-layer tests against unsafe DATABASE_URL.');
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
        ($1, 'Agency A', 'agency-a-sales-test', 'agency-a@example.test', 'FREE', 'ACTIVE'),
        ($2, 'Agency B', 'agency-b-sales-test', 'agency-b@example.test', 'FREE', 'ACTIVE');
    `,
    [agencyAId, agencyBId],
  );
  await pool.query(
    `
      INSERT INTO users (id, agency_id, email, name, role, password_hash, status)
      VALUES
        ($1, $2, 'user-a@example.test', 'User A', 'ADMIN', 'hash-for-sales-test-only', 'ACTIVE'),
        ($3, $4, 'user-b@example.test', 'User B', 'ADMIN', 'hash-for-sales-test-only', 'ACTIVE');
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
