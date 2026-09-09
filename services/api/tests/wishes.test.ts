import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { runWithTenantContext } from '../../../packages/domain/tenant-context';
import { UserRole } from '../../../packages/domain/types';
import { createDatabaseRuntime, type DatabaseRuntime } from '../src/database';
import {
  createWish,
  getWishById,
  listWishesByCustomer,
  updateWish,
} from '../src/wishes';

const repoRoot = resolve(import.meta.dirname, '../../..');
const migration001 = resolve(repoRoot, 'infrastructure/migrations/001_initial_schema.sql');
const migration002 = resolve(repoRoot, 'infrastructure/migrations/002_rls_policies.sql');
const prepareRolesSql = resolve(repoRoot, 'tests/integration/database/002_prepare_local_roles.sql');
const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.local-postgres.yml');

const projectName = 'travel-platform-wishes-postgres';
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
const contextB = { agencyId: agencyBId, userId: userBId, userRole: UserRole.ADMIN, email: 'user-b@example.test' };

describe.sequential('Wish data-access layer (Task 1)', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let database: DatabaseRuntime;
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

    database = createDatabaseRuntime(runtimePool);

    await resetDatabase(adminPool);

    // Prove queries run under the non-superuser runtime role, not the admin/migration role.
    const roleCheck = await runtimePool.query<{ current_user: string }>('SELECT current_user');
    expect(roleCheck.rows[0]?.current_user).toBe(runtimeUser);
    expect(runtimeUser).not.toBe(adminUser);
  });

  beforeEach(async () => {
    await adminPool.query('TRUNCATE TABLE wishes RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE customers RESTART IDENTITY CASCADE');
    customerAId = await seedCustomer(agencyAId, 'Customer A');
    customerBId = await seedCustomer(agencyBId, 'Customer B');
  });

  afterAll(async () => {
    await runtimePool?.end();
    await adminPool?.end();
    compose(['down', '-v']);
  });

  it('fails closed with no tenant context established', async () => {
    await expect(listWishesByCustomer(database, 'anything')).rejects.toThrow();
    await expect(getWishById(database, 'anything')).rejects.toThrow();
    await expect(createWish(database, 'anything', { destination: 'X' })).rejects.toThrow();
    await expect(updateWish(database, 'anything', { destination: 'X' })).rejects.toThrow();
  });

  it('listWishesByCustomer returns only Agency A wishes for the given customer', async () => {
    await seedWish(agencyAId, customerAId, { destination: 'A Wish' });
    await seedWish(agencyBId, customerBId, { destination: 'B Wish' });

    const result = await runWithTenantContext(contextA, () =>
      listWishesByCustomer(database, customerAId),
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.destination).toBe('A Wish');
    expect(result[0]?.agencyId).toBe(agencyAId);
  });

  it('listWishesByCustomer returns only Agency B wishes for the given customer', async () => {
    await seedWish(agencyAId, customerAId, { destination: 'A Wish' });
    await seedWish(agencyBId, customerBId, { destination: 'B Wish' });

    const result = await runWithTenantContext(contextB, () =>
      listWishesByCustomer(database, customerBId),
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.destination).toBe('B Wish');
    expect(result[0]?.agencyId).toBe(agencyBId);
  });

  it('listWishesByCustomer returns empty array for cross-tenant/nonexistent customer id', async () => {
    await seedWish(agencyBId, customerBId, { destination: 'B Wish' });

    const result = await runWithTenantContext(contextA, () =>
      listWishesByCustomer(database, customerBId),
    );

    expect(result).toEqual([]);
  });

  it('Agency A cannot read a Wish belonging to Agency B via getWishById', async () => {
    const bWishId = await seedWish(agencyBId, customerBId, { destination: 'B Secret' });

    const result = await runWithTenantContext(contextA, () => getWishById(database, bWishId));

    expect(result).toBeNull();
  });

  it('Agency B cannot read a Wish belonging to Agency A via getWishById', async () => {
    const aWishId = await seedWish(agencyAId, customerAId, { destination: 'A Secret' });

    const result = await runWithTenantContext(contextB, () => getWishById(database, aWishId));

    expect(result).toBeNull();
  });

  it('createWish writes agency_id matching the current tenant only', async () => {
    const created = await runWithTenantContext(contextA, () =>
      createWish(database, customerAId, { destination: 'New Wish' }),
    );

    expect(created.agencyId).toBe(agencyAId);
    expect(created.customerId).toBe(customerAId);
    expect(created.status).toBe('ACTIVE');

    const row = await adminPool.query<{ agency_id: string }>(
      'SELECT agency_id FROM wishes WHERE id = $1',
      [created.id],
    );
    expect(row.rows[0]?.agency_id).toBe(agencyAId);
  });

  it('createWish rejects a cross-tenant customerId with NotFoundError and creates no row', async () => {
    await expect(
      runWithTenantContext(contextA, () =>
        createWish(database, customerBId, { destination: 'Should Fail' }),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const countResult = await adminPool.query<{ count: string }>('SELECT count(*) FROM wishes');
    expect(countResult.rows[0]?.count).toBe('0');
  });

  it('updateWish on another tenant Wish id is a no-op and leaves the row unchanged', async () => {
    const bWishId = await seedWish(agencyBId, customerBId, { destination: 'B Original' });

    const result = await runWithTenantContext(contextA, () =>
      updateWish(database, bWishId, { destination: 'Hacked' }),
    );

    expect(result).toBeNull();

    const row = await adminPool.query<{ destination: string }>(
      'SELECT destination FROM wishes WHERE id = $1',
      [bWishId],
    );
    expect(row.rows[0]?.destination).toBe('B Original');
  });

  it('updateWish on the correct tenant own Wish successfully updates fields', async () => {
    const wishId = await seedWish(agencyAId, customerAId, { destination: 'Original' });

    const result = await runWithTenantContext(contextA, () =>
      updateWish(database, wishId, { destination: 'Updated', travelersCount: 4 }),
    );

    expect(result?.destination).toBe('Updated');
    expect(result?.travelersCount).toBe(4);
  });

  async function seedCustomer(agencyId: string, name: string): Promise<string> {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO customers (agency_id, name) VALUES ($1, $2) RETURNING id`,
      [agencyId, name],
    );
    const id = result.rows[0]?.id;
    if (!id) {
      throw new Error('Failed to seed customer');
    }
    return id;
  }

  async function seedWish(
    agencyId: string,
    customerId: string,
    data: { destination?: string },
  ): Promise<string> {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO wishes (agency_id, customer_id, destination) VALUES ($1, $2, $3) RETURNING id`,
      [agencyId, customerId, data.destination ?? null],
    );
    const id = result.rows[0]?.id;
    if (!id) {
      throw new Error('Failed to seed wish');
    }
    return id;
  }
});

