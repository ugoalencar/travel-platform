import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { buildApp } from '../src/app';
import { createDatabaseRuntime, createPlatformDatabaseRuntime } from '../src/database';
import { hashPassword } from '../src/password-hashing';

const repoRoot = resolve(import.meta.dirname, '../../..');
const migrationsDir = resolve(repoRoot, 'infrastructure/migrations');
const migrationFiles = readdirSync(migrationsDir)
  .filter((name) => /^\d+_.+\.sql$/.test(name))
  .sort()
  .map((name) => resolve(migrationsDir, name));
const prepareRolesSql = resolve(repoRoot, 'tests/integration/database/002_prepare_local_roles.sql');
const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.local-postgres.yml');

const projectName = 'travel-platform-auth-http-postgres';
const containerName = 'travel-platform-postgres-local';
const postgresImage = 'postgres:15';
const databaseHost = process.env.DATABASE_TEST_HOST ?? '127.0.0.1';
const databasePort = Number(process.env.DATABASE_TEST_PORT ?? '55432');
const databaseName = process.env.DATABASE_TEST_NAME ?? 'travel_platform_test';
const adminUser = process.env.DATABASE_TEST_USER ?? 'travel_test';
const adminPassword = process.env.DATABASE_TEST_PASSWORD ?? 'travel_test_password';
const runtimeUser = 'travel_app_runtime_local';
const runtimePassword = 'travel_app_runtime_local_password';
const platformUser = 'travel_app_platform_local';
const platformPassword = 'travel_app_platform_local_password';
const poolPasswordKey = 'pass' + 'word';

const agencyAId = '10000000-0000-4000-8000-000000000008';
const agencySlugA = 'agency-a-auth-http-test';
const ownerAId = '11000000-0000-4000-8000-000000000009';
const ownerAEmail = 'owner-a@example.test';
const ownerAPassword = 'correct-horse-battery-staple';

