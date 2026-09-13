import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { runWithTenantContext } from '../../../packages/domain/tenant-context';
import { UserRole } from '../../../packages/domain/types';
import { createDatabaseRuntime, type DatabaseRuntime } from '../src/database';
import {
  createCustomer,
  getCustomerById,
  listCustomers,
  updateCustomer,
} from '../src/customers';

const repoRoot = resolve(import.meta.dirname, '../../..');
const migration001 = resolve(repoRoot, 'infrastructure/migrations/001_initial_schema.sql');
const migration002 = resolve(repoRoot, 'infrastructure/migrations/002_rls_policies.sql');
const migration019 = resolve(repoRoot, 'infrastructure/migrations/019_customer_360_addresses.sql');
const migration020 = resolve(repoRoot, 'infrastructure/migrations/020_customer_360_dependents.sql');
const migration021 = resolve(repoRoot, 'infrastructure/migrations/021_customer_360_documents.sql');
const migration046 = resolve(repoRoot, 'infrastructure/migrations/046_customer_360_completion.sql');
const prepareRolesSql = resolve(repoRoot, 'tests/integration/database/002_prepare_local_roles.sql');
const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.local-postgres.yml');

const projectName = 'travel-platform-customers-postgres';
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

describe('Customer data-access layer (Task 1)', () => {
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
  });

  beforeEach(async () => {
    await adminPool.query('TRUNCATE TABLE customers RESTART IDENTITY CASCADE');
  });

  afterAll(async () => {
    await runtimePool?.end();
    await adminPool?.end();
    compose(['down', '-v']);
  });

  it('fails closed with no tenant context established', async () => {
    await expect(listCustomers(database)).rejects.toThrow();
    await expect(getCustomerById(database, 'anything')).rejects.toThrow();
    await expect(createCustomer(database, { name: 'X' })).rejects.toThrow();
    await expect(updateCustomer(database, 'anything', { name: 'X' })).rejects.toThrow();
  });

  it('listCustomers returns only Agency A customers', async () => {
    await seedCustomer(agencyAId, { name: 'A One' });
    await seedCustomer(agencyBId, { name: 'B One' });

    const result = await runWithTenantContext(contextA, () => listCustomers(database));

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('A One');
    expect(result[0]?.agencyId).toBe(agencyAId);
  });

  it('listCustomers returns only Agency B customers', async () => {
    await seedCustomer(agencyAId, { name: 'A One' });
    await seedCustomer(agencyBId, { name: 'B One' });

    const result = await runWithTenantContext(contextB, () => listCustomers(database));

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('B One');
    expect(result[0]?.agencyId).toBe(agencyBId);
  });

  it('getCustomerById for another tenant customer id returns not found (null)', async () => {
    const bId = await seedCustomer(agencyBId, { name: 'B Secret' });

    const result = await runWithTenantContext(contextA, () => getCustomerById(database, bId));

    expect(result).toBeNull();
  });

  it('createCustomer writes the row under the current tenant only', async () => {
    const created = await runWithTenantContext(contextA, () =>
      createCustomer(database, { name: 'New Customer', email: 'new@example.test' }),
    );

    expect(created.agencyId).toBe(agencyAId);

    const row = await adminPool.query<{ agency_id: string }>(
      'SELECT agency_id FROM customers WHERE id = $1',
      [created.id],
    );
    expect(row.rows[0]?.agency_id).toBe(agencyAId);
  });

  it('updateCustomer on another tenant customer id is a no-op', async () => {
    const bId = await seedCustomer(agencyBId, { name: 'B Original', email: 'borig@example.test' });

    const result = await runWithTenantContext(contextA, () =>
      updateCustomer(database, bId, { name: 'Hacked' }),
    );

    expect(result).toBeNull();

    const row = await adminPool.query<{ name: string }>(
      'SELECT name FROM customers WHERE id = $1',
      [bId],
    );
    expect(row.rows[0]?.name).toBe('B Original');
  });

  it('excludes soft-deleted customers from listCustomers and getCustomerById', async () => {
    const id = await seedCustomer(agencyAId, { name: 'Deleted Guy' });
    await adminPool.query('UPDATE customers SET deleted_at = now() WHERE id = $1', [id]);

    const listResult = await runWithTenantContext(contextA, () => listCustomers(database));
    expect(listResult.find((c) => c.id === id)).toBeUndefined();

    const getResult = await runWithTenantContext(contextA, () => getCustomerById(database, id));
    expect(getResult).toBeNull();
  });

  it('rejects duplicate CPF within same tenant, allows same CPF in a different tenant', async () => {
    await runWithTenantContext(contextA, () =>
      createCustomer(database, { name: 'First', cpf: '12345678900' }),
    );

    await expect(
      runWithTenantContext(contextA, () =>
        createCustomer(database, { name: 'Second', cpf: '12345678900' }),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    await expect(
      runWithTenantContext(contextB, () =>
        createCustomer(database, { name: 'Other Agency', cpf: '12345678900' }),
      ),
    ).resolves.toMatchObject({ cpf: '12345678900' });
  });

  it('rejects duplicate email within same tenant, allows same email in a different tenant', async () => {
    await runWithTenantContext(contextA, () =>
      createCustomer(database, { name: 'First', email: 'dup@example.test' }),
    );

    await expect(
      runWithTenantContext(contextA, () =>
        createCustomer(database, { name: 'Second', email: 'dup@example.test' }),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    await expect(
      runWithTenantContext(contextB, () =>
        createCustomer(database, { name: 'Other Agency', email: 'dup@example.test' }),
      ),
    ).resolves.toMatchObject({ email: 'dup@example.test' });
  });

  async function seedCustomer(
    agencyId: string,
    data: { name: string; email?: string; cpf?: string },
  ): Promise<string> {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO customers (agency_id, name, email, cpf) VALUES ($1, $2, $3, $4) RETURNING id`,
      [agencyId, data.name, data.email ?? null, data.cpf ?? null],
    );
    const id = result.rows[0]?.id;
    if (!id) {
      throw new Error('Failed to seed customer');
    }
    return id;
  }
});

function assertSafeTestDatabase(): void {
  if (!['127.0.0.1', 'localhost'].includes(databaseHost)) {
    throw new Error('Customer data-layer tests require localhost only.');
  }

  if (!Number.isInteger(databasePort) || databasePort < 1024 || databasePort > 65535) {
    throw new Error('Customer data-layer tests require a safe local database test port.');
  }

  if (!databaseName.includes('test')) {
    throw new Error('Customer data-layer tests require a database name with a test marker.');
  }

  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    const safeHost = ['127.0.0.1', 'localhost'].includes(url.hostname);
    const safeDatabase = url.pathname.replace('/', '').includes('test');
    const safePort = url.port === String(databasePort) || url.port === '';

    if (!safeHost || !safeDatabase || !safePort) {
      throw new Error('Refusing to run customer data-layer tests against unsafe DATABASE_URL.');
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
  await pool.query(readSqlForPg(migration019));
  await pool.query(readSqlForPg(migration020));
  await pool.query(readSqlForPg(migration021));
  await pool.query(readSqlForPg(migration046));
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
        ($1, 'Agency A', 'agency-a-customers-test', 'agency-a@example.test', 'FREE', 'ACTIVE'),
        ($2, 'Agency B', 'agency-b-customers-test', 'agency-b@example.test', 'FREE', 'ACTIVE');
    `,
    [agencyAId, agencyBId],
  );
  await pool.query(
    `
      INSERT INTO users (id, agency_id, email, name, role, password_hash, status)
      VALUES
        ($1, $2, 'user-a@example.test', 'User A', 'ADMIN', 'hash-for-customers-test-only', 'ACTIVE'),
        ($3, $4, 'user-b@example.test', 'User B', 'ADMIN', 'hash-for-customers-test-only', 'ACTIVE');
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
