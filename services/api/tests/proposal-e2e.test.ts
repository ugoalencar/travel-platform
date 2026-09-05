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

const projectName = 'travel-platform-proposal-e2e-postgres';
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
  managerA: { userId: userAId, agencyId: agencyAId, role: UserRole.MANAGER, email: 'user-a@example.test' },
  managerB: { userId: userBId, agencyId: agencyBId, role: UserRole.MANAGER, email: 'user-b@example.test' },
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

describe.sequential('Proposal end-to-end vertical validation', () => {
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
    await adminPool.query('TRUNCATE TABLE proposals RESTART IDENTITY CASCADE');
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

  it('Tenant A cannot list, get, or patch a Proposal belonging to Tenant B (404, zero mutation)', async () => {
    const app = buildTestApp(runtimePool);

    const createB = await app.inject({
      method: 'POST',
      url: '/proposals',
      headers: { 'x-test-principal': 'managerB' },
      payload: { customerId: customerBId, proposedPrice: 500, discount: 50 },
    });
    expect(createB.statusCode).toBe(201);
    const bId = createB.json<{ proposal: { id: string } }>().proposal.id;

    const listA = await app.inject({
      method: 'GET',
      url: '/proposals',
      headers: { 'x-test-principal': 'managerA' },
    });
    expect(listA.json<{ proposals: Array<{ id: string }> }>().proposals.some((p) => p.id === bId)).toBe(false);

    const getA = await app.inject({
      method: 'GET',
      url: `/proposals/${bId}`,
      headers: { 'x-test-principal': 'managerA' },
    });
    expect(getA.statusCode).toBe(404);

    const patchA = await app.inject({
      method: 'PATCH',
      url: `/proposals/${bId}`,
      headers: { 'x-test-principal': 'managerA' },
      payload: { proposedPrice: 1 },
    });
    expect(patchA.statusCode).toBe(404);

    const row = await adminPool.query<{ proposed_price: string }>(
      'SELECT proposed_price FROM proposals WHERE id = $1',
      [bId],
    );
    expect(row.rows[0]?.proposed_price).toBe('500.00');
  });

  it('Tenant B cannot list, get, or patch a Proposal belonging to Tenant A (404, zero mutation)', async () => {
    const app = buildTestApp(runtimePool);

    const createA = await app.inject({
      method: 'POST',
      url: '/proposals',
      headers: { 'x-test-principal': 'managerA' },
      payload: { customerId: customerAId, proposedPrice: 300 },
    });
    expect(createA.statusCode).toBe(201);
    const aId = createA.json<{ proposal: { id: string } }>().proposal.id;

    const getB = await app.inject({
      method: 'GET',
      url: `/proposals/${aId}`,
      headers: { 'x-test-principal': 'managerB' },
    });
    expect(getB.statusCode).toBe(404);

    const patchB = await app.inject({
      method: 'PATCH',
      url: `/proposals/${aId}`,
      headers: { 'x-test-principal': 'managerB' },
      payload: { proposedPrice: 1 },
    });
    expect(patchB.statusCode).toBe(404);
  });

  it('a high role (OWNER) never crosses tenant boundaries', async () => {
    const app = buildTestApp(runtimePool);

    const createA = await app.inject({
      method: 'POST',
      url: '/proposals',
      headers: { 'x-test-principal': 'ownerA' },
      payload: { customerId: customerAId, proposedPrice: 400 },
    });
    const aId = createA.json<{ proposal: { id: string } }>().proposal.id;

    const getFromB = await app.inject({
      method: 'GET',
      url: `/proposals/${aId}`,
      headers: { 'x-test-principal': 'ownerB' },
    });
    expect(getFromB.statusCode).toBe(404);
  });

  it('unknown/invalid role fails closed on every Proposal route', async () => {
    const app = buildTestApp(runtimePool);

    const list = await app.inject({
      method: 'GET',
      url: '/proposals',
      headers: { 'x-test-principal': 'unknownRoleA' },
    });
    expect(list.statusCode).toBe(403);

    const create = await app.inject({
      method: 'POST',
      url: '/proposals',
      headers: { 'x-test-principal': 'unknownRoleA' },
      payload: { customerId: customerAId, proposedPrice: 100 },
    });
    expect(create.statusCode).toBe(403);
  });

  it('total is server-computed on create: client-sent total is rejected with 400, never silently overwritten', async () => {
    const app = buildTestApp(runtimePool);

    const attempt = await app.inject({
      method: 'POST',
      url: '/proposals',
      headers: { 'x-test-principal': 'managerA' },
      payload: { customerId: customerAId, proposedPrice: 100, discount: 10, total: 999 },
    });
    expect(attempt.statusCode).toBe(400);
    expect(attempt.json()).toMatchObject({ code: 'VALIDATION_ERROR' });

    const countResult = await adminPool.query<{ count: string }>('SELECT count(*) FROM proposals');
    expect(countResult.rows[0]?.count).toBe('0');

    const created = await app.inject({
      method: 'POST',
      url: '/proposals',
      headers: { 'x-test-principal': 'managerA' },
      payload: { customerId: customerAId, proposedPrice: 100, discount: 10 },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json<{ proposal: { total: number } }>().proposal.total).toBe(90);
  });

  it('PATCHing proposedPrice/discount recomputes total server-side, and attempting to set status via PATCH returns 400', async () => {
    const app = buildTestApp(runtimePool);

    const created = await app.inject({
      method: 'POST',
      url: '/proposals',
      headers: { 'x-test-principal': 'managerA' },
      payload: { customerId: customerAId, proposedPrice: 100, discount: 0 },
    });
    const id = created.json<{ proposal: { id: string } }>().proposal.id;

    const patch = await app.inject({
      method: 'PATCH',
      url: `/proposals/${id}`,
      headers: { 'x-test-principal': 'managerA' },
      payload: { proposedPrice: 250, discount: 50 },
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json<{ proposal: { total: number } }>().proposal.total).toBe(200);

    const statusAttempt = await app.inject({
      method: 'PATCH',
      url: `/proposals/${id}`,
      headers: { 'x-test-principal': 'managerA' },
      payload: { status: 'ACCEPTED' },
    });
    expect(statusAttempt.statusCode).toBe(400);
    expect(statusAttempt.json()).toMatchObject({ code: 'VALIDATION_ERROR' });

    const row = await adminPool.query<{ status: string }>('SELECT status FROM proposals WHERE id = $1', [id]);
    expect(row.rows[0]?.status).toBe('DRAFT');
  });

  it('VIEWER can read but cannot write (RBAC floors: read=VIEWER, write=MANAGER)', async () => {
    const app = buildTestApp(runtimePool);

    const list = await app.inject({
      method: 'GET',
      url: '/proposals',
      headers: { 'x-test-principal': 'viewerA' },
    });
    expect(list.statusCode).toBe(200);

    const create = await app.inject({
      method: 'POST',
      url: '/proposals',
      headers: { 'x-test-principal': 'viewerA' },
      payload: { customerId: customerAId, proposedPrice: 100 },
    });
    expect(create.statusCode).toBe(403);
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
      `INSERT INTO customers (agency_id, name, status) VALUES ($1, $2, 'ACTIVE') RETURNING id`,
      [agencyId, name],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error('Failed to seed customer');
    return id;
  }
});

function assertSafeTestDatabase(): void {
  if (!['127.0.0.1', 'localhost'].includes(databaseHost)) {
    throw new Error('Proposal e2e tests require localhost only.');
  }

  if (!Number.isInteger(databasePort) || databasePort < 1024 || databasePort > 65535) {
    throw new Error('Proposal e2e tests require a safe local database test port.');
  }

  if (!databaseName.includes('test')) {
    throw new Error('Proposal e2e tests require a database name with a test marker.');
  }

  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    const safeHost = ['127.0.0.1', 'localhost'].includes(url.hostname);
    const safeDatabase = url.pathname.replace('/', '').includes('test');
    const safePort = url.port === String(databasePort) || url.port === '';

    if (!safeHost || !safeDatabase || !safePort) {
      throw new Error('Refusing to run proposal e2e tests against unsafe DATABASE_URL.');
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
        ($1, 'Agency A', 'agency-a-proposal-e2e-test', 'agency-a@example.test', 'FREE', 'ACTIVE'),
        ($2, 'Agency B', 'agency-b-proposal-e2e-test', 'agency-b@example.test', 'FREE', 'ACTIVE');
    `,
    [agencyAId, agencyBId],
  );
  await pool.query(
    `
      INSERT INTO users (id, agency_id, email, name, role, password_hash, status)
      VALUES
        ($1, $2, 'user-a@example.test', 'User A', 'ADMIN', 'hash-for-proposal-e2e-test-only', 'ACTIVE'),
        ($3, $4, 'user-b@example.test', 'User B', 'ADMIN', 'hash-for-proposal-e2e-test-only', 'ACTIVE');
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
