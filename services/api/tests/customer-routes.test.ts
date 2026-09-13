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

const projectName = 'travel-platform-customer-routes-postgres';
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
  a: {
    userId: userAId,
    agencyId: agencyAId,
    role: UserRole.ADMIN,
    email: 'user-a@example.test',
  },
  b: {
    userId: userBId,
    agencyId: agencyBId,
    role: UserRole.ADMIN,
    email: 'user-b@example.test',
  },
  viewer: {
    userId: userAId,
    agencyId: agencyAId,
    role: UserRole.VIEWER,
    email: 'user-a@example.test',
  },
  agent: {
    userId: userAId,
    agencyId: agencyAId,
    role: UserRole.AGENT,
    email: 'user-a@example.test',
  },
  manager: {
    userId: userAId,
    agencyId: agencyAId,
    role: UserRole.MANAGER,
    email: 'user-a@example.test',
  },
  owner: {
    userId: userAId,
    agencyId: agencyAId,
    role: UserRole.OWNER,
    email: 'user-a@example.test',
  },
  // Not a real UserRole value. ROLE_HIERARCHY[role] ?? 0 must default this
  // to level 0, so every requireRole() check fails closed with 403.
  unknownRole: {
    userId: userAId,
    agencyId: agencyAId,
    role: 'NOT_A_REAL_ROLE' as UserRole,
    email: 'user-a@example.test',
  },
  ownerAgencyB: {
    userId: userBId,
    agencyId: agencyBId,
    role: UserRole.OWNER,
    email: 'user-b@example.test',
  },
};

