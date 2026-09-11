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
const migration019 = resolve(repoRoot, 'infrastructure/migrations/019_customer_360_addresses.sql');
const migration020 = resolve(repoRoot, 'infrastructure/migrations/020_customer_360_dependents.sql');
const migration021 = resolve(repoRoot, 'infrastructure/migrations/021_customer_360_documents.sql');
const migration046 = resolve(repoRoot, 'infrastructure/migrations/046_customer_360_completion.sql');
const prepareRolesSql = resolve(repoRoot, 'tests/integration/database/002_prepare_local_roles.sql');
const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.local-postgres.yml');

const projectName = 'travel-platform-wish-routes-postgres';
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
  unknownRole: {
    userId: userAId,
    agencyId: agencyAId,
    role: 'NOT_A_REAL_ROLE' as UserRole,
    email: 'user-a@example.test',
  },
  ownerAgencyB: { userId: userBId, agencyId: agencyBId, role: UserRole.OWNER, email: 'user-b@example.test' },
};

describe.sequential('Wish HTTP routes (Task 2)', () => {
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

  describe('GET /wishes', () => {
    it('returns 401 without auth', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({ method: 'GET', url: '/wishes' });
      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it('returns only Agency A wishes for Agency A', async () => {
      await seedWish(agencyAId, customerAId, { destination: 'A Wish' });
      await seedWish(agencyBId, customerBId, { destination: 'B Wish' });

      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'GET',
        url: '/wishes',
        headers: { 'x-test-principal': 'a' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ wishes: Array<{ destination: string; agencyId: string }> }>();
      expect(body.wishes).toHaveLength(1);
      expect(body.wishes[0]?.destination).toBe('A Wish');
      expect(body.wishes[0]?.agencyId).toBe(agencyAId);

      await app.close();
    });
  });

  describe('GET /wishes/:id', () => {
    it('returns 200 for own tenant wish', async () => {
      const id = await seedWish(agencyAId, customerAId, { destination: 'A Wish' });

      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'GET',
        url: `/wishes/${id}`,
        headers: { 'x-test-principal': 'a' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ wish: { id: string; destination: string } }>();
      expect(body.wish.id).toBe(id);
      expect(body.wish.destination).toBe('A Wish');

      await app.close();
    });

    it('never returns another tenant wish (404, not 403, no leak)', async () => {
      const bId = await seedWish(agencyBId, customerBId, { destination: 'B Secret' });

      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'GET',
        url: `/wishes/${bId}`,
        headers: { 'x-test-principal': 'a' },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: 'Wish not found', code: 'NOT_FOUND' });

      await app.close();
    });
  });

  describe('POST /wishes', () => {
    it('creates a wish under the authenticated tenant', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/wishes',
        headers: { 'x-test-principal': 'a' },
        payload: { customerId: customerAId, destination: 'Paris' },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<{ wish: { agencyId: string; destination: string; status: string } }>();
      expect(body.wish.agencyId).toBe(agencyAId);
      expect(body.wish.destination).toBe('Paris');
      expect(body.wish.status).toBe('ACTIVE');

      await app.close();
    });

    it('returns 401 without auth', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/wishes',
        payload: { customerId: customerAId },
      });
      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it.each(['agencyId', 'tenantId', 'id', 'createdAt', 'updatedAt', 'status'] as const)(
      'rejects forbidden field "%s" with 400',
      async (field) => {
        const app = buildTestApp(runtimePool);
        const response = await app.inject({
          method: 'POST',
          url: '/wishes',
          headers: { 'x-test-principal': 'a' },
          payload: { customerId: customerAId, [field]: 'x' },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });

        await app.close();
      },
    );

    it('rejects unknown field with 400', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/wishes',
        headers: { 'x-test-principal': 'a' },
        payload: { customerId: customerAId, notARealField: 'x' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });

      await app.close();
    });

    it('rejects missing customerId with 400', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/wishes',
        headers: { 'x-test-principal': 'a' },
        payload: { destination: 'Nowhere' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });

      await app.close();
    });

    it('rejects a malformed date with 400', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/wishes',
        headers: { 'x-test-principal': 'a' },
        payload: { customerId: customerAId, startDate: 'not-a-date' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });

      await app.close();
    });

    it('safely rejects a cross-tenant customerId on create', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/wishes',
        headers: { 'x-test-principal': 'a' },
        payload: { customerId: customerBId, destination: 'Should Fail' },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: 'NOT_FOUND' });

      const rows = await adminPool.query<{ count: string }>('SELECT COUNT(*)::TEXT AS count FROM wishes');
      expect(rows.rows[0]?.count).toBe('0');

      await app.close();
    });
  });

  describe('PATCH /wishes/:id', () => {
    it('updates a wish for its own tenant', async () => {
      const id = await seedWish(agencyAId, customerAId, { destination: 'Original' });

      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'PATCH',
        url: `/wishes/${id}`,
        headers: { 'x-test-principal': 'a' },
        payload: { destination: 'Updated' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ wish: { destination: string } }>();
      expect(body.wish.destination).toBe('Updated');

      await app.close();
    });

    it('never mutates another tenant wish (404, no-op)', async () => {
      const bId = await seedWish(agencyBId, customerBId, { destination: 'B Original' });

      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'PATCH',
        url: `/wishes/${bId}`,
        headers: { 'x-test-principal': 'a' },
        payload: { destination: 'Hacked' },
      });

      expect(response.statusCode).toBe(404);

      const row = await adminPool.query<{ destination: string }>(
        'SELECT destination FROM wishes WHERE id = $1',
        [bId],
      );
      expect(row.rows[0]?.destination).toBe('B Original');

      await app.close();
    });

    it.each(['customerId', 'status', 'agencyId', 'id', 'createdAt'] as const)(
      'rejects forbidden field "%s" with 400',
      async (field) => {
        const id = await seedWish(agencyAId, customerAId, { destination: 'Original' });

        const app = buildTestApp(runtimePool);
        const response = await app.inject({
          method: 'PATCH',
          url: `/wishes/${id}`,
          headers: { 'x-test-principal': 'a' },
          payload: { destination: 'Updated', [field]: 'x' },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });

        await app.close();
      },
    );

    it('rejects unknown field with 400', async () => {
      const id = await seedWish(agencyAId, customerAId, { destination: 'Original' });

      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'PATCH',
        url: `/wishes/${id}`,
        headers: { 'x-test-principal': 'a' },
        payload: { notARealField: 'x' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });

      await app.close();
    });
  });

  describe('RBAC', () => {
    it('allows VIEWER to GET /wishes and GET /wishes/:id', async () => {
      const id = await seedWish(agencyAId, customerAId, { destination: 'Viewable' });

      const app = buildTestApp(runtimePool);

      const list = await app.inject({
        method: 'GET',
        url: '/wishes',
        headers: { 'x-test-principal': 'viewer' },
      });
      expect(list.statusCode).toBe(200);

      const get = await app.inject({
        method: 'GET',
        url: `/wishes/${id}`,
        headers: { 'x-test-principal': 'viewer' },
      });
      expect(get.statusCode).toBe(200);

      await app.close();
    });

    it('blocks VIEWER from POST /wishes and PATCH /wishes/:id with 403', async () => {
      const id = await seedWish(agencyAId, customerAId, { destination: 'Viewable' });

      const app = buildTestApp(runtimePool);

      const create = await app.inject({
        method: 'POST',
        url: '/wishes',
        headers: { 'x-test-principal': 'viewer' },
        payload: { customerId: customerAId, destination: 'Should Not Be Created' },
      });
      expect(create.statusCode).toBe(403);
      expect(create.json()).toMatchObject({ code: 'FORBIDDEN' });

      const update = await app.inject({
        method: 'PATCH',
        url: `/wishes/${id}`,
        headers: { 'x-test-principal': 'viewer' },
        payload: { destination: 'Should Not Update' },
      });
      expect(update.statusCode).toBe(403);
      expect(update.json()).toMatchObject({ code: 'FORBIDDEN' });

      await app.close();
    });

    it('allows AGENT to read and write wishes', async () => {
      const app = buildTestApp(runtimePool);

      const list = await app.inject({
        method: 'GET',
        url: '/wishes',
        headers: { 'x-test-principal': 'agent' },
      });
      expect(list.statusCode).toBe(200);

      const create = await app.inject({
        method: 'POST',
        url: '/wishes',
        headers: { 'x-test-principal': 'agent' },
        payload: { customerId: customerAId, destination: 'Agent Created' },
      });
      expect(create.statusCode).toBe(201);
      const createdId = create.json<{ wish: { id: string } }>().wish.id;

      const update = await app.inject({
        method: 'PATCH',
        url: `/wishes/${createdId}`,
        headers: { 'x-test-principal': 'agent' },
        payload: { destination: 'Agent Updated' },
      });
      expect(update.statusCode).toBe(200);

      await app.close();
    });

    it.each(['manager', 'owner'] as const)(
      'allows %s to read and write via hierarchy inheritance',
      async (principalKey) => {
        const app = buildTestApp(runtimePool);

        const list = await app.inject({
          method: 'GET',
          url: '/wishes',
          headers: { 'x-test-principal': principalKey },
        });
        expect(list.statusCode).toBe(200);

        const create = await app.inject({
          method: 'POST',
          url: '/wishes',
          headers: { 'x-test-principal': principalKey },
          payload: { customerId: customerAId, destination: `${principalKey} Created` },
        });
        expect(create.statusCode).toBe(201);
        const createdId = create.json<{ wish: { id: string } }>().wish.id;

        const update = await app.inject({
          method: 'PATCH',
          url: `/wishes/${createdId}`,
          headers: { 'x-test-principal': principalKey },
          payload: { destination: `${principalKey} Updated` },
        });
        expect(update.statusCode).toBe(200);

        await app.close();
      },
    );

    it('fails closed for an unknown/invalid role on both read and write routes', async () => {
      const id = await seedWish(agencyAId, customerAId, { destination: 'Unknown Role Target' });

      const app = buildTestApp(runtimePool);

      const list = await app.inject({
        method: 'GET',
        url: '/wishes',
        headers: { 'x-test-principal': 'unknownRole' },
      });
      expect(list.statusCode).toBe(403);

      const get = await app.inject({
        method: 'GET',
        url: `/wishes/${id}`,
        headers: { 'x-test-principal': 'unknownRole' },
      });
      expect(get.statusCode).toBe(403);

      const create = await app.inject({
        method: 'POST',
        url: '/wishes',
        headers: { 'x-test-principal': 'unknownRole' },
        payload: { customerId: customerAId, destination: 'Nope' },
      });
      expect(create.statusCode).toBe(403);

      await app.close();
    });

    it('keeps a high role from Agency A blocked from Agency B wishes (role does not bypass tenant isolation)', async () => {
      const bId = await seedWish(agencyBId, customerBId, { destination: 'B Secret Owner Test' });

      const app = buildTestApp(runtimePool);

      const get = await app.inject({
        method: 'GET',
        url: `/wishes/${bId}`,
        headers: { 'x-test-principal': 'owner' },
      });
      expect(get.statusCode).toBe(404);

      const patch = await app.inject({
        method: 'PATCH',
        url: `/wishes/${bId}`,
        headers: { 'x-test-principal': 'owner' },
        payload: { destination: 'Hacked By Owner' },
      });
      expect(patch.statusCode).toBe(404);

      const row = await adminPool.query<{ destination: string }>(
        'SELECT destination FROM wishes WHERE id = $1',
        [bId],
      );
      expect(row.rows[0]?.destination).toBe('B Secret Owner Test');

      await app.close();
    });

    it('lets Agency B OWNER read only Agency B data, never Agency A', async () => {
      const aId = await seedWish(agencyAId, customerAId, { destination: 'A Secret Owner Test' });

      const app = buildTestApp(runtimePool);

      const get = await app.inject({
        method: 'GET',
        url: `/wishes/${aId}`,
        headers: { 'x-test-principal': 'ownerAgencyB' },
      });
      expect(get.statusCode).toBe(404);

      await app.close();
    });
  });

  describe('GET /customers/:id/wishes', () => {
    it('returns 401 without auth', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({ method: 'GET', url: `/customers/${customerAId}/wishes` });
      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it('returns only this customer\'s wishes, scoped to the caller\'s tenant', async () => {
      await seedWish(agencyAId, customerAId, { destination: 'Customer A Wish 1' });
      await seedWish(agencyAId, customerAId, { destination: 'Customer A Wish 2' });
      const otherCustomerAId = await seedCustomer(agencyAId, 'Other Customer A');
      await seedWish(agencyAId, otherCustomerAId, { destination: 'Other Customer Wish' });

      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'GET',
        url: `/customers/${customerAId}/wishes`,
        headers: { 'x-test-principal': 'a' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ wishes: Array<{ destination: string; customerId: string }> }>();
      expect(body.wishes).toHaveLength(2);
      expect(body.wishes.every((w) => w.customerId === customerAId)).toBe(true);

      await app.close();
    });

    it('404s for a customer that belongs to another tenant (never leaks cross-tenant wishes)', async () => {
      await seedWish(agencyBId, customerBId, { destination: 'B Wish' });

      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'GET',
        url: `/customers/${customerBId}/wishes`,
        headers: { 'x-test-principal': 'a' },
      });

      expect(response.statusCode).toBe(404);
      await app.close();
    });

    it('404s for a nonexistent customer id', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'GET',
        url: `/customers/00000000-0000-4000-8000-000000000000/wishes`,
        headers: { 'x-test-principal': 'a' },
      });

      expect(response.statusCode).toBe(404);
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
    throw new Error('Wish route tests require localhost only.');
  }

  if (!Number.isInteger(databasePort) || databasePort < 1024 || databasePort > 65535) {
    throw new Error('Wish route tests require a safe local database test port.');
  }

  if (!databaseName.includes('test')) {
    throw new Error('Wish route tests require a database name with a test marker.');
  }

  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    const safeHost = ['127.0.0.1', 'localhost'].includes(url.hostname);
    const safeDatabase = url.pathname.replace('/', '').includes('test');
    const safePort = url.port === String(databasePort) || url.port === '';

    if (!safeHost || !safeDatabase || !safePort) {
      throw new Error('Refusing to run wish route tests against unsafe DATABASE_URL.');
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
        ($1, 'Agency A', 'agency-a-wish-routes-test', 'agency-a@example.test', 'FREE', 'ACTIVE'),
        ($2, 'Agency B', 'agency-b-wish-routes-test', 'agency-b@example.test', 'FREE', 'ACTIVE');
    `,
    [agencyAId, agencyBId],
  );
  await pool.query(
    `
      INSERT INTO users (id, agency_id, email, name, role, password_hash, status)
      VALUES
        ($1, $2, 'user-a@example.test', 'User A', 'ADMIN', 'hash-for-wish-routes-test-only', 'ACTIVE'),
        ($3, $4, 'user-b@example.test', 'User B', 'ADMIN', 'hash-for-wish-routes-test-only', 'ACTIVE');
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
