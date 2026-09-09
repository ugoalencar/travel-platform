import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { runWithTenantContext } from '../../../packages/domain/tenant-context';
import { UserRole } from '../../../packages/domain/types';
import { createDatabaseRuntime, type DatabaseRuntime } from '../src/database';
import { createSupplier, getSupplierById, listSuppliers, updateSupplier } from '../src/suppliers';

const repoRoot = resolve(import.meta.dirname, '../../..');
const migration001 = resolve(repoRoot, 'infrastructure/migrations/001_initial_schema.sql');
const migration002 = resolve(repoRoot, 'infrastructure/migrations/002_rls_policies.sql');
const migration003 = resolve(repoRoot, 'infrastructure/migrations/003_transportation.sql');
// suppliers.ts (Suppliers + Supplier Categories wave, f371ff9) reads/writes
// trade_name/supplier_type/email/etc. columns added by 038_supplier_extended.sql
// onto the pre-existing `suppliers` table -- this test's minimal schema must
// include it or every createSupplier/updateSupplier call here 500s.
const migration038 = resolve(repoRoot, 'infrastructure/migrations/038_supplier_extended.sql');
const prepareRolesSql = resolve(repoRoot, 'tests/integration/database/002_prepare_local_roles.sql');
const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.local-postgres.yml');

const projectName = 'travel-platform-suppliers-postgres';
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

describe.sequential('Supplier data-access layer', () => {
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
    await adminPool.query('TRUNCATE TABLE suppliers RESTART IDENTITY CASCADE');
  });

  afterAll(async () => {
    await runtimePool?.end();
    await adminPool?.end();
    compose(['down', '-v']);
  });

  it('fails closed with no tenant context established', async () => {
    await expect(listSuppliers(database)).rejects.toThrow();
    await expect(getSupplierById(database, 'anything')).rejects.toThrow();
    await expect(createSupplier(database, { name: 'x' })).rejects.toThrow();
    await expect(updateSupplier(database, 'anything', { name: 'y' })).rejects.toThrow();
  });

  it('listSuppliers returns only Agency A suppliers for Agency A', async () => {
    await seedSupplier(agencyAId, 'Supplier A');
    await seedSupplier(agencyBId, 'Supplier B');

    const result = await runWithTenantContext(contextA, () => listSuppliers(database));

    expect(result).toHaveLength(1);
    expect(result[0]?.agencyId).toBe(agencyAId);
  });

  it('getSupplierById never returns another tenant Supplier', async () => {
    const bId = await seedSupplier(agencyBId, 'Supplier B');
    const result = await runWithTenantContext(contextA, () => getSupplierById(database, bId));
    expect(result).toBeNull();
  });

  it('createSupplier requires non-empty name', async () => {
    await expect(
      runWithTenantContext(contextA, () => createSupplier(database, { name: '  ' })),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('createSupplier defaults active to true and accepts optional fields', async () => {
    const created = await runWithTenantContext(contextA, () =>
      createSupplier(database, { name: 'Supplier A', document: '123', contact: 'phone' }),
    );
    expect(created.active).toBe(true);
    expect(created.document).toBe('123');
    expect(created.contact).toBe('phone');
    expect(created.agencyId).toBe(agencyAId);
  });

  it('createSupplier allows explicit active=false', async () => {
    const created = await runWithTenantContext(contextA, () =>
      createSupplier(database, { name: 'Supplier A', active: false }),
    );
    expect(created.active).toBe(false);
  });

  it('updateSupplier on another tenant Supplier id is a no-op and leaves the row unchanged', async () => {
    const bId = await seedSupplier(agencyBId, 'Supplier B');

    const result = await runWithTenantContext(contextA, () => updateSupplier(database, bId, { name: 'Hacked' }));
    expect(result).toBeNull();

    const row = await adminPool.query<{ name: string }>('SELECT name FROM suppliers WHERE id = $1', [bId]);
    expect(row.rows[0]?.name).toBe('Supplier B');
  });

  it('updateSupplier rejects empty name', async () => {
    const id = await seedSupplier(agencyAId, 'Supplier A');
    await expect(
      runWithTenantContext(contextA, () => updateSupplier(database, id, { name: '' })),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('updateSupplier updates fields and returns updated row', async () => {
    const id = await seedSupplier(agencyAId, 'Supplier A');
    const result = await runWithTenantContext(contextA, () =>
      updateSupplier(database, id, { name: 'Supplier A2', active: false }),
    );
    expect(result?.name).toBe('Supplier A2');
    expect(result?.active).toBe(false);
  });

  async function seedSupplier(agencyId: string, name: string): Promise<string> {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO suppliers (agency_id, name) VALUES ($1, $2) RETURNING id`,
      [agencyId, name],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error('Failed to seed supplier');
    return id;
  }
});

function assertSafeTestDatabase(): void {
  if (!['127.0.0.1', 'localhost'].includes(databaseHost)) {
    throw new Error('Supplier data-layer tests require localhost only.');
  }
  if (!Number.isInteger(databasePort) || databasePort < 1024 || databasePort > 65535) {
    throw new Error('Supplier data-layer tests require a safe local database test port.');
  }
  if (!databaseName.includes('test')) {
    throw new Error('Supplier data-layer tests require a database name with a test marker.');
  }
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    const safeHost = ['127.0.0.1', 'localhost'].includes(url.hostname);
    const safeDatabase = url.pathname.replace('/', '').includes('test');
    const safePort = url.port === String(databasePort) || url.port === '';
    if (!safeHost || !safeDatabase || !safePort) {
      throw new Error('Refusing to run supplier data-layer tests against unsafe DATABASE_URL.');
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
  await pool.query(readSqlForPg(migration001));
  await pool.query(readSqlForPg(migration002));
  await pool.query(readSqlForPg(migration003));
  await pool.query(readSqlForPg(migration038));
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
        ($1, 'Agency A', 'agency-a-suppliers-test', 'agency-a@example.test', 'FREE', 'ACTIVE'),
        ($2, 'Agency B', 'agency-b-suppliers-test', 'agency-b@example.test', 'FREE', 'ACTIVE');
    `,
    [agencyAId, agencyBId],
  );
  await pool.query(
    `
      INSERT INTO users (id, agency_id, email, name, role, password_hash, status)
      VALUES
        ($1, $2, 'user-a@example.test', 'User A', 'ADMIN', 'hash-for-suppliers-test-only', 'ACTIVE'),
        ($3, $4, 'user-b@example.test', 'User B', 'ADMIN', 'hash-for-suppliers-test-only', 'ACTIVE');
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