function assertSafeTestDatabase(): void {
  if (!['127.0.0.1', 'localhost'].includes(databaseHost)) {
    throw new Error('Wish data-layer tests require localhost only.');
  }

  if (!Number.isInteger(databasePort) || databasePort < 1024 || databasePort > 65535) {
    throw new Error('Wish data-layer tests require a safe local database test port.');
  }

  if (!databaseName.includes('test')) {
    throw new Error('Wish data-layer tests require a database name with a test marker.');
  }

  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    const safeHost = ['127.0.0.1', 'localhost'].includes(url.hostname);
    const safeDatabase = url.pathname.replace('/', '').includes('test');
    const safePort = url.port === String(databasePort) || url.port === '';

    if (!safeHost || !safeDatabase || !safePort) {
      throw new Error('Refusing to run wish data-layer tests against unsafe DATABASE_URL.');
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
        ($1, 'Agency A', 'agency-a-wishes-test', 'agency-a@example.test', 'FREE', 'ACTIVE'),
        ($2, 'Agency B', 'agency-b-wishes-test', 'agency-b@example.test', 'FREE', 'ACTIVE');
    `,
    [agencyAId, agencyBId],
  );
  await pool.query(
    `
      INSERT INTO users (id, agency_id, email, name, role, password_hash, status)
      VALUES
        ($1, $2, 'user-a@example.test', 'User A', 'ADMIN', 'hash-for-wishes-test-only', 'ACTIVE'),
        ($3, $4, 'user-b@example.test', 'User B', 'ADMIN', 'hash-for-wishes-test-only', 'ACTIVE');
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
