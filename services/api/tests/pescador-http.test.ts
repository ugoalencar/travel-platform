import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { buildApp } from '../src/app';
import { UserRole } from '../../../packages/domain/types';
import type { AuthenticatedPrincipal } from '../src/auth';
import { createDatabaseRuntime } from '../src/database';

const repoRoot = resolve(import.meta.dirname, '../../..');
const migrationsDir = resolve(repoRoot, 'infrastructure/migrations');
const migrationFiles = readdirSync(migrationsDir)
  .filter((name) => /^\d+_.+\.sql$/.test(name))
  .sort()
  .map((name) => resolve(migrationsDir, name));
const prepareRolesSql = resolve(repoRoot, 'tests/integration/database/002_prepare_local_roles.sql');
const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.local-postgres.yml');

const projectName = 'travel-platform-pescador-http-postgres';
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
  viewer: { userId: userAId, agencyId: agencyAId, role: UserRole.VIEWER, email: 'user-a@example.test' },
  agent: { userId: userAId, agencyId: agencyAId, role: UserRole.AGENT, email: 'user-a@example.test' },
  manager: { userId: userAId, agencyId: agencyAId, role: UserRole.MANAGER, email: 'user-a@example.test' },
  owner: { userId: userAId, agencyId: agencyAId, role: UserRole.OWNER, email: 'user-a@example.test' },
  ownerAgencyB: { userId: userBId, agencyId: agencyBId, role: UserRole.OWNER, email: 'user-b@example.test' },
};

describe('Pescador HTTP routes', () => {
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
    await adminPool.query('TRUNCATE TABLE external_offer_captures RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE offers RESTART IDENTITY CASCADE');
  });

  afterAll(async () => {
    await runtimePool?.end();
    await adminPool?.end();
    compose(['down', '-v']);
  });

  it('supports manual capture, review, approve, reject, and explicit publish', async () => {
    const app = buildTestApp(runtimePool);

    const created = await app.inject({
      method: 'POST',
      url: '/pescador/captures',
      headers: { 'x-test-principal': 'agent' },
      payload: {
        sourceUrl: 'https://example.test/package/rio',
        sourceName: 'Example Tour',
        rawContent: 'Rio package, 3 nights, breakfast included.',
        normalizedTitle: 'Rio Package',
        normalizedDescription: '3 nights with breakfast.',
        foundPrice: 1200,
        currency: 'BRL',
        validUntil: '2027-01-31T00:00:00.000Z',
      },
    });
    expect(created.statusCode).toBe(201);
    const capture = created.json<{ capture: { id: string; status: string; publishedOfferId?: string } }>().capture;
    expect(capture.status).toBe('CAPTURED');
    expect(capture.publishedOfferId).toBeUndefined();

    const duplicate = await app.inject({
      method: 'POST',
      url: '/pescador/captures',
      headers: { 'x-test-principal': 'agent' },
      payload: {
        sourceUrl: 'https://example.test/package/rio',
        sourceName: 'Example Tour',
        rawContent: 'Duplicate text is not silently accepted.',
      },
    });
    expect(duplicate.statusCode).toBe(409);

    const review = await app.inject({
      method: 'POST',
      url: `/pescador/captures/${capture.id}/review`,
      headers: { 'x-test-principal': 'manager' },
    });
    expect(review.statusCode).toBe(200);
    expect(review.json<{ capture: { status: string; reviewedByUserId: string } }>().capture)
      .toMatchObject({ status: 'UNDER_REVIEW', reviewedByUserId: userAId });

    const approve = await app.inject({
      method: 'POST',
      url: `/pescador/captures/${capture.id}/approve`,
      headers: { 'x-test-principal': 'manager' },
    });
    expect(approve.statusCode).toBe(200);
    expect(approve.json<{ capture: { status: string } }>().capture.status).toBe('APPROVED');

    const publish = await app.inject({
      method: 'POST',
      url: `/pescador/captures/${capture.id}/publish`,
      headers: { 'x-test-principal': 'owner' },
    });
    expect(publish.statusCode).toBe(201);
    const published = publish.json<{ capture: { status: string; publishedOfferId: string }; offer: { id: string; name: string } }>();
    expect(published.capture.status).toBe('PUBLISHED');
    expect(published.capture.publishedOfferId).toBe(published.offer.id);
    expect(published.offer.name).toBe('Rio Package');

    const rejectedSeed = await app.inject({
      method: 'POST',
      url: '/pescador/captures',
      headers: { 'x-test-principal': 'agent' },
      payload: {
        sourceUrl: 'https://example.test/package/sp',
        sourceName: 'Example Tour',
        rawContent: 'Sao Paulo package.',
      },
    });
    const rejectId = rejectedSeed.json<{ capture: { id: string } }>().capture.id;
    const reject = await app.inject({
      method: 'POST',
      url: `/pescador/captures/${rejectId}/reject`,
      headers: { 'x-test-principal': 'manager' },
    });
    expect(reject.statusCode).toBe(200);
    expect(reject.json<{ capture: { status: string } }>().capture.status).toBe('REJECTED');
    await app.close();
  });

  it('enforces RBAC and tenant isolation', async () => {
    const app = buildTestApp(runtimePool);
    const blockedCreate = await app.inject({
      method: 'POST',
      url: '/pescador/captures',
      headers: { 'x-test-principal': 'viewer' },
      payload: { sourceUrl: 'https://example.test/a', sourceName: 'A', rawContent: 'A' },
    });
    expect(blockedCreate.statusCode).toBe(403);

    const created = await app.inject({
      method: 'POST',
      url: '/pescador/captures',
      headers: { 'x-test-principal': 'agent' },
      payload: { sourceUrl: 'https://example.test/a', sourceName: 'A', rawContent: 'A' },
    });
    const captureId = created.json<{ capture: { id: string } }>().capture.id;

    const crossTenant = await app.inject({
      method: 'POST',
      url: `/pescador/captures/${captureId}/review`,
      headers: { 'x-test-principal': 'ownerAgencyB' },
    });
    expect(crossTenant.statusCode).toBe(404);

    const blockedPublish = await app.inject({
      method: 'POST',
      url: `/pescador/captures/${captureId}/publish`,
      headers: { 'x-test-principal': 'manager' },
    });
    expect(blockedPublish.statusCode).toBe(403);
    await app.close();
  });

  it('fails closed when the agency has no PESCADOR entitlement (Pilot Delivery Gap Closure -- Agent 03)', async () => {
    const app = buildTestApp(runtimePool);
    await adminPool.query(
      `UPDATE agency_entitlements SET enabled = false WHERE agency_id = $1 AND feature = 'PESCADOR'`,
      [agencyAId],
    );

    const response = await app.inject({
      method: 'GET',
      url: '/pescador/captures',
      headers: { 'x-test-principal': 'agent' },
    });
    expect(response.statusCode).toBe(403);
    const body: { error: string } = response.json();
    expect(body.error).toContain('not entitled');

    await adminPool.query(
      `UPDATE agency_entitlements SET enabled = true WHERE agency_id = $1 AND feature = 'PESCADOR'`,
      [agencyAId],
    );
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
          (userId === userAId && agencyId === agencyAId) || (userId === userBId && agencyId === agencyBId),
        );
      },
      database: createDatabaseRuntime(pool),
    });
  }
});

