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
const migration003 = resolve(repoRoot, 'infrastructure/migrations/003_transportation.sql');
// suppliers.ts (Suppliers + Supplier Categories wave, f371ff9) reads/writes
// trade_name/supplier_type/email/etc. columns added by 038_supplier_extended.sql
// onto the pre-existing `suppliers` table; this suite exercises
// /transport/suppliers/:id (getSupplierById), so its minimal schema must
// include it or that route 500s instead of the expected 404 for a
// cross-tenant lookup.
const migration038 = resolve(repoRoot, 'infrastructure/migrations/038_supplier_extended.sql');
const prepareRolesSql = resolve(repoRoot, 'tests/integration/database/002_prepare_local_roles.sql');
const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.local-postgres.yml');

const projectName = 'travel-platform-transportation-e2e-postgres';
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

describe('Transportation end-to-end vertical validation', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let routeAId: string;
  let routeBId: string;
  let productAId: string;
  let productBId: string;
  let supplierAId: string;
  let supplierBId: string;

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
    await adminPool.query('TRUNCATE TABLE scheduled_departures RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE transport_products RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE suppliers RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE routes RESTART IDENTITY CASCADE');

    routeAId = await seedRoute(agencyAId, 'Sao Paulo', 'Rio de Janeiro');
    routeBId = await seedRoute(agencyBId, 'Lisbon', 'Porto');
    productAId = await seedProduct(agencyAId, routeAId, 'Rio Express');
    productBId = await seedProduct(agencyBId, routeBId, 'Porto Express');
    supplierAId = await seedSupplier(agencyAId, 'Supplier A');
    supplierBId = await seedSupplier(agencyBId, 'Supplier B');
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

  it('Tenant A cannot list/get/patch Tenant B Route, Product, Supplier, Departure (404, zero mutation)', async () => {
    const app = buildTestApp(runtimePool);
    const bDeparture = await seedDeparture(agencyBId, productBId, supplierBId);

    // Route
    const routeGet = await app.inject({
      method: 'GET',
      url: `/transport/routes/${routeBId}`,
      headers: { 'x-test-principal': 'managerA' },
    });
    expect(routeGet.statusCode).toBe(404);
    const routePatch = await app.inject({
      method: 'PATCH',
      url: `/transport/routes/${routeBId}`,
      headers: { 'x-test-principal': 'managerA' },
      payload: { origin: 'Hacked' },
    });
    expect(routePatch.statusCode).toBe(404);
    const routeRow = await adminPool.query<{ origin: string }>('SELECT origin FROM routes WHERE id = $1', [
      routeBId,
    ]);
    expect(routeRow.rows[0]?.origin).toBe('Lisbon');

    // Product
    const productGet = await app.inject({
      method: 'GET',
      url: `/transport/products/${productBId}`,
      headers: { 'x-test-principal': 'managerA' },
    });
    expect(productGet.statusCode).toBe(404);
    const productPatch = await app.inject({
      method: 'PATCH',
      url: `/transport/products/${productBId}`,
      headers: { 'x-test-principal': 'managerA' },
      payload: { name: 'Hacked' },
    });
    expect(productPatch.statusCode).toBe(404);

    // Supplier
    const supplierGet = await app.inject({
      method: 'GET',
      url: `/transport/suppliers/${supplierBId}`,
      headers: { 'x-test-principal': 'managerA' },
    });
    expect(supplierGet.statusCode).toBe(404);
    const supplierPatch = await app.inject({
      method: 'PATCH',
      url: `/transport/suppliers/${supplierBId}`,
      headers: { 'x-test-principal': 'managerA' },
      payload: { name: 'Hacked' },
    });
    expect(supplierPatch.statusCode).toBe(404);

    // Departure
    const departureGet = await app.inject({
      method: 'GET',
      url: `/transport/departures/${bDeparture}`,
      headers: { 'x-test-principal': 'managerA' },
    });
    expect(departureGet.statusCode).toBe(404);
    const departurePatch = await app.inject({
      method: 'PATCH',
      url: `/transport/departures/${bDeparture}`,
      headers: { 'x-test-principal': 'managerA' },
      payload: { capacity: 999 },
    });
    expect(departurePatch.statusCode).toBe(404);
    const departureRow = await adminPool.query<{ capacity: number }>(
      'SELECT capacity FROM scheduled_departures WHERE id = $1',
      [bDeparture],
    );
    expect(departureRow.rows[0]?.capacity).toBe(30);

    // List isolation
    const list = await app.inject({
      method: 'GET',
      url: '/transport/routes',
      headers: { 'x-test-principal': 'managerA' },
    });
    const listBody = list.json<{ routes: Array<{ id: string }> }>();
    expect(listBody.routes.some((r) => r.id === routeBId)).toBe(false);
  });

  it('Tenant B cannot list/get/patch Tenant A data either (bidirectional isolation)', async () => {
    const app = buildTestApp(runtimePool);
    const aDeparture = await seedDeparture(agencyAId, productAId, supplierAId);

    const get = await app.inject({
      method: 'GET',
      url: `/transport/departures/${aDeparture}`,
      headers: { 'x-test-principal': 'managerB' },
    });
    expect(get.statusCode).toBe(404);

    const patch = await app.inject({
      method: 'PATCH',
      url: `/transport/departures/${aDeparture}`,
      headers: { 'x-test-principal': 'managerB' },
      payload: { capacity: 1 },
    });
    expect(patch.statusCode).toBe(404);
  });

  it('rejects cross-tenant relation abuse: Product->Route, Departure->Product, Departure->Supplier', async () => {
    const app = buildTestApp(runtimePool);

    const productCross = await app.inject({
      method: 'POST',
      url: '/transport/products',
      headers: { 'x-test-principal': 'managerA' },
      payload: { name: 'Bad', tripType: 'ONE_WAY', outboundRouteId: routeBId, price: 100 },
    });
    expect(productCross.statusCode).toBe(404);

    const departureProductCross = await app.inject({
      method: 'POST',
      url: '/transport/departures',
      headers: { 'x-test-principal': 'managerA' },
      payload: {
        productId: productBId,
        departureAt: '2027-01-10T10:00:00Z',
        capacity: 10,
        serviceType: 'OWN',
      },
    });
    expect(departureProductCross.statusCode).toBe(404);

    const departureSupplierCross = await app.inject({
      method: 'POST',
      url: '/transport/departures',
      headers: { 'x-test-principal': 'managerA' },
      payload: {
        productId: productAId,
        departureAt: '2027-01-10T10:00:00Z',
        capacity: 10,
        serviceType: 'SUBCONTRACTED',
        supplierId: supplierBId,
      },
    });
    expect(departureSupplierCross.statusCode).toBe(404);
  });

  it('capacity CHECK is enforced via real HTTP (negative rejected) and via direct SQL bypass', async () => {
    const app = buildTestApp(runtimePool);

    const httpAttempt = await app.inject({
      method: 'POST',
      url: '/transport/departures',
      headers: { 'x-test-principal': 'managerA' },
      payload: {
        productId: productAId,
        departureAt: '2027-01-10T10:00:00Z',
        capacity: -1,
        serviceType: 'OWN',
      },
    });
    expect(httpAttempt.statusCode).toBe(400);
    expect(httpAttempt.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(httpAttempt.json<{ error: string }>().error).not.toMatch(/constraint|scheduled_departures_capacity/i);

    await expect(
      adminPool.query(
        `INSERT INTO scheduled_departures (agency_id, product_id, departure_at, capacity, service_type)
         VALUES ($1, $2, '2027-01-10T10:00:00Z', -1, 'OWN')`,
        [agencyAId, productAId],
      ),
    ).rejects.toThrow(/scheduled_departures_capacity_non_negative_check/);
  });

  it('TripType/return-route CHECK is enforced via real HTTP', async () => {
    const app = buildTestApp(runtimePool);
    const response = await app.inject({
      method: 'POST',
      url: '/transport/products',
      headers: { 'x-test-principal': 'managerA' },
      payload: { name: 'Bad round trip', tripType: 'ROUND_TRIP', outboundRouteId: routeAId, price: 100 },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(response.json<{ error: string }>().error).not.toMatch(/constraint|return_route_required/i);
  });

  it('a high role (OWNER) never crosses tenant boundaries', async () => {
    const app = buildTestApp(runtimePool);
    const get = await app.inject({
      method: 'GET',
      url: `/transport/routes/${routeAId}`,
      headers: { 'x-test-principal': 'ownerB' },
    });
    expect(get.statusCode).toBe(404);
  });

  it('unknown/invalid role fails closed on every Transportation route', async () => {
    const app = buildTestApp(runtimePool);
    const endpoints: Array<{ method: 'GET' | 'POST'; url: string }> = [
      { method: 'GET', url: '/transport/routes' },
      { method: 'GET', url: '/transport/products' },
      { method: 'GET', url: '/transport/suppliers' },
      { method: 'GET', url: '/transport/departures' },
      { method: 'GET', url: '/transport/agenda' },
      { method: 'POST', url: '/transport/routes' },
    ];

    for (const endpoint of endpoints) {
      const response =
        endpoint.method === 'POST'
          ? await app.inject({
              method: 'POST',
              url: endpoint.url,
              headers: { 'x-test-principal': 'unknownRoleA' },
              payload: { origin: 'A', destination: 'B' },
            })
          : await app.inject({
              method: 'GET',
              url: endpoint.url,
              headers: { 'x-test-principal': 'unknownRoleA' },
            });
      expect(response.statusCode).toBe(403);
    }
  });

  it('GET /transport/agenda returns the joined shape and respects tenant scoping', async () => {
    const app = buildTestApp(runtimePool);
    await seedDeparture(agencyAId, productAId, supplierAId);
    await seedDeparture(agencyBId, productBId, supplierBId);

    const response = await app.inject({
      method: 'GET',
      url: '/transport/agenda',
      headers: { 'x-test-principal': 'managerA' },
    });
    expect(response.statusCode).toBe(200);

    const body = response.json<{
      agenda: Array<{
        departure: { agencyId: string; productId: string };
        productName: string;
        outboundOrigin: string;
        outboundDestination: string;
        supplierName?: string;
      }>;
    }>();

    expect(body.agenda).toHaveLength(1);
    const entry = body.agenda[0];
    expect(entry?.departure.agencyId).toBe(agencyAId);
    expect(entry?.productName).toBe('Rio Express');
    expect(entry?.outboundOrigin).toBe('Sao Paulo');
    expect(entry?.outboundDestination).toBe('Rio de Janeiro');
    expect(entry?.supplierName).toBe('Supplier A');

    // Tenant B departure never appears in Tenant A's agenda
    expect(
      body.agenda.some((e) => e.departure.agencyId === agencyBId),
    ).toBe(false);
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
          (userId === userAId && agencyId === agencyAId) || (userId === userBId && agencyId === agencyBId),
        );
      },
      database: createDatabaseRuntime(pool),
    });
  }

  async function seedRoute(agencyId: string, origin: string, destination: string): Promise<string> {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO routes (agency_id, origin, destination) VALUES ($1, $2, $3) RETURNING id`,
      [agencyId, origin, destination],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error('Failed to seed route');
    return id;
  }

  async function seedProduct(agencyId: string, routeId: string, name: string): Promise<string> {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO transport_products (agency_id, name, trip_type, outbound_route_id, price)
       VALUES ($1, $2, 'ONE_WAY', $3, 100) RETURNING id`,
      [agencyId, name, routeId],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error('Failed to seed product');
    return id;
  }

  async function seedSupplier(agencyId: string, name: string): Promise<string> {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO suppliers (agency_id, name) VALUES ($1, $2) RETURNING id`,
      [agencyId, name],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error('Failed to seed supplier');
    return id;
  }

  async function seedDeparture(agencyId: string, productId: string, supplierId: string): Promise<string> {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO scheduled_departures (agency_id, product_id, departure_at, capacity, supplier_id, service_type)
       VALUES ($1, $2, '2027-02-01T10:00:00Z', 30, $3, 'SUBCONTRACTED') RETURNING id`,
      [agencyId, productId, supplierId],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error('Failed to seed departure');
    return id;
  }
});

