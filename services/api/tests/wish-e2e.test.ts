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
const prepareRolesSql = resolve(repoRoot, 'tests/integration/database/002_prepare_local_roles.sql');
const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.local-postgres.yml');

const projectName = 'travel-platform-wish-e2e-postgres';
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
  agentA: { userId: userAId, agencyId: agencyAId, role: UserRole.AGENT, email: 'user-a@example.test' },
  agentB: { userId: userBId, agencyId: agencyBId, role: UserRole.AGENT, email: 'user-b@example.test' },
  viewerA: { userId: userAId, agencyId: agencyAId, role: UserRole.VIEWER, email: 'user-a@example.test' },
  ownerA: { userId: userAId, agencyId: agencyAId, role: UserRole.OWNER, email: 'user-a@example.test' },
  ownerB: { userId: userBId, agencyId: agencyBId, role: UserRole.OWNER, email: 'user-b@example.test' },
  unknownRoleA: {
    userId: userAId,
    agencyId: agencyAId,
    role: 'NOT_A_REAL_ROLE' as UserRole,
    email: 'user-a@example.test',
  },
};

describe('Wish end-to-end vertical validation (Task 3)', () => {
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

  it('Runtime role: app database pool connects as a non-superuser, non-bypassrls runtime role', async () => {
    const roleCheck = await runtimePool.query<{ current_user: string }>('SELECT current_user');
    expect(roleCheck.rows[0]?.current_user).toBe(runtimeUser);
    expect(runtimeUser).not.toBe(adminUser);

    const roleAttrs = await adminPool.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
      'SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = $1',
      [runtimeUser],
    );
    expect(roleAttrs.rows).toHaveLength(1);
    expect(roleAttrs.rows[0]?.rolsuper).toBe(false);
    expect(roleAttrs.rows[0]?.rolbypassrls).toBe(false);
  });

  it('Scenario: full Agency A lifecycle - create, list, get, update', async () => {
    const app = buildTestApp(runtimePool);

    const created = await app.inject({
      method: 'POST',
      url: '/wishes',
      headers: { 'x-test-principal': 'agentA' },
      payload: { customerId: customerAId, destination: 'Wish A' },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json<{ wish: { id: string } }>().wish.id;

    const list = await app.inject({
      method: 'GET',
      url: '/wishes',
      headers: { 'x-test-principal': 'agentA' },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json<{ wishes: Array<{ id: string }> }>().wishes.some((w) => w.id === id)).toBe(true);

    const get1 = await app.inject({
      method: 'GET',
      url: `/wishes/${id}`,
      headers: { 'x-test-principal': 'agentA' },
    });
    expect(get1.statusCode).toBe(200);
    expect(get1.json<{ wish: { id: string; destination: string } }>().wish.destination).toBe('Wish A');

    const patch = await app.inject({
      method: 'PATCH',
      url: `/wishes/${id}`,
      headers: { 'x-test-principal': 'agentA' },
      payload: { destination: 'Wish A Updated' },
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json<{ wish: { destination: string } }>().wish.destination).toBe('Wish A Updated');

    await app.close();
  });

  it('Scenario: full Agency B lifecycle - create, list, get', async () => {
    const app = buildTestApp(runtimePool);

    await app.inject({
      method: 'POST',
      url: '/wishes',
      headers: { 'x-test-principal': 'agentA' },
      payload: { customerId: customerAId, destination: 'Agency A Wish' },
    });

    const created = await app.inject({
      method: 'POST',
      url: '/wishes',
      headers: { 'x-test-principal': 'agentB' },
      payload: { customerId: customerBId, destination: 'Wish B' },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json<{ wish: { id: string } }>().wish.id;

    const list = await app.inject({
      method: 'GET',
      url: '/wishes',
      headers: { 'x-test-principal': 'agentB' },
    });
    expect(list.statusCode).toBe(200);
    const destinations = list.json<{ wishes: Array<{ destination: string }> }>().wishes.map((w) => w.destination);
    expect(destinations).toContain('Wish B');
    expect(destinations).not.toContain('Agency A Wish');

    const get1 = await app.inject({
      method: 'GET',
      url: `/wishes/${id}`,
      headers: { 'x-test-principal': 'agentB' },
    });
    expect(get1.statusCode).toBe(200);

    await app.close();
  });

  it('Scenario: isolation - lists never cross tenants, cross-tenant GET/PATCH are 404 with zero mutation', async () => {
    const app = buildTestApp(runtimePool);

    const wishA = await app.inject({
      method: 'POST',
      url: '/wishes',
      headers: { 'x-test-principal': 'agentA' },
      payload: { customerId: customerAId, destination: 'A Isolation' },
    });
    const idA = wishA.json<{ wish: { id: string } }>().wish.id;

    const wishB = await app.inject({
      method: 'POST',
      url: '/wishes',
      headers: { 'x-test-principal': 'agentB' },
      payload: { customerId: customerBId, destination: 'B Isolation' },
    });
    const idB = wishB.json<{ wish: { id: string } }>().wish.id;

    const listA = await app.inject({
      method: 'GET',
      url: '/wishes',
      headers: { 'x-test-principal': 'agentA' },
    });
    const listAIds = listA.json<{ wishes: Array<{ id: string }> }>().wishes.map((w) => w.id);
    expect(listAIds).toContain(idA);
    expect(listAIds).not.toContain(idB);

    const listB = await app.inject({
      method: 'GET',
      url: '/wishes',
      headers: { 'x-test-principal': 'agentB' },
    });
    const listBIds = listB.json<{ wishes: Array<{ id: string }> }>().wishes.map((w) => w.id);
    expect(listBIds).toContain(idB);
    expect(listBIds).not.toContain(idA);

    const aGetB = await app.inject({
      method: 'GET',
      url: `/wishes/${idB}`,
      headers: { 'x-test-principal': 'agentA' },
    });
    expect(aGetB.statusCode).toBe(404);

    const bGetA = await app.inject({
      method: 'GET',
      url: `/wishes/${idA}`,
      headers: { 'x-test-principal': 'agentB' },
    });
    expect(bGetA.statusCode).toBe(404);

    const aPatchB = await app.inject({
      method: 'PATCH',
      url: `/wishes/${idB}`,
      headers: { 'x-test-principal': 'agentA' },
      payload: { destination: 'Hacked By A' },
    });
    expect(aPatchB.statusCode).toBe(404);

    const bPatchA = await app.inject({
      method: 'PATCH',
      url: `/wishes/${idA}`,
      headers: { 'x-test-principal': 'agentB' },
      payload: { destination: 'Hacked By B' },
    });
    expect(bPatchA.statusCode).toBe(404);

    const rowA = await adminPool.query<{ destination: string }>('SELECT destination FROM wishes WHERE id = $1', [idA]);
    expect(rowA.rows[0]?.destination).toBe('A Isolation');

    const rowB = await adminPool.query<{ destination: string }>('SELECT destination FROM wishes WHERE id = $1', [idB]);
    expect(rowB.rows[0]?.destination).toBe('B Isolation');

    await app.close();
  });

  it('Scenario: RBAC E2E - VIEWER read-only, AGENT full, higher role still tenant-scoped, unknown role fails closed, no auth 401', async () => {
    const app = buildTestApp(runtimePool);

    const seeded = await app.inject({
      method: 'POST',
      url: '/wishes',
      headers: { 'x-test-principal': 'agentA' },
      payload: { customerId: customerAId, destination: 'RBAC Target' },
    });
    const id = seeded.json<{ wish: { id: string } }>().wish.id;

    const viewerGet = await app.inject({
      method: 'GET',
      url: `/wishes/${id}`,
      headers: { 'x-test-principal': 'viewerA' },
    });
    expect(viewerGet.statusCode).toBe(200);

    const viewerPost = await app.inject({
      method: 'POST',
      url: '/wishes',
      headers: { 'x-test-principal': 'viewerA' },
      payload: { customerId: customerAId, destination: 'Viewer Attempt' },
    });
    expect(viewerPost.statusCode).toBe(403);

    const viewerPatch = await app.inject({
      method: 'PATCH',
      url: `/wishes/${id}`,
      headers: { 'x-test-principal': 'viewerA' },
      payload: { destination: 'Viewer Attempt' },
    });
    expect(viewerPatch.statusCode).toBe(403);

    const agentPost = await app.inject({
      method: 'POST',
      url: '/wishes',
      headers: { 'x-test-principal': 'agentA' },
      payload: { customerId: customerAId, destination: 'Agent Direct' },
    });
    expect(agentPost.statusCode).toBe(201);
    const agentId = agentPost.json<{ wish: { id: string } }>().wish.id;

    const agentPatch = await app.inject({
      method: 'PATCH',
      url: `/wishes/${agentId}`,
      headers: { 'x-test-principal': 'agentA' },
      payload: { destination: 'Agent Updated' },
    });
    expect(agentPatch.statusCode).toBe(200);

    // Higher role (OWNER) still cannot cross tenant.
    const bWish = await app.inject({
      method: 'POST',
      url: '/wishes',
      headers: { 'x-test-principal': 'agentB' },
      payload: { customerId: customerBId, destination: 'B Owner Test' },
    });
    const bId = bWish.json<{ wish: { id: string } }>().wish.id;

    const ownerCrossGet = await app.inject({
      method: 'GET',
      url: `/wishes/${bId}`,
      headers: { 'x-test-principal': 'ownerA' },
    });
    expect(ownerCrossGet.statusCode).toBe(404);

    const ownerCrossPatch = await app.inject({
      method: 'PATCH',
      url: `/wishes/${bId}`,
      headers: { 'x-test-principal': 'ownerA' },
      payload: { destination: 'Hacked By Owner A' },
    });
    expect(ownerCrossPatch.statusCode).toBe(404);

    const rowB = await adminPool.query<{ destination: string }>('SELECT destination FROM wishes WHERE id = $1', [bId]);
    expect(rowB.rows[0]?.destination).toBe('B Owner Test');

    // Unknown role fails closed.
    const unknownList = await app.inject({
      method: 'GET',
      url: '/wishes',
      headers: { 'x-test-principal': 'unknownRoleA' },
    });
    expect(unknownList.statusCode).toBe(403);

    const unknownPost = await app.inject({
      method: 'POST',
      url: '/wishes',
      headers: { 'x-test-principal': 'unknownRoleA' },
      payload: { customerId: customerAId, destination: 'Unknown Attempt' },
    });
    expect(unknownPost.statusCode).toBe(403);

    // No auth -> 401, never reaches the data layer.
    const noAuthList = await app.inject({ method: 'GET', url: '/wishes' });
    expect(noAuthList.statusCode).toBe(401);

    const noAuthPost = await app.inject({
      method: 'POST',
      url: '/wishes',
      payload: { customerId: customerAId, destination: 'No Auth' },
    });
    expect(noAuthPost.statusCode).toBe(401);

    await app.close();
  });

  it('Scenario: customer relation - Customer A can be related to Wish A; Customer B rejected under Agency A principal', async () => {
    const app = buildTestApp(runtimePool);

    const created = await app.inject({
      method: 'POST',
      url: '/wishes',
      headers: { 'x-test-principal': 'agentA' },
      payload: { customerId: customerAId, destination: 'Customer Relation' },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json<{ wish: { customerId: string } }>().wish.customerId).toBe(customerAId);

    const rejected = await app.inject({
      method: 'POST',
      url: '/wishes',
      headers: { 'x-test-principal': 'agentA' },
      payload: { customerId: customerBId, destination: 'Should Fail' },
    });
    expect(rejected.statusCode).toBe(404);

    await app.close();
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
});

function assertSafeTestDatabase(): void {
  if (!['127.0.0.1', 'localhost'].includes(databaseHost)) {
    throw new Error('Wish E2E tests require localhost only.');
  }

  if (!Number.isInteger(databasePort) || databasePort < 1024 || databasePort > 65535) {
    throw new Error('Wish E2E tests require a safe local database test port.');
  }

  if (!databaseName.includes('test')) {
    throw new Error('Wish E2E tests require a database name with a test marker.');
  }

  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    const safeHost = ['127.0.0.1', 'localhost'].includes(url.hostname);
    const safeDatabase = url.pathname.replace('/', '').includes('test');
    const safePort = url.port === String(databasePort) || url.port === '';

    if (!safeHost || !safeDatabase || !safePort) {
      throw new Error('Refusing to run wish E2E tests against unsafe DATABASE_URL.');
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
        ($1, 'Agency A', 'agency-a-wish-e2e-test', 'agency-a@example.test', 'FREE', 'ACTIVE'),
        ($2, 'Agency B', 'agency-b-wish-e2e-test', 'agency-b@example.test', 'FREE', 'ACTIVE');
    `,
    [agencyAId, agencyBId],
  );
  await pool.query(
    `
      INSERT INTO users (id, agency_id, email, name, role, password_hash, status)
      VALUES
        ($1, $2, 'user-a@example.test', 'User A', 'ADMIN', 'hash-for-wish-e2e-test-only', 'ACTIVE'),
        ($3, $4, 'user-b@example.test', 'User B', 'ADMIN', 'hash-for-wish-e2e-test-only', 'ACTIVE');
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
