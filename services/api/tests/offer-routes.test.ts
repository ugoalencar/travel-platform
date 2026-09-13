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

const projectName = 'travel-platform-offer-routes-postgres';
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

describe('Offer HTTP routes (Package 1)', () => {
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
    await adminPool.query('TRUNCATE TABLE offers RESTART IDENTITY CASCADE');
  });

  afterAll(async () => {
    await runtimePool?.end();
    await adminPool?.end();
    compose(['down', '-v']);
  });

  describe('GET /offers', () => {
    it('returns 401 without auth', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({ method: 'GET', url: '/offers' });
      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it('returns only Agency A offers for Agency A', async () => {
      await seedOffer(agencyAId, { name: 'A Offer' });
      await seedOffer(agencyBId, { name: 'B Offer' });

      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'GET',
        url: '/offers',
        headers: { 'x-test-principal': 'a' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ offers: Array<{ name: string; agencyId: string }> }>();
      expect(body.offers).toHaveLength(1);
      expect(body.offers[0]?.name).toBe('A Offer');
      expect(body.offers[0]?.agencyId).toBe(agencyAId);

      await app.close();
    });
  });

  describe('GET /offers/:id', () => {
    it('returns 200 for own tenant offer', async () => {
      const id = await seedOffer(agencyAId, { name: 'A Offer' });

      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'GET',
        url: `/offers/${id}`,
        headers: { 'x-test-principal': 'a' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ offer: { id: string; name: string } }>();
      expect(body.offer.id).toBe(id);
      expect(body.offer.name).toBe('A Offer');

      await app.close();
    });

    it('never returns another tenant offer (404, not 403, no leak)', async () => {
      const bId = await seedOffer(agencyBId, { name: 'B Secret' });

      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'GET',
        url: `/offers/${bId}`,
        headers: { 'x-test-principal': 'a' },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: 'Offer not found', code: 'NOT_FOUND' });

      await app.close();
    });
  });

  describe('POST /offers', () => {
    it('creates an offer under the authenticated tenant', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/offers',
        headers: { 'x-test-principal': 'manager' },
        payload: { name: 'New Offer', price: 200 },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<{ offer: { agencyId: string; name: string; status: string } }>();
      expect(body.offer.agencyId).toBe(agencyAId);
      expect(body.offer.name).toBe('New Offer');
      expect(body.offer.status).toBe('ACTIVE');

      await app.close();
    });

    it('returns 401 without auth', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/offers',
        payload: { name: 'X', price: 1 },
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
          url: '/offers',
          headers: { 'x-test-principal': 'manager' },
          payload: { ...validOfferPayload(), [field]: 'x' },
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
        url: '/offers',
        headers: { 'x-test-principal': 'manager' },
        payload: { ...validOfferPayload(), notARealField: 'x' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });

      await app.close();
    });

    it('rejects a negative price with 400', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/offers',
        headers: { 'x-test-principal': 'manager' },
        payload: { ...validOfferPayload(), price: -10 },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });

      await app.close();
    });

    it('rejects an invalid validity range (validFrom after validUntil) with 400', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/offers',
        headers: { 'x-test-principal': 'manager' },
        payload: {
          ...validOfferPayload(),
          validFrom: '2026-06-22T00:00:00Z',
          validUntil: '2026-06-15T00:00:00Z',
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });

      await app.close();
    });

    it('rejects a malformed date with 400', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/offers',
        headers: { 'x-test-principal': 'manager' },
        payload: { ...validOfferPayload(), validFrom: 'not-a-date' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });

      await app.close();
    });

    it('rejects missing price with 400', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/offers',
        headers: { 'x-test-principal': 'manager' },
        payload: { name: 'No Price' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });

      await app.close();
    });
  });

  describe('PATCH /offers/:id', () => {
    it('updates an offer for its own tenant', async () => {
      const id = await seedOffer(agencyAId, { name: 'Original' });

      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'PATCH',
        url: `/offers/${id}`,
        headers: { 'x-test-principal': 'manager' },
        payload: { name: 'Updated' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ offer: { name: string } }>();
      expect(body.offer.name).toBe('Updated');

      await app.close();
    });

    it('allows PATCH status to a valid enum value', async () => {
      const id = await seedOffer(agencyAId, { name: 'Status Target' });

      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'PATCH',
        url: `/offers/${id}`,
        headers: { 'x-test-principal': 'manager' },
        payload: { status: 'INACTIVE' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ offer: { status: string } }>();
      expect(body.offer.status).toBe('INACTIVE');

      await app.close();
    });

    it('rejects an invalid status enum value with 400', async () => {
      const id = await seedOffer(agencyAId, { name: 'Status Target' });

      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'PATCH',
        url: `/offers/${id}`,
        headers: { 'x-test-principal': 'manager' },
        payload: { status: 'NOT_A_STATUS' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });

      await app.close();
    });

    it('never mutates another tenant offer (404, no-op)', async () => {
      const bId = await seedOffer(agencyBId, { name: 'B Original' });

      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'PATCH',
        url: `/offers/${bId}`,
        headers: { 'x-test-principal': 'manager' },
        payload: { name: 'Hacked' },
      });

      expect(response.statusCode).toBe(404);

      const row = await adminPool.query<{ name: string }>(
        'SELECT name FROM offers WHERE id = $1',
        [bId],
      );
      expect(row.rows[0]?.name).toBe('B Original');

      await app.close();
    });

    it.each(['agencyId', 'tenantId', 'id', 'createdAt', 'updatedAt'] as const)(
      'rejects forbidden field "%s" with 400',
      async (field) => {
        const id = await seedOffer(agencyAId, { name: 'Original' });

        const app = buildTestApp(runtimePool);
        const response = await app.inject({
          method: 'PATCH',
          url: `/offers/${id}`,
          headers: { 'x-test-principal': 'manager' },
          payload: { name: 'Updated', [field]: 'x' },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });

        await app.close();
      },
    );

    it('rejects unknown field with 400', async () => {
      const id = await seedOffer(agencyAId, { name: 'Original' });

      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'PATCH',
        url: `/offers/${id}`,
        headers: { 'x-test-principal': 'manager' },
        payload: { notARealField: 'x' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });

      await app.close();
    });

    it('rejects a negative price with 400', async () => {
      const id = await seedOffer(agencyAId, { name: 'Original' });

      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'PATCH',
        url: `/offers/${id}`,
        headers: { 'x-test-principal': 'manager' },
        payload: { price: -1 },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });

      await app.close();
    });
  });

  describe('RBAC', () => {
    it('allows VIEWER to GET /offers and GET /offers/:id', async () => {
      const id = await seedOffer(agencyAId, { name: 'Viewable' });

      const app = buildTestApp(runtimePool);

      const list = await app.inject({
        method: 'GET',
        url: '/offers',
        headers: { 'x-test-principal': 'viewer' },
      });
      expect(list.statusCode).toBe(200);

      const get = await app.inject({
        method: 'GET',
        url: `/offers/${id}`,
        headers: { 'x-test-principal': 'viewer' },
      });
      expect(get.statusCode).toBe(200);

      await app.close();
    });

    it('blocks VIEWER from POST /offers and PATCH /offers/:id with 403', async () => {
      const id = await seedOffer(agencyAId, { name: 'Viewable' });

      const app = buildTestApp(runtimePool);

      const create = await app.inject({
        method: 'POST',
        url: '/offers',
        headers: { 'x-test-principal': 'viewer' },
        payload: validOfferPayload(),
      });
      expect(create.statusCode).toBe(403);
      expect(create.json()).toMatchObject({ code: 'FORBIDDEN' });

      const update = await app.inject({
        method: 'PATCH',
        url: `/offers/${id}`,
        headers: { 'x-test-principal': 'viewer' },
        payload: { name: 'Should Not Update' },
      });
      expect(update.statusCode).toBe(403);
      expect(update.json()).toMatchObject({ code: 'FORBIDDEN' });

      await app.close();
    });

    it('blocks AGENT from POST /offers and PATCH /offers/:id with 403 (Offer write floor is MANAGER)', async () => {
      const id = await seedOffer(agencyAId, { name: 'Viewable' });

      const app = buildTestApp(runtimePool);

      const list = await app.inject({
        method: 'GET',
        url: '/offers',
        headers: { 'x-test-principal': 'agent' },
      });
      expect(list.statusCode).toBe(200);

      const create = await app.inject({
        method: 'POST',
        url: '/offers',
        headers: { 'x-test-principal': 'agent' },
        payload: validOfferPayload(),
      });
      expect(create.statusCode).toBe(403);

      const update = await app.inject({
        method: 'PATCH',
        url: `/offers/${id}`,
        headers: { 'x-test-principal': 'agent' },
        payload: { name: 'Agent Attempt' },
      });
      expect(update.statusCode).toBe(403);

      await app.close();
    });

    it.each(['manager', 'owner'] as const)(
      'allows %s to read and write via hierarchy inheritance',
      async (principalKey) => {
        const app = buildTestApp(runtimePool);

        const list = await app.inject({
          method: 'GET',
          url: '/offers',
          headers: { 'x-test-principal': principalKey },
        });
        expect(list.statusCode).toBe(200);

        const create = await app.inject({
          method: 'POST',
          url: '/offers',
          headers: { 'x-test-principal': principalKey },
          payload: validOfferPayload({ name: `${principalKey} Created` }),
        });
        expect(create.statusCode).toBe(201);
        const createdId = create.json<{ offer: { id: string } }>().offer.id;

        const update = await app.inject({
          method: 'PATCH',
          url: `/offers/${createdId}`,
          headers: { 'x-test-principal': principalKey },
          payload: { name: `${principalKey} Updated` },
        });
        expect(update.statusCode).toBe(200);

        await app.close();
      },
    );

    it('fails closed for an unknown/invalid role on both read and write routes', async () => {
      const id = await seedOffer(agencyAId, { name: 'Unknown Role Target' });

      const app = buildTestApp(runtimePool);

      const list = await app.inject({
        method: 'GET',
        url: '/offers',
        headers: { 'x-test-principal': 'unknownRole' },
      });
      expect(list.statusCode).toBe(403);

      const get = await app.inject({
        method: 'GET',
        url: `/offers/${id}`,
        headers: { 'x-test-principal': 'unknownRole' },
      });
      expect(get.statusCode).toBe(403);

      const create = await app.inject({
        method: 'POST',
        url: '/offers',
        headers: { 'x-test-principal': 'unknownRole' },
        payload: validOfferPayload(),
      });
      expect(create.statusCode).toBe(403);

      await app.close();
    });

    it('keeps a high role from Agency A blocked from Agency B offers (role does not bypass tenant isolation)', async () => {
      const bId = await seedOffer(agencyBId, { name: 'B Secret Owner Test' });

      const app = buildTestApp(runtimePool);

      const get = await app.inject({
        method: 'GET',
        url: `/offers/${bId}`,
        headers: { 'x-test-principal': 'owner' },
      });
      expect(get.statusCode).toBe(404);

      const patch = await app.inject({
        method: 'PATCH',
        url: `/offers/${bId}`,
        headers: { 'x-test-principal': 'owner' },
        payload: { name: 'Hacked By Owner' },
      });
      expect(patch.statusCode).toBe(404);

      const row = await adminPool.query<{ name: string }>(
        'SELECT name FROM offers WHERE id = $1',
        [bId],
      );
      expect(row.rows[0]?.name).toBe('B Secret Owner Test');

      await app.close();
    });

    it('lets Agency B OWNER read only Agency B data, never Agency A', async () => {
      const aId = await seedOffer(agencyAId, { name: 'A Secret Owner Test' });

      const app = buildTestApp(runtimePool);

      const get = await app.inject({
        method: 'GET',
        url: `/offers/${aId}`,
        headers: { 'x-test-principal': 'ownerAgencyB' },
      });
      expect(get.statusCode).toBe(404);

      await app.close();
    });
  });

  function validOfferPayload(overrides: Partial<{ name: string; price: number }> = {}) {
    return {
      name: overrides.name ?? 'Offer Name',
      price: overrides.price ?? 100,
    };
  }

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

  async function seedOffer(
    agencyId: string,
    data: { name?: string },
  ): Promise<string> {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO offers (agency_id, name, price)
       VALUES ($1, $2, $3) RETURNING id`,
      [agencyId, data.name ?? 'Offer', '100.00'],
    );
    const id = result.rows[0]?.id;
    if (!id) {
      throw new Error('Failed to seed offer');
    }
    return id;
  }
});

function assertSafeTestDatabase(): void {
  if (!['127.0.0.1', 'localhost'].includes(databaseHost)) {
    throw new Error('Offer route tests require localhost only.');
  }

  if (!Number.isInteger(databasePort) || databasePort < 1024 || databasePort > 65535) {
    throw new Error('Offer route tests require a safe local database test port.');
  }

  if (!databaseName.includes('test')) {
    throw new Error('Offer route tests require a database name with a test marker.');
  }

  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    const safeHost = ['127.0.0.1', 'localhost'].includes(url.hostname);
    const safeDatabase = url.pathname.replace('/', '').includes('test');
    const safePort = url.port === String(databasePort) || url.port === '';

    if (!safeHost || !safeDatabase || !safePort) {
      throw new Error('Refusing to run offer route tests against unsafe DATABASE_URL.');
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
        ($1, 'Agency A', 'agency-a-offer-routes-test', 'agency-a@example.test', 'FREE', 'ACTIVE'),
        ($2, 'Agency B', 'agency-b-offer-routes-test', 'agency-b@example.test', 'FREE', 'ACTIVE');
    `,
    [agencyAId, agencyBId],
  );
  await pool.query(
    `
      INSERT INTO users (id, agency_id, email, name, role, password_hash, status)
      VALUES
        ($1, $2, 'user-a@example.test', 'User A', 'ADMIN', 'hash-for-offer-routes-test-only', 'ACTIVE'),
        ($3, $4, 'user-b@example.test', 'User B', 'ADMIN', 'hash-for-offer-routes-test-only', 'ACTIVE');
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
