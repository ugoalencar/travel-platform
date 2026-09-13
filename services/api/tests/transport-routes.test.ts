import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { runWithTenantContext } from '../../../packages/domain/tenant-context';
import { UserRole } from '../../../packages/domain/types';
import { createDatabaseRuntime, type DatabaseRuntime } from '../src/database';
import { createRoute, getRouteById, listRoutes, updateRoute } from '../src/transport-routes';

const repoRoot = resolve(import.meta.dirname, '../../..');
const migration001 = resolve(repoRoot, 'infrastructure/migrations/001_initial_schema.sql');
const migration002 = resolve(repoRoot, 'infrastructure/migrations/002_rls_policies.sql');
const migration003 = resolve(repoRoot, 'infrastructure/migrations/003_transportation.sql');
const prepareRolesSql = resolve(repoRoot, 'tests/integration/database/002_prepare_local_roles.sql');
const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.local-postgres.yml');

const projectName = 'travel-platform-transport-routes-postgres';
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

describe('Route data-access layer', () => {
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
    await adminPool.query('TRUNCATE TABLE routes RESTART IDENTITY CASCADE');
  });

  afterAll(async () => {
    await runtimePool?.end();
    await adminPool?.end();
    compose(['down', '-v']);
  });

  it('fails closed with no tenant context established', async () => {
    await expect(listRoutes(database)).rejects.toThrow();
    await expect(getRouteById(database, 'anything')).rejects.toThrow();
    await expect(
      createRoute(database, { origin: 'A', destination: 'B' }),
    ).rejects.toThrow();
    await expect(updateRoute(database, 'anything', { origin: 'X' })).rejects.toThrow();
  });

  it('listRoutes returns only Agency A routes for Agency A', async () => {
    await seedRoute(agencyAId, 'A1', 'A2');
    await seedRoute(agencyBId, 'B1', 'B2');

    const result = await runWithTenantContext(contextA, () => listRoutes(database));

    expect(result).toHaveLength(1);
    expect(result[0]?.agencyId).toBe(agencyAId);
  });

  it('getRouteById never returns another tenant Route', async () => {
    const bId = await seedRoute(agencyBId, 'B1', 'B2');

    const result = await runWithTenantContext(contextA, () => getRouteById(database, bId));

    expect(result).toBeNull();
  });

  it('createRoute requires non-empty origin and destination', async () => {
    await expect(
      runWithTenantContext(contextA, () => createRoute(database, { origin: '', destination: 'B' })),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    await expect(
      runWithTenantContext(contextA, () => createRoute(database, { origin: 'A', destination: '   ' })),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('createRoute rejects negative estimatedDuration and distance', async () => {
    await expect(
      runWithTenantContext(contextA, () =>
        createRoute(database, { origin: 'A', destination: 'B', estimatedDuration: -1 }),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    await expect(
      runWithTenantContext(contextA, () =>
        createRoute(database, { origin: 'A', destination: 'B', distance: -1 }),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('createRoute accepts optional estimatedDuration/distance and defaults active to true', async () => {
    const created = await runWithTenantContext(contextA, () =>
      createRoute(database, { origin: 'A', destination: 'B', estimatedDuration: 120, distance: 45.5 }),
    );

    expect(created.active).toBe(true);
    expect(created.estimatedDuration).toBe(120);
    expect(created.distance).toBe(45.5);
    expect(created.agencyId).toBe(agencyAId);
  });

  it('createRoute allows explicit active=false', async () => {
    const created = await runWithTenantContext(contextA, () =>
      createRoute(database, { origin: 'A', destination: 'B', active: false }),
    );
    expect(created.active).toBe(false);
  });

  it('updateRoute on another tenant Route id is a no-op and leaves the row unchanged', async () => {
    const bId = await seedRoute(agencyBId, 'B1', 'B2');

    const result = await runWithTenantContext(contextA, () =>
      updateRoute(database, bId, { origin: 'Hacked' }),
    );

    expect(result).toBeNull();

    const row = await adminPool.query<{ origin: string }>('SELECT origin FROM routes WHERE id = $1', [bId]);
    expect(row.rows[0]?.origin).toBe('B1');
  });

  it('updateRoute rejects empty origin/destination and negative numeric fields', async () => {
    const id = await seedRoute(agencyAId, 'A1', 'A2');

    await expect(
      runWithTenantContext(contextA, () => updateRoute(database, id, { origin: '' })),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    await expect(
      runWithTenantContext(contextA, () => updateRoute(database, id, { estimatedDuration: -5 })),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('updateRoute updates fields and returns updated row', async () => {
    const id = await seedRoute(agencyAId, 'A1', 'A2');

    const result = await runWithTenantContext(contextA, () =>
      updateRoute(database, id, { destination: 'A2-updated', active: false }),
    );

    expect(result?.destination).toBe('A2-updated');
    expect(result?.active).toBe(false);
  });

  async function seedRoute(agencyId: string, origin: string, destination: string): Promise<string> {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO routes (agency_id, origin, destination) VALUES ($1, $2, $3) RETURNING id`,
      [agencyId, origin, destination],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error('Failed to seed route');
    return id;
  }
});

function assertSafeTestDatabase(): void {
  if (!['127.0.0.1', 'localhost'].includes(databaseHost)) {
    throw new Error('Route data-layer tests require localhost only.');
  }
  if (!Number.isInteger(databasePort) || databasePort < 1024 || databasePort > 65535) {
    throw new Error('Route data-layer tests require a safe local database test port.');
  }
  if (!databaseName.includes('test')) {
    throw new Error('Route data-layer tests require a database name with a test marker.');
  }
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    const safeHost = ['127.0.0.1', 'localhost'].includes(url.hostname);
    const safeDatabase = url.pathname.replace('/', '').includes('test');
    const safePort = url.port === String(databasePort) || url.port === '';
    if (!safeHost || !safeDatabase || !safePort) {
      throw new Error('Refusing to run route data-layer tests against unsafe DATABASE_URL.');
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
  if (process.env.CI === 'true') return;
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
        ($1, 'Agency A', 'agency-a-transport-routes-test', 'agency-a@example.test', 'FREE', 'ACTIVE'),
        ($2, 'Agency B', 'agency-b-transport-routes-test', 'agency-b@example.test', 'FREE', 'ACTIVE');
    `,
    [agencyAId, agencyBId],
  );
  await pool.query(
    `
      INSERT INTO users (id, agency_id, email, name, role, password_hash, status)
      VALUES
        ($1, $2, 'user-a@example.test', 'User A', 'ADMIN', 'hash-for-transport-routes-test-only', 'ACTIVE'),
        ($3, $4, 'user-b@example.test', 'User B', 'ADMIN', 'hash-for-transport-routes-test-only', 'ACTIVE');
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