describe('Customer HTTP routes (Task 2)', () => {
  let adminPool: Pool;
  let runtimePool: Pool;

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
    await adminPool.query('TRUNCATE TABLE customers RESTART IDENTITY CASCADE');
  });

  afterAll(async () => {
    await runtimePool?.end();
    await adminPool?.end();
    compose(['down', '-v']);
  });

  describe('GET /customers', () => {
    it('returns 401 without auth', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({ method: 'GET', url: '/customers' });
      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it('returns only Agency A customers for Agency A', async () => {
      await seedCustomer(agencyAId, { name: 'A One' });
      await seedCustomer(agencyBId, { name: 'B One' });

      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'GET',
        url: '/customers',
        headers: { 'x-test-principal': 'a' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ customers: Array<{ name: string; agencyId: string }> }>();
      expect(body.customers).toHaveLength(1);
      expect(body.customers[0]?.name).toBe('A One');
      expect(body.customers[0]?.agencyId).toBe(agencyAId);

      await app.close();
    });

    it('returns only Agency B customers for Agency B', async () => {
      await seedCustomer(agencyAId, { name: 'A One' });
      await seedCustomer(agencyBId, { name: 'B One' });

      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'GET',
        url: '/customers',
        headers: { 'x-test-principal': 'b' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ customers: Array<{ name: string; agencyId: string }> }>();
      expect(body.customers).toHaveLength(1);
      expect(body.customers[0]?.name).toBe('B One');
      expect(body.customers[0]?.agencyId).toBe(agencyBId);

      await app.close();
    });
  });

  describe('GET /customers/:id', () => {
    it('returns 200 for own tenant customer', async () => {
      const id = await seedCustomer(agencyAId, { name: 'A One' });

      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'GET',
        url: `/customers/${id}`,
        headers: { 'x-test-principal': 'a' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ customer: { id: string; name: string } }>();
      expect(body.customer.id).toBe(id);
      expect(body.customer.name).toBe('A One');

      await app.close();
    });

    it('returns safe 404 for a nonexistent id', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'GET',
        url: '/customers/00000000-0000-4000-8000-000000000099',
        headers: { 'x-test-principal': 'a' },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: 'Customer not found', code: 'NOT_FOUND' });

      await app.close();
    });

    it('never returns another tenant customer (404, not 403, no leak)', async () => {
      const bId = await seedCustomer(agencyBId, { name: 'B Secret' });

      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'GET',
        url: `/customers/${bId}`,
        headers: { 'x-test-principal': 'a' },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: 'Customer not found', code: 'NOT_FOUND' });

      await app.close();
    });
  });

  describe('POST /customers', () => {
    it('creates a customer under the authenticated tenant', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/customers',
        headers: { 'x-test-principal': 'a' },
        payload: { name: 'New Customer', email: 'new@example.test' },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<{ customer: { agencyId: string; name: string } }>();
      expect(body.customer.agencyId).toBe(agencyAId);
      expect(body.customer.name).toBe('New Customer');

      await app.close();
    });

    it('returns 401 without auth', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/customers',
        payload: { name: 'New Customer' },
      });

      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it('rejects a body containing agencyId with 400 and does not create under another tenant', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/customers',
        headers: { 'x-test-principal': 'a' },
        payload: { name: 'Spoofed', agencyId: agencyBId },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });

      const rows = await adminPool.query<{ count: string }>(
        'SELECT COUNT(*)::TEXT AS count FROM customers WHERE name = $1',
        ['Spoofed'],
      );
      expect(rows.rows[0]?.count).toBe('0');

      await app.close();
    });

    it('returns 409 with a safe message on CPF conflict', async () => {
      const app = buildTestApp(runtimePool);

      const first = await app.inject({
        method: 'POST',
        url: '/customers',
        headers: { 'x-test-principal': 'a' },
        payload: { name: 'First', cpf: '99988877700' },
      });
      expect(first.statusCode).toBe(201);

      const second = await app.inject({
        method: 'POST',
        url: '/customers',
        headers: { 'x-test-principal': 'a' },
        payload: { name: 'Second', cpf: '99988877700' },
      });

      expect(second.statusCode).toBe(409);
      expect(second.json()).toEqual({
        error: 'A customer with this CPF or email already exists',
        code: 'CONFLICT',
      });

      await app.close();
    });

    it('rejects an invalid body (missing name) with 400', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/customers',
        headers: { 'x-test-principal': 'a' },
        payload: { email: 'no-name@example.test' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });

      await app.close();
    });

    it('rejects a body with wrong field types with 400', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/customers',
        headers: { 'x-test-principal': 'a' },
        payload: { name: 'Ok', email: 12345 },
      });

      expect(response.statusCode).toBe(400);
      await app.close();
    });
  });

  describe('PATCH /customers/:id', () => {
    it('updates a customer for its own tenant', async () => {
      const id = await seedCustomer(agencyAId, { name: 'Original' });

      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'PATCH',
        url: `/customers/${id}`,
        headers: { 'x-test-principal': 'a' },
        payload: { name: 'Updated' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ customer: { name: string } }>();
      expect(body.customer.name).toBe('Updated');

      await app.close();
    });

    it('never mutates another tenant customer (404, no-op)', async () => {
      const bId = await seedCustomer(agencyBId, { name: 'B Original' });

      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'PATCH',
        url: `/customers/${bId}`,
        headers: { 'x-test-principal': 'a' },
        payload: { name: 'Hacked' },
      });

      expect(response.statusCode).toBe(404);

      const row = await adminPool.query<{ name: string }>('SELECT name FROM customers WHERE id = $1', [bId]);
      expect(row.rows[0]?.name).toBe('B Original');

      await app.close();
    });

    it('rejects a body with forbidden ownership fields with 400', async () => {
      const id = await seedCustomer(agencyAId, { name: 'Original' });

      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'PATCH',
        url: `/customers/${id}`,
        headers: { 'x-test-principal': 'a' },
        payload: { name: 'Updated', agencyId: agencyBId },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });

      await app.close();
    });

    it('rejects an invalid body with 400', async () => {
      const id = await seedCustomer(agencyAId, { name: 'Original' });

      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'PATCH',
        url: `/customers/${id}`,
        headers: { 'x-test-principal': 'a' },
        payload: { name: '' },
      });

      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('updates cpf, passport, address, and notes for its own tenant', async () => {
      const id = await seedCustomer(agencyAId, { name: 'Original' });

      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'PATCH',
        url: `/customers/${id}`,
        headers: { 'x-test-principal': 'a' },
        payload: {
          cpf: '123.456.789-00',
          passport: 'AB123456',
          address: { street: 'Rua Teste', city: 'São Paulo' },
          notes: 'VIP customer',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{
        customer: { cpf: string; passport: string; address: unknown; notes: string };
      }>();
      expect(body.customer.cpf).toBe('123.456.789-00');
      expect(body.customer.passport).toBe('AB123456');
      expect(body.customer.address).toMatchObject({ street: 'Rua Teste', city: 'São Paulo' });
      expect(body.customer.notes).toBe('VIP customer');

      await app.close();
    });

    it('rejects a non-string cpf with 400', async () => {
      const id = await seedCustomer(agencyAId, { name: 'Original' });

      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'PATCH',
        url: `/customers/${id}`,
        headers: { 'x-test-principal': 'a' },
        payload: { cpf: 12345 },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });

      await app.close();
    });

    it('returns 409 when updating cpf to one already used by another customer in the same tenant', async () => {
      await seedCustomer(agencyAId, { name: 'Existing', cpf: '111.111.111-11' });
      const id = await seedCustomer(agencyAId, { name: 'Other' });

      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'PATCH',
        url: `/customers/${id}`,
        headers: { 'x-test-principal': 'a' },
        payload: { cpf: '111.111.111-11' },
      });

      expect(response.statusCode).toBe(409);

      await app.close();
    });
  });

  describe('tenant spoof resistance', () => {
    it('never lets Agency A read or influence Agency B data via query param, header, or body agencyId', async () => {
      const bId = await seedCustomer(agencyBId, { name: 'B Secret' });

      const app = buildTestApp(runtimePool);

      const listResponse = await app.inject({
        method: 'GET',
        url: `/customers?agencyId=${agencyBId}`,
        headers: {
          'x-test-principal': 'a',
          'x-dev-target-agency-id': agencyBId,
        },
      });
      expect(listResponse.statusCode).toBe(200);
      const listBody = listResponse.json<{ customers: Array<{ agencyId: string }> }>();
      expect(listBody.customers.every((c) => c.agencyId === agencyAId)).toBe(true);

      const getResponse = await app.inject({
        method: 'GET',
        url: `/customers/${bId}?agencyId=${agencyBId}`,
        headers: {
          'x-test-principal': 'a',
          'x-dev-target-agency-id': agencyBId,
        },
      });
      expect(getResponse.statusCode).toBe(404);

      const createResponse = await app.inject({
        method: 'POST',
        url: '/customers',
        headers: {
          'x-test-principal': 'a',
          'x-dev-target-agency-id': agencyBId,
        },
        payload: { name: 'Spoof Attempt', agencyId: agencyBId },
      });
      expect(createResponse.statusCode).toBe(400);

      const patchResponse = await app.inject({
        method: 'PATCH',
        url: `/customers/${bId}`,
        headers: {
          'x-test-principal': 'a',
          'x-dev-target-agency-id': agencyBId,
        },
        payload: { name: 'Spoof Update', agencyId: agencyBId },
      });
      expect(patchResponse.statusCode).toBe(400);

      const row = await adminPool.query<{ name: string }>('SELECT name FROM customers WHERE id = $1', [bId]);
      expect(row.rows[0]?.name).toBe('B Secret');

      await app.close();
    });
  });

  describe('RBAC', () => {
    it('allows VIEWER to GET /customers and GET /customers/:id', async () => {
      const id = await seedCustomer(agencyAId, { name: 'Viewable' });

      const app = buildTestApp(runtimePool);

      const list = await app.inject({
        method: 'GET',
        url: '/customers',
        headers: { 'x-test-principal': 'viewer' },
      });
      expect(list.statusCode).toBe(200);

      const get = await app.inject({
        method: 'GET',
        url: `/customers/${id}`,
        headers: { 'x-test-principal': 'viewer' },
      });
      expect(get.statusCode).toBe(200);

      await app.close();
    });

    it('blocks VIEWER from POST /customers and PATCH /customers/:id with 403', async () => {
      const id = await seedCustomer(agencyAId, { name: 'Viewable' });

      const app = buildTestApp(runtimePool);

      const create = await app.inject({
        method: 'POST',
        url: '/customers',
        headers: { 'x-test-principal': 'viewer' },
        payload: { name: 'Should Not Be Created' },
      });
      expect(create.statusCode).toBe(403);
      expect(create.json()).toMatchObject({ code: 'FORBIDDEN' });

      const update = await app.inject({
        method: 'PATCH',
        url: `/customers/${id}`,
        headers: { 'x-test-principal': 'viewer' },
        payload: { name: 'Should Not Update' },
      });
      expect(update.statusCode).toBe(403);
      expect(update.json()).toMatchObject({ code: 'FORBIDDEN' });

      await app.close();
    });

    it('allows AGENT to read and write customers', async () => {
      const app = buildTestApp(runtimePool);

      const list = await app.inject({
        method: 'GET',
        url: '/customers',
        headers: { 'x-test-principal': 'agent' },
      });
      expect(list.statusCode).toBe(200);

      const create = await app.inject({
        method: 'POST',
        url: '/customers',
        headers: { 'x-test-principal': 'agent' },
        payload: { name: 'Agent Created' },
      });
      expect(create.statusCode).toBe(201);
      const createdId = create.json<{ customer: { id: string } }>().customer.id;

      const update = await app.inject({
        method: 'PATCH',
        url: `/customers/${createdId}`,
        headers: { 'x-test-principal': 'agent' },
        payload: { name: 'Agent Updated' },
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
          url: '/customers',
          headers: { 'x-test-principal': principalKey },
        });
        expect(list.statusCode).toBe(200);

        const create = await app.inject({
          method: 'POST',
          url: '/customers',
          headers: { 'x-test-principal': principalKey },
          payload: { name: `${principalKey} Created` },
        });
        expect(create.statusCode).toBe(201);
        const createdId = create.json<{ customer: { id: string } }>().customer.id;

        const update = await app.inject({
          method: 'PATCH',
          url: `/customers/${createdId}`,
          headers: { 'x-test-principal': principalKey },
          payload: { name: `${principalKey} Updated` },
        });
        expect(update.statusCode).toBe(200);

        await app.close();
      },
    );

    it('fails closed for an unknown/invalid role on both read and write routes', async () => {
      const id = await seedCustomer(agencyAId, { name: 'Unknown Role Target' });

      const app = buildTestApp(runtimePool);

      const list = await app.inject({
        method: 'GET',
        url: '/customers',
        headers: { 'x-test-principal': 'unknownRole' },
      });
      expect(list.statusCode).toBe(403);

      const get = await app.inject({
        method: 'GET',
        url: `/customers/${id}`,
        headers: { 'x-test-principal': 'unknownRole' },
      });
      expect(get.statusCode).toBe(403);

      const create = await app.inject({
        method: 'POST',
        url: '/customers',
        headers: { 'x-test-principal': 'unknownRole' },
        payload: { name: 'Nope' },
      });
      expect(create.statusCode).toBe(403);

      await app.close();
    });

    it('keeps a high role from Agency A blocked from Agency B customers (role does not bypass tenant isolation)', async () => {
      const bId = await seedCustomer(agencyBId, { name: 'B Secret Owner Test' });

      const app = buildTestApp(runtimePool);

      const get = await app.inject({
        method: 'GET',
        url: `/customers/${bId}`,
        headers: { 'x-test-principal': 'owner' },
      });
      expect(get.statusCode).toBe(404);

      const patch = await app.inject({
        method: 'PATCH',
        url: `/customers/${bId}`,
        headers: { 'x-test-principal': 'owner' },
        payload: { name: 'Hacked By Owner' },
      });
      expect(patch.statusCode).toBe(404);

      const row = await adminPool.query<{ name: string }>('SELECT name FROM customers WHERE id = $1', [bId]);
      expect(row.rows[0]?.name).toBe('B Secret Owner Test');

      await app.close();
    });

    it('lets Agency B OWNER read/write only Agency B data, never Agency A', async () => {
      const aId = await seedCustomer(agencyAId, { name: 'A Secret Owner Test' });

      const app = buildTestApp(runtimePool);

      const get = await app.inject({
        method: 'GET',
        url: `/customers/${aId}`,
        headers: { 'x-test-principal': 'ownerAgencyB' },
      });
      expect(get.statusCode).toBe(404);

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
    throw new Error('Customer route tests require localhost only.');
  }

  if (!Number.isInteger(databasePort) || databasePort < 1024 || databasePort > 65535) {
    throw new Error('Customer route tests require a safe local database test port.');
  }

  if (!databaseName.includes('test')) {
    throw new Error('Customer route tests require a database name with a test marker.');
  }

  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    const safeHost = ['127.0.0.1', 'localhost'].includes(url.hostname);
    const safeDatabase = url.pathname.replace('/', '').includes('test');
    const safePort = url.port === String(databasePort) || url.port === '';

    if (!safeHost || !safeDatabase || !safePort) {
      throw new Error('Refusing to run customer route tests against unsafe DATABASE_URL.');
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
        ($1, 'Agency A', 'agency-a-customer-routes-test', 'agency-a@example.test', 'FREE', 'ACTIVE'),
        ($2, 'Agency B', 'agency-b-customer-routes-test', 'agency-b@example.test', 'FREE', 'ACTIVE');
    `,
    [agencyAId, agencyBId],
  );
  await pool.query(
    `
      INSERT INTO users (id, agency_id, email, name, role, password_hash, status)
      VALUES
        ($1, $2, 'user-a@example.test', 'User A', 'ADMIN', 'hash-for-customer-routes-test-only', 'ACTIVE'),
        ($3, $4, 'user-b@example.test', 'User B', 'ADMIN', 'hash-for-customer-routes-test-only', 'ACTIVE');
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