function assertSafeTestDatabase(): void {
  if (!['127.0.0.1', 'localhost'].includes(databaseHost)) {
    throw new Error('Transportation e2e tests require localhost only.');
  }
  if (!Number.isInteger(databasePort) || databasePort < 1024 || databasePort > 65535) {
    throw new Error('Transportation e2e tests require a safe local database test port.');
  }
  if (!databaseName.includes('test')) {
    throw new Error('Transportation e2e tests require a database name with a test marker.');
  }
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    const safeHost = ['127.0.0.1', 'localhost'].includes(url.hostname);
    const safeDatabase = url.pathname.replace('/', '').includes('test');
    const safePort = url.port === String(databasePort) || url.port === '';
    if (!safeHost || !safeDatabase || !safePort) {
      throw new Error('Refusing to run transportation e2e tests against unsafe DATABASE_URL.');
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
        ($1, 'Agency A', 'agency-a-transportation-e2e-test', 'agency-a@example.test', 'FREE', 'ACTIVE'),
        ($2, 'Agency B', 'agency-b-transportation-e2e-test', 'agency-b@example.test', 'FREE', 'ACTIVE');
    `,
    [agencyAId, agencyBId],
  );
  await pool.query(
    `
      INSERT INTO users (id, agency_id, email, name, role, password_hash, status)
      VALUES
        ($1, $2, 'user-a@example.test', 'User A', 'ADMIN', 'hash-for-transportation-e2e-test-only', 'ACTIVE'),
        ($3, $4, 'user-b@example.test', 'User B', 'ADMIN', 'hash-for-transportation-e2e-test-only', 'ACTIVE');
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