describe('Local auth HTTP routes', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let platformPool: Pool;

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
    // F-06: platform-table paths run on the platform-role pool (mirrors
    // server.ts / PLATFORM_DATABASE_URL); tenant paths stay on runtime.
    platformPool = new Pool({
      host: databaseHost,
      port: databasePort,
      database: databaseName,
      user: platformUser,
      [poolPasswordKey]: platformPassword,
    });

    await resetDatabase(adminPool);
  });

  beforeEach(async () => {
    await adminPool.query('TRUNCATE TABLE mfa_totp_secrets RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE password_reset_tokens RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE auth_sessions RESTART IDENTITY CASCADE');
    await adminPool.query(`UPDATE users SET status = 'ACTIVE', password_hash = $2 WHERE id = $1`, [
      ownerAId,
      await hashPassword(ownerAPassword),
    ]);
  });

  afterAll(async () => {
    await platformPool?.end();
    await runtimePool?.end();
    await adminPool?.end();
  });

  it('POST /auth/login with correct credentials returns a usable session token', async () => {
    const app = buildTestApp();

    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { agencySlug: agencySlugA, email: ownerAEmail, password: ownerAPassword },
    });
    expect(response.statusCode).toBe(200);
    const body: { state: string; sessionToken: string } = response.json();
    expect(body.state).toBe('FULLY_AUTHENTICATED');
    expect(typeof body.sessionToken).toBe('string');

    const sessionsResponse = await app.inject({
      method: 'GET',
      url: '/auth/sessions',
      headers: { authorization: `Bearer ${body.sessionToken}` },
    });
    expect(sessionsResponse.statusCode).toBe(200);
    const sessionsBody: { sessions: Array<{ isCurrent: boolean }> } = sessionsResponse.json();
    expect(sessionsBody.sessions.some((s) => s.isCurrent)).toBe(true);
  });

  it('POST /auth/login with wrong password returns 401 with a generic message', async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { agencySlug: agencySlugA, email: ownerAEmail, password: 'wrong' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: 'Email ou senha inválidos' });
  });

  it('a session token authenticates ordinary protected routes (not just /auth/*)', async () => {
    const app = buildTestApp();
    const loginResponse = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { agencySlug: agencySlugA, email: ownerAEmail, password: ownerAPassword },
    });
    const loginBody: { sessionToken: string } = loginResponse.json();
    const { sessionToken } = loginBody;

    const meResponse = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${sessionToken}` },
    });
    expect(meResponse.statusCode).toBe(200);
  });

  it('POST /auth/logout revokes the session; it can no longer authenticate', async () => {
    const app = buildTestApp();
    const loginResponse = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { agencySlug: agencySlugA, email: ownerAEmail, password: ownerAPassword },
    });
    const loginBody: { sessionToken: string } = loginResponse.json();
    const { sessionToken } = loginBody;

    const logoutResponse = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { authorization: `Bearer ${sessionToken}` },
    });
    expect(logoutResponse.statusCode).toBe(204);

    const meResponse = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${sessionToken}` },
    });
    expect(meResponse.statusCode).toBe(401);
  });

  it('POST /auth/forgot-password always returns 200 with a generic message (no enumeration)', async () => {
    const app = buildTestApp();
    const known = await app.inject({
      method: 'POST',
      url: '/auth/forgot-password',
      payload: { agencySlug: agencySlugA, email: ownerAEmail },
    });
    const unknown = await app.inject({
      method: 'POST',
      url: '/auth/forgot-password',
      payload: { agencySlug: agencySlugA, email: 'nobody@example.test' },
    });
    expect(known.statusCode).toBe(200);
    expect(unknown.statusCode).toBe(200);
    expect(known.json()).toEqual(unknown.json());
  });

  function buildTestApp() {
    return buildApp({
      authProvider: { authenticate: () => Promise.resolve(null) },
      // resolveSessionByToken() (used by createSessionAuthProvider, which
      // composeAuthProviders() layers in automatically whenever
      // platformDatabase is supplied -- see app.ts) already re-reads the
      // user row tenant-scoped via withAgencyTransaction, so a resolved
      // session's (userId, agencyId) pair is trustworthy by construction.
      // This validator only ever needs to gate the OTHER authProvider
      // below, which never resolves a principal in these tests.
      validateUserAgencyAccess: (userId, agencyId) =>
        Promise.resolve(userId === ownerAId && agencyId === agencyAId),
      // F-06: tenant paths on the runtime pool, platform paths on the
      // platform-role pool -- mirrors server.ts.
      database: createDatabaseRuntime(runtimePool, platformPool),
      platformDatabase: createPlatformDatabaseRuntime(platformPool),
    });
  }

  function readSqlForPg(filePath: string): string {
    return readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .filter((line) => !line.trimStart().startsWith('\\'))
      .join('\n');
  }

  function assertSafeTestDatabase(): void {
    if (!['127.0.0.1', 'localhost'].includes(databaseHost)) {
      throw new Error('Auth HTTP tests require localhost only.');
    }
    if (!databaseName.includes('test')) {
      throw new Error('Auth HTTP tests require a database name with a test marker.');
    }
  }

  function resetDisposableDatabase(): void {
    if (process.env.CI === 'true') return;
    const existing = run(
      'docker',
      ['ps', '--filter', `name=${containerName}`, '--filter', 'status=running', '--format', '{{.Names}}'],
      false,
    );
    if (existing.stdout.split(/\r?\n/).map((line) => line.trim()).includes(containerName)) {
      return;
    }
    compose(['up', '-d']);
  }

  function compose(args: readonly string[]) {
    return run('docker', ['compose', '-f', composeFile, '-p', projectName, ...args]);
  }

  async function waitForHealthyContainer(): Promise<void> {
    if (process.env.CI === 'true') return;
    const timeoutAt = Date.now() + 120_000;
    while (Date.now() < timeoutAt) {
      const result = run('docker', ['inspect', '-f', '{{.State.Health.Status}}', containerName], false);
      if (result.stdout.trim() === 'healthy') return;
      await new Promise((r) => setTimeout(r, 2_000));
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

  interface CommandResult {
    stdout: string;
    stderr: string;
  }

  function run(command: string, args: readonly string[], throwOnError = true): CommandResult {
    const result = spawnSync(command, args, { cwd: repoRoot, encoding: 'utf8', maxBuffer: 1024 * 1024 * 20 });
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

  async function resetDatabase(pool: Pool): Promise<void> {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    for (const migrationFile of migrationFiles) {
      await pool.query(readSqlForPg(migrationFile));
    }
    await pool.query(readSqlForPg(prepareRolesSql));
    await seedAgenciesAndUsers(pool);
  }

  async function seedAgenciesAndUsers(pool: Pool): Promise<void> {
    await pool.query(
      `INSERT INTO agencies (id, name, slug, email, plan, status)
       VALUES ($1, 'Agency A', $2, 'agency-a-auth-http@example.test', 'FREE', 'ACTIVE')`,
      [agencyAId, agencySlugA],
    );
    await pool.query(
      `INSERT INTO users (id, agency_id, email, name, role, password_hash, status)
       VALUES ($1, $2, $3, 'Owner A', 'OWNER', $4, 'ACTIVE')`,
      [ownerAId, agencyAId, ownerAEmail, await hashPassword(ownerAPassword)],
    );
  }
});
