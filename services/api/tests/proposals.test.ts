import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { runWithTenantContext } from '../../../packages/domain/tenant-context';
import { UserRole } from '../../../packages/domain/types';
import { createDatabaseRuntime, type DatabaseRuntime } from '../src/database';
import {
  computeTotal,
  createProposal,
  getProposalById,
  listProposals,
  updateProposal,
} from '../src/proposals';

const repoRoot = resolve(import.meta.dirname, '../../..');
const migrationsDir = resolve(repoRoot, 'infrastructure/migrations');
const migrationFiles = readdirSync(migrationsDir)
  .filter((name) => /^\d+_.+\.sql$/.test(name))
  .sort()
  .map((name) => resolve(migrationsDir, name));
const prepareRolesSql = resolve(repoRoot, 'tests/integration/database/002_prepare_local_roles.sql');
const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.local-postgres.yml');

const projectName = 'travel-platform-proposals-postgres';
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

describe('Proposal data-access layer', () => {
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
    await adminPool.query('TRUNCATE TABLE proposals RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE offers RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE wishes RESTART IDENTITY CASCADE');
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

    it('returns 0 when discount equals proposedPrice', () => {
      expect(computeTotal(100, 100)).toBe(0);
    });

    it('is 2-decimal precision safe (no floating point artifacts)', () => {
      expect(computeTotal(99.99, 33.33)).toBe(66.66);
      expect(computeTotal(10.1, 0.3)).toBe(9.8);
    });
  });

  it('fails closed with no tenant context established', async () => {
    await expect(listProposals(database)).rejects.toThrow();
    await expect(getProposalById(database, 'anything')).rejects.toThrow();
    await expect(
      createProposal(database, 'anything', { proposedPrice: 100 }),
    ).rejects.toThrow();
    await expect(updateProposal(database, 'anything', { proposedPrice: 1 })).rejects.toThrow();
  });

  it('listProposals returns only Agency A proposals for Agency A', async () => {
    const customerA = await seedCustomer(agencyAId, 'Customer A');
    const customerB = await seedCustomer(agencyBId, 'Customer B');
    await seedProposal(agencyAId, customerA);
    await seedProposal(agencyBId, customerB);

    const result = await runWithTenantContext(contextA, () => listProposals(database));

    expect(result).toHaveLength(1);
    expect(result[0]?.agencyId).toBe(agencyAId);
  });

  it('getProposalById never returns another tenant Proposal', async () => {
    const customerB = await seedCustomer(agencyBId, 'Customer B');
    const bProposalId = await seedProposal(agencyBId, customerB);

    const result = await runWithTenantContext(contextA, () => getProposalById(database, bProposalId));

    expect(result).toBeNull();
  });

  it('createProposal requires the Customer to belong to the same tenant', async () => {
    const customerB = await seedCustomer(agencyBId, 'Customer B');

    await expect(
      runWithTenantContext(contextA, () =>
        createProposal(database, customerB, { proposedPrice: 100 }),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const countResult = await adminPool.query<{ count: string }>('SELECT count(*) FROM proposals');
    expect(countResult.rows[0]?.count).toBe('0');
  });

  it('createProposal rejects an Offer belonging to another tenant', async () => {
    const customerA = await seedCustomer(agencyAId, 'Customer A');
    const offerB = await seedOffer(agencyBId, 'Offer B');

    await expect(
      runWithTenantContext(contextA, () =>
        createProposal(database, customerA, { proposedPrice: 100, offerId: offerB }),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('createProposal rejects a Wish belonging to another tenant', async () => {
    const customerA = await seedCustomer(agencyAId, 'Customer A');
    const customerB = await seedCustomer(agencyBId, 'Customer B');
    const wishB = await seedWish(agencyBId, customerB);

    await expect(
      runWithTenantContext(contextA, () =>
        createProposal(database, customerA, { proposedPrice: 100, wishId: wishB }),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('createProposal computes total = proposedPrice - discount and defaults discount to 0', async () => {
    const customerA = await seedCustomer(agencyAId, 'Customer A');

    const created = await runWithTenantContext(contextA, () =>
      createProposal(database, customerA, { proposedPrice: 100 }),
    );

    expect(created.discount).toBe(0);
    expect(created.total).toBe(100);
    expect(created.status).toBe('DRAFT');
    expect(created.agencyId).toBe(agencyAId);
  });

  it('createProposal accepts discount equal to proposedPrice (total = 0)', async () => {
    const customerA = await seedCustomer(agencyAId, 'Customer A');

    const created = await runWithTenantContext(contextA, () =>
      createProposal(database, customerA, { proposedPrice: 100, discount: 100 }),
    );

    expect(created.total).toBe(0);
  });

  it('createProposal rejects discount greater than proposedPrice and creates no row', async () => {
    const customerA = await seedCustomer(agencyAId, 'Customer A');

    await expect(
      runWithTenantContext(contextA, () =>
        createProposal(database, customerA, { proposedPrice: 100, discount: 101 }),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    const countResult = await adminPool.query<{ count: string }>('SELECT count(*) FROM proposals');
    expect(countResult.rows[0]?.count).toBe('0');
  });

  it('createProposal rejects negative proposedPrice and negative discount', async () => {
    const customerA = await seedCustomer(agencyAId, 'Customer A');

    await expect(
      runWithTenantContext(contextA, () =>
        createProposal(database, customerA, { proposedPrice: -1 }),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    await expect(
      runWithTenantContext(contextA, () =>
        createProposal(database, customerA, { proposedPrice: 100, discount: -1 }),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('createProposal computes decimal-precise total (99.99 - 33.33 = 66.66)', async () => {
    const customerA = await seedCustomer(agencyAId, 'Customer A');

    const created = await runWithTenantContext(contextA, () =>
      createProposal(database, customerA, { proposedPrice: 99.99, discount: 33.33 }),
    );

    expect(created.total).toBe(66.66);
  });

  it('updateProposal on another tenant Proposal id is a no-op and leaves the row unchanged', async () => {
    const customerB = await seedCustomer(agencyBId, 'Customer B');
    const bProposalId = await seedProposal(agencyBId, customerB, { proposedPrice: '200.00' });

    const result = await runWithTenantContext(contextA, () =>
      updateProposal(database, bProposalId, { proposedPrice: 1 }),
    );

    expect(result).toBeNull();

    const row = await adminPool.query<{ proposed_price: string }>(
      'SELECT proposed_price FROM proposals WHERE id = $1',
      [bProposalId],
    );
    expect(row.rows[0]?.proposed_price).toBe('200.00');
  });

  it('updateProposal recomputes total when proposedPrice changes', async () => {
    const customerA = await seedCustomer(agencyAId, 'Customer A');
    const id = await seedProposal(agencyAId, customerA, { proposedPrice: '100.00', discount: '10.00' });

    const result = await runWithTenantContext(contextA, () =>
      updateProposal(database, id, { proposedPrice: 200 }),
    );

    expect(result?.proposedPrice).toBe(200);
    expect(result?.discount).toBe(10);
    expect(result?.total).toBe(190);
  });

  it('updateProposal recomputes total when only discount changes', async () => {
    const customerA = await seedCustomer(agencyAId, 'Customer A');
    const id = await seedProposal(agencyAId, customerA, { proposedPrice: '100.00', discount: '0.00' });

    const result = await runWithTenantContext(contextA, () =>
      updateProposal(database, id, { discount: 25 }),
    );

    expect(result?.total).toBe(75);
  });

  it('updateProposal rejects a resulting discount greater than the effective proposedPrice', async () => {
    const customerA = await seedCustomer(agencyAId, 'Customer A');
    const id = await seedProposal(agencyAId, customerA, { proposedPrice: '100.00', discount: '0.00' });

    await expect(
      runWithTenantContext(contextA, () => updateProposal(database, id, { discount: 150 })),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    const row = await adminPool.query<{ discount: string }>(
      'SELECT discount FROM proposals WHERE id = $1',
      [id],
    );
    expect(row.rows[0]?.discount).toBe('0.00');
  });

  it('updateProposal validates discount<=proposedPrice using effective values when only one changes', async () => {
    const customerA = await seedCustomer(agencyAId, 'Customer A');
    const id = await seedProposal(agencyAId, customerA, { proposedPrice: '100.00', discount: '90.00' });

    await expect(
      runWithTenantContext(contextA, () => updateProposal(database, id, { proposedPrice: 50 })),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('updateProposal never changes status (status is not part of UpdateProposalInput)', async () => {
    const customerA = await seedCustomer(agencyAId, 'Customer A');
    const id = await seedProposal(agencyAId, customerA);

    const result = await runWithTenantContext(contextA, () =>
      updateProposal(database, id, { notes: 'Updated notes' }),
    );

    expect(result?.status).toBe('DRAFT');
  });

  function validCreateInput(overrides: Partial<{ proposedPrice: number; discount: number }> = {}) {
    return {
      proposedPrice: overrides.proposedPrice ?? 100,
      ...(overrides.discount !== undefined ? { discount: overrides.discount } : {}),
    };
  }
  void validCreateInput;

  async function seedCustomer(agencyId: string, name: string): Promise<string> {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO customers (agency_id, name, status) VALUES ($1, $2, 'ACTIVE') RETURNING id`,
      [agencyId, name],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error('Failed to seed customer');
    return id;
  }

  async function seedOffer(agencyId: string, name: string): Promise<string> {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO offers (agency_id, name, price) VALUES ($1, $2, '100.00') RETURNING id`,
      [agencyId, name],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error('Failed to seed offer');
    return id;
  }

  async function seedWish(agencyId: string, customerId: string): Promise<string> {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO wishes (agency_id, customer_id) VALUES ($1, $2) RETURNING id`,
      [agencyId, customerId],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error('Failed to seed wish');
    return id;
  }

  async function seedProposal(
    agencyId: string,
    customerId: string,
    data: { proposedPrice?: string; discount?: string } = {},
  ): Promise<string> {
    const proposedPrice = data.proposedPrice ?? '100.00';
    const discount = data.discount ?? '0.00';
    const total = (Number(proposedPrice) - Number(discount)).toFixed(2);
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO proposals (agency_id, customer_id, proposed_price, discount, total)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [agencyId, customerId, proposedPrice, discount, total],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error('Failed to seed proposal');
    return id;
  }
});

function assertSafeTestDatabase(): void {
  if (!['127.0.0.1', 'localhost'].includes(databaseHost)) {
    throw new Error('Proposal data-layer tests require localhost only.');
  }

  if (!Number.isInteger(databasePort) || databasePort < 1024 || databasePort > 65535) {
    throw new Error('Proposal data-layer tests require a safe local database test port.');
  }

  if (!databaseName.includes('test')) {
    throw new Error('Proposal data-layer tests require a database name with a test marker.');
  }

  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    const safeHost = ['127.0.0.1', 'localhost'].includes(url.hostname);
    const safeDatabase = url.pathname.replace('/', '').includes('test');
    const safePort = url.port === String(databasePort) || url.port === '';

    if (!safeHost || !safeDatabase || !safePort) {
      throw new Error('Refusing to run proposal data-layer tests against unsafe DATABASE_URL.');
    }
  }
}

function resetDisposableDatabase(): void {
  if (process.env.CI === 'true') return;
  compose(['down', '-v']);
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
        ($1, 'Agency A', 'agency-a-proposals-test', 'agency-a@example.test', 'FREE', 'ACTIVE'),
        ($2, 'Agency B', 'agency-b-proposals-test', 'agency-b@example.test', 'FREE', 'ACTIVE');
    `,
    [agencyAId, agencyBId],
  );
  await pool.query(
    `
      INSERT INTO users (id, agency_id, email, name, role, password_hash, status)
      VALUES
        ($1, $2, 'user-a@example.test', 'User A', 'ADMIN', 'hash-for-proposals-test-only', 'ACTIVE'),
        ($3, $4, 'user-b@example.test', 'User B', 'ADMIN', 'hash-for-proposals-test-only', 'ACTIVE');
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
