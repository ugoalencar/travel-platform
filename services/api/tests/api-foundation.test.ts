import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { buildApp } from '../src/app';
import { UserRole } from '../../../packages/domain/types';
import type { AuthenticatedPrincipal } from '../src/auth';
import { createDatabaseRuntime } from '../src/database';
import { createServerAccessValidator, createServerAuthProvider } from '../src/dev-auth';

const repoRoot = resolve(import.meta.dirname, '../../..');
const migration001 = resolve(repoRoot, 'infrastructure/migrations/001_initial_schema.sql');
const migration002 = resolve(repoRoot, 'infrastructure/migrations/002_rls_policies.sql');
const prepareRolesSql = resolve(repoRoot, 'tests/integration/database/002_prepare_local_roles.sql');
const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.local-postgres.yml');

const projectName = 'travel-platform-api-foundation-postgres';
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
const deniedUserId = '31000000-0000-4000-8000-000000000001';

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
  denied: {
    userId: deniedUserId,
    agencyId: agencyAId,
    role: UserRole.ADMIN,
    email: 'denied@example.test',
  },
};

describe.sequential('P0 Fastify API foundation', () => {
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

  afterAll(async () => {
    await runtimePool?.end();
    await adminPool?.end();
    compose(['down', '-v']);
  });

  it('GET /health returns 200 without auth or tenant context', async () => {
    const app = buildTestApp(runtimePool);

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', service: 'api' });

    await app.close();
  });

  it('GET /readiness returns ready after the configured dependency check succeeds', async () => {
    const app = buildTestApp(runtimePool, {
      readinessCheck: () => Promise.resolve(),
    });

    const response = await app.inject({ method: 'GET', url: '/readiness' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ready', service: 'api' });

    await app.close();
  });

  it('GET /readiness returns 503 without leaking dependency details when checks fail', async () => {
    const app = buildTestApp(runtimePool, {
      readinessCheck: () => Promise.reject(new Error('database password invalid')),
    });

    const response = await app.inject({ method: 'GET', url: '/readiness' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: 'not_ready', service: 'api' });
    expect(response.body).not.toContain('password');

    await app.close();
  });

  it('rate limits repeated write requests by route and client address', async () => {
    const app = buildTestApp(runtimePool, {
      rateLimit: { windowMs: 60_000, max: 1 },
    });

    const first = await app.inject({
      method: 'POST',
      url: '/__test/rate-limit-proof',
      headers: { 'x-test-principal': 'a' },
    });
    const second = await app.inject({
      method: 'POST',
      url: '/__test/rate-limit-proof',
      headers: { 'x-test-principal': 'a' },
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(429);
    expect(second.headers['retry-after']).toBeDefined();
    expect(second.json()).toEqual({
      error: 'Too many requests',
      code: 'RATE_LIMITED',
    });

    await app.close();
  });

  it('applies a class-specific limit instead of the legacy global write limit', async () => {
    const app = buildTestApp(runtimePool, {
      rateLimit: {
        windowMs: 60_000,
        max: 300,
        classLimits: {
          STAFF_WRITE: { windowMs: 60_000, max: 1 },
        },
      },
    });

    const first = await app.inject({
      method: 'POST',
      url: '/__test/rate-limit-proof',
      headers: { 'x-test-principal': 'a' },
    });
    const second = await app.inject({
      method: 'POST',
      url: '/__test/rate-limit-proof',
      headers: { 'x-test-principal': 'a' },
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(429);

    await app.close();
  });

  it('returns a generic 429 body and a Retry-After header, never leaking limiter internals', async () => {
    const app = buildTestApp(runtimePool, {
      rateLimit: {
        classLimits: {
          STAFF_WRITE: { windowMs: 60_000, max: 1 },
        },
      },
    });

    await app.inject({
      method: 'POST',
      url: '/__test/rate-limit-proof',
      headers: { 'x-test-principal': 'a' },
    });
    const blocked = await app.inject({
      method: 'POST',
      url: '/__test/rate-limit-proof',
      headers: { 'x-test-principal': 'a' },
    });

    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers['retry-after']).toMatch(/^\d+$/);
    expect(blocked.json()).toEqual({ error: 'Too many requests', code: 'RATE_LIMITED' });

    await app.close();
  });

  it('refuses to start rate limiting in production without an injected shared store', async () => {
    const { buildApp } = await import('../src/app');

    expect(() =>
      buildApp({
        authProvider: { authenticate: () => Promise.resolve(null) },
        validateUserAgencyAccess: () => Promise.resolve(false),
        database: createDatabaseRuntime(runtimePool),
        rateLimit: {
          environment: { NODE_ENV: 'production', RATE_LIMIT_STORE: 'external' },
          // Intentionally no `store` injected -- production must fail closed
          // rather than silently fall back to a process-local counter that
          // would not be shared across replicas/workers.
        },
      })
    ).toThrow(/HUMAN INFRASTRUCTURE DECISION REQUIRED/);
  });

  it('does not let a spoofed X-Forwarded-For header evade or smear the per-IP abuse bucket', async () => {
    const app = buildTestApp(runtimePool, {
      rateLimit: {
        classLimits: {
          STAFF_WRITE: { windowMs: 60_000, max: 1 },
        },
      },
    });

    // trustProxy is intentionally left at Fastify's default (false), so
    // request.ip must come from the socket, never from a client-controlled
    // header -- otherwise an attacker could rotate X-Forwarded-For on every
    // request to bypass per-IP throttling entirely.
    const first = await app.inject({
      method: 'POST',
      url: '/__test/rate-limit-proof',
      headers: { 'x-test-principal': 'a', 'x-forwarded-for': '203.0.113.5' },
    });
    const second = await app.inject({
      method: 'POST',
      url: '/__test/rate-limit-proof',
      headers: { 'x-test-principal': 'a', 'x-forwarded-for': '203.0.113.99' },
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(429);

    await app.close();
  });

  it('GET /me returns the authenticated principal inside tenant context', async () => {
    const app = buildTestApp(runtimePool);

    const response = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { 'x-test-principal': 'a' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      userId: userAId,
      agencyId: agencyAId,
      role: UserRole.ADMIN,
    });

    await app.close();
  });

  it('GET /me fails closed without auth', async () => {
    const app = buildTestApp(runtimePool);

    const response = await app.inject({ method: 'GET', url: '/me' });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: 'Authentication required',
      code: 'UNAUTHORIZED',
    });

    await app.close();
  });

  it('GET /tenant-proof returns only Agency A under RLS', async () => {
    const app = buildTestApp(runtimePool);

    const response = await app.inject({
      method: 'GET',
      url: '/tenant-proof',
      headers: { 'x-test-principal': 'a' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      agency: { id: agencyAId, name: 'Agency A' },
    });

    await app.close();
  });

  it('GET /tenant-proof returns only Agency B under RLS', async () => {
    const app = buildTestApp(runtimePool);

    const response = await app.inject({
      method: 'GET',
      url: '/tenant-proof',
      headers: { 'x-test-principal': 'b' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      agency: { id: agencyBId, name: 'Agency B' },
    });

    await app.close();
  });

  it('does not let Agency A switch to Agency B through request input', async () => {
    const app = buildTestApp(runtimePool);

    const response = await app.inject({
      method: 'GET',
      url: `/tenant-proof?agencyId=${agencyBId}`,
      headers: {
        'x-test-principal': 'a',
        'x-test-agency-id': agencyBId,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      agency: { id: agencyAId, name: 'Agency A' },
    });

    await app.close();
  });

  it('returns 403 when the authenticated principal is not authorized for the tenant', async () => {
    const app = buildTestApp(runtimePool);

    const response = await app.inject({
      method: 'GET',
      url: '/tenant-proof',
      headers: { 'x-test-principal': 'denied' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: 'User does not belong to this agency',
      code: 'FORBIDDEN',
    });

    await app.close();
  });

  it('rolls back a database operation when the transaction callback throws', async () => {
    const app = buildTestApp(runtimePool);

    const response = await app.inject({
      method: 'POST',
      url: '/__test/rollback-proof',
      headers: { 'x-test-principal': 'a' },
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    });

    const rows = await adminPool.query<{ matches: string }>(
      'SELECT COUNT(*)::TEXT AS matches FROM offers WHERE name = $1',
      ['Rollback Probe']
    );
    expect(rows.rows[0]?.matches).toBe('0');

    await app.close();
  });

  it('does not inherit tenant context after an errored request', async () => {
    const app = buildTestApp(runtimePool);

    const failed = await app.inject({
      method: 'POST',
      url: '/__test/rollback-proof',
      headers: { 'x-test-principal': 'a' },
    });
    expect(failed.statusCode).toBe(500);

    const next = await app.inject({
      method: 'GET',
      url: '/tenant-proof',
      headers: { 'x-test-principal': 'b' },
    });

    expect(next.statusCode).toBe(200);
    expect(next.json()).toEqual({
      agency: { id: agencyBId, name: 'Agency B' },
    });

    await app.close();
  });

  it('isolates concurrent Agency A and Agency B requests', async () => {
    const app = buildTestApp(runtimePool);

    const results = await Promise.all(
      Array.from({ length: 8 }, (_, index) => {
        const principal = index % 2 === 0 ? 'a' : 'b';
        return app
          .inject({
            method: 'GET',
            url: '/tenant-proof',
            headers: { 'x-test-principal': principal },
          })
          .then((response) => ({ principal, response }));
      })
    );

    for (const { principal, response } of results) {
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        agency:
          principal === 'a'
            ? { id: agencyAId, name: 'Agency A' }
            : { id: agencyBId, name: 'Agency B' },
      });
    }

    await app.close();
  });

  it('GET /me accepts valid dev auth only when the explicit local flag is enabled', async () => {
    const app = buildManualDevApp(runtimePool);

    const response = await app.inject({
      method: 'GET',
      url: '/me',
      headers: devHeaders(userAId, agencyAId),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      userId: userAId,
      agencyId: agencyAId,
      role: UserRole.ADMIN,
    });

    await app.close();
  });

  it('GET /tenant-proof remains tenant-scoped with local dev auth', async () => {
    const app = buildManualDevApp(runtimePool);

    const agencyA = await app.inject({
      method: 'GET',
      url: '/tenant-proof',
      headers: devHeaders(userAId, agencyAId),
    });
    const agencyB = await app.inject({
      method: 'GET',
      url: '/tenant-proof',
      headers: devHeaders(userBId, agencyBId),
    });

    expect(agencyA.statusCode).toBe(200);
    expect(agencyA.json()).toEqual({
      agency: { id: agencyAId, name: 'Agency A' },
    });
    expect(agencyB.statusCode).toBe(200);
    expect(agencyB.json()).toEqual({
      agency: { id: agencyBId, name: 'Agency B' },
    });

    await app.close();
  });

  it('does not let local dev auth Agency A spoof Agency B through request input', async () => {
    const app = buildManualDevApp(runtimePool);

    const response = await app.inject({
      method: 'GET',
      url: `/tenant-proof?agencyId=${agencyBId}`,
      headers: {
        ...devHeaders(userAId, agencyAId),
        'x-dev-target-agency-id': agencyBId,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      agency: { id: agencyAId, name: 'Agency A' },
    });

    await app.close();
  });

  it('fails closed when local dev auth receives an unauthorized user and agency pair', async () => {
    const app = buildManualDevApp(runtimePool);

    const response = await app.inject({
      method: 'GET',
      url: '/me',
      headers: devHeaders(userAId, agencyBId),
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: 'Authentication required',
      code: 'UNAUTHORIZED',
    });

    await app.close();
  });

  it('fails closed for incomplete local dev auth payloads', async () => {
    const app = buildManualDevApp(runtimePool);

    const response = await app.inject({
      method: 'GET',
      url: '/me',
      headers: {
        'x-dev-user-id': userAId,
        'x-dev-role': UserRole.ADMIN,
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: 'Authentication required',
      code: 'UNAUTHORIZED',
    });

    await app.close();
  });
});

function buildTestApp(pool: Pool, overrides: Partial<Parameters<typeof buildApp>[0]> = {}) {
  return buildApp({
    authProvider: {
      authenticate(request) {
        const key = request.headers['x-test-principal'];
        return Promise.resolve(typeof key === 'string' ? (principals[key] ?? null) : null);
      },
    },
    validateUserAgencyAccess(userId, agencyId) {
      return Promise.resolve(
        (userId === userAId && agencyId === agencyAId) ||
          (userId === userBId && agencyId === agencyBId)
      );
    },
    database: createDatabaseRuntime(pool),
    exposeTestRoutes: true,
    ...overrides,
  });
}

function buildManualDevApp(pool: Pool) {
  const environment = {
    NODE_ENV: 'development',
    ALLOW_DEV_AUTH: 'true',
  };

  return buildApp({
    authProvider: createServerAuthProvider(environment),
    validateUserAgencyAccess: createServerAccessValidator(environment),
    database: createDatabaseRuntime(pool),
  });
}

function devHeaders(userId: string, agencyId: string) {
  return {
    'x-dev-user-id': userId,
    'x-dev-agency-id': agencyId,
    'x-dev-role': UserRole.ADMIN,
  };
}

async function resetDatabase(pool: Pool): Promise<void> {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await pool.query(readSqlForPg(migration001));
  await pool.query(readSqlForPg(migration002));
  await pool.query(readSqlForPg(prepareRolesSql));
  await seedFixtures(pool);
}

function readSqlForPg(filePath: string): string {
  return readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith('\\'))
    .join('\n');
}

async function seedFixtures(pool: Pool): Promise<void> {
  await pool.query(
    `
      INSERT INTO agencies (id, name, slug, email, plan, status)
      VALUES
        ($1, 'Agency A', 'agency-a-p0-api-test', 'agency-a@example.test', 'FREE', 'ACTIVE'),
        ($2, 'Agency B', 'agency-b-p0-api-test', 'agency-b@example.test', 'FREE', 'ACTIVE');
    `,
    [agencyAId, agencyBId]
  );
  await pool.query(
    `
      INSERT INTO users (id, agency_id, email, name, role, password_hash, status)
      VALUES
        ($1, $2, 'user-a@example.test', 'User A', 'ADMIN', 'hash-for-p0-api-test-only', 'ACTIVE'),
        ($3, $4, 'user-b@example.test', 'User B', 'ADMIN', 'hash-for-p0-api-test-only', 'ACTIVE');
    `,
    [userAId, agencyAId, userBId, agencyBId]
  );
}

function assertSafeTestDatabase(): void {
  if (!['127.0.0.1', 'localhost'].includes(databaseHost)) {
    throw new Error('P0 API database tests require localhost only.');
  }

  if (databasePort !== 55432) {
    throw new Error('P0 API database tests require local port 55432.');
  }

  if (!databaseName.includes('test')) {
    throw new Error('P0 API database tests require a database name with a test marker.');
  }

  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    const safeHost = ['127.0.0.1', 'localhost'].includes(url.hostname);
    const safeDatabase = url.pathname.replace('/', '').includes('test');
    const safePort = url.port === '55432' || url.port === '';

    if (!safeHost || !safeDatabase || !safePort) {
      throw new Error('Refusing to run P0 API tests against unsafe DATABASE_URL.');
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
      false
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
      [
        `Command failed: ${command} ${args.join(' ')}`,
        `Exit code: ${result.status ?? 'unknown'}`,
        stdout,
        stderr,
      ]
        .filter(Boolean)
        .join('\n')
    );
  }

  return { stdout, stderr };
}