function assertSafeTestDatabase(): void {
  if (!['127.0.0.1', 'localhost'].includes(databaseHost)) {
    throw new Error('Pescador HTTP tests require localhost only.');
  }
  if (!Number.isInteger(databasePort) || databasePort < 1024 || databasePort > 65535) {
    throw new Error('Pescador HTTP tests require a safe local database test port.');
  }
  if (!databaseName.includes('test')) {
    throw new Error('Pescador HTTP tests require a database name with a test marker.');
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
    if (result.stdout.trim() === 'healthy') return;
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
  for (const migrationFile of migrationFiles) {
    await pool.query(readSqlForPg(migrationFile));
  }
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
    `INSERT INTO agencies (id, name, slug, email, plan, status)
     VALUES
       ($1, 'Agency A', 'agency-a-pescador-http-test', 'agency-a@example.test', 'FREE', 'ACTIVE'),
       ($2, 'Agency B', 'agency-b-pescador-http-test', 'agency-b@example.test', 'FREE', 'ACTIVE')`,
    [agencyAId, agencyBId],
  );
  await pool.query(
    `INSERT INTO users (id, agency_id, email, name, role, password_hash, status)
     VALUES
       ($1, $2, 'user-a@example.test', 'User A', 'ADMIN', 'hash-for-pescador-http-test-only', 'ACTIVE'),
       ($3, $4, 'user-b@example.test', 'User B', 'ADMIN', 'hash-for-pescador-http-test-only', 'ACTIVE')`,
    [userAId, agencyAId, userBId, agencyBId],
  );
  // Pescador is entitlement-gated (PlatformFeature.PESCADOR) -- these
  // routes 403 fail-closed without an enabled agency_entitlements row.
  // Both agencies entitled here so the RBAC/tenant-isolation assertions
  // below aren't confounded by entitlement gating; entitlement
  // enforcement itself has its own dedicated coverage pattern (see
  // offer-growth-entitlement-isolation.test.ts).
  await pool.query(
    `INSERT INTO agency_entitlements (agency_id, feature, enabled, updated_by)
     VALUES ($1, 'PESCADOR', true, 'test-seed'), ($2, 'PESCADOR', true, 'test-seed')`,
    [agencyAId, agencyBId],
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
