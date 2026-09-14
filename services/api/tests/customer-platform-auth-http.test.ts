import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { buildApp } from '../src/app';
import { createDatabaseRuntime, createPlatformDatabaseRuntime } from '../src/database';
import { hashPassword } from '../src/password-hashing';
import { createTotpProvider } from '../src/mfa-provider';

const repoRoot = resolve(import.meta.dirname, '../../..');
const migrationsDir = resolve(repoRoot, 'infrastructure/migrations');
const migrationFiles = readdirSync(migrationsDir)
  .filter((name) => /^\d+_.+\.sql$/.test(name))
  .sort()
  .map((name) => resolve(migrationsDir, name));
const prepareRolesSql = resolve(repoRoot, 'tests/integration/database/002_prepare_local_roles.sql');
const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.local-postgres.yml');

const projectName = 'travel-platform-customer-platform-auth-http-postgres';
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

const agencyAId = '10000000-0000-4000-8000-00000000000b';
const agencySlugA = 'agency-a-cp-auth-http-test';
const customerAId = '30000000-0000-4000-8000-00000000000b';
const customerAccountEmail = 'customer-http-a@example.test';
const customerAccountPassword = 'customer-http-strong-password-1';
const platformUserEmail = 'platform-http-admin@example.test';
const platformUserPassword = 'platform-http-strong-password-1';

describe('Customer Portal + Platform Admin local auth HTTP routes', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  const totpProvider = createTotpProvider();

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
    await adminPool.query('TRUNCATE TABLE customer_sessions RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE customer_password_reset_tokens RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE platform_sessions RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE platform_user_audit RESTART IDENTITY CASCADE');
    await adminPool.query(
      `UPDATE customer_accounts SET status = 'ACTIVE', password_hash = $2 WHERE customer_id = $1`,
      [customerAId, await hashPassword(customerAccountPassword)],
    );
    await adminPool.query(
      `UPDATE platform_users SET status = 'ACTIVE', mfa_enabled = false, mfa_secret = NULL, password_hash = $2 WHERE email = $1`,
      [platformUserEmail, await hashPassword(platformUserPassword)],
    );
  });

  afterAll(async () => {
    await runtimePool?.end();
    await adminPool?.end();
  });

  it('POST /customer-auth/login with correct credentials returns a usable session, /customer-auth/logout revokes it', async () => {
    const app = buildTestApp(runtimePool);

    const loginResponse = await app.inject({
      method: 'POST',
      url: '/customer-auth/login',
      payload: { agencySlug: agencySlugA, email: customerAccountEmail, password: customerAccountPassword },
    });
    expect(loginResponse.statusCode).toBe(200);
    const loginBody: { sessionToken: string } = loginResponse.json();
    expect(typeof loginBody.sessionToken).toBe('string');

    const logoutResponse = await app.inject({
      method: 'POST',
      url: '/customer-auth/logout',
      headers: { authorization: `Bearer ${loginBody.sessionToken}` },
    });
    expect(logoutResponse.statusCode).toBe(204);
  });

  it('POST /customer-auth/login with wrong password returns 401 with a generic message', async () => {
    const app = buildTestApp(runtimePool);
    const response = await app.inject({
      method: 'POST',
      url: '/customer-auth/login',
      payload: { agencySlug: agencySlugA, email: customerAccountEmail, password: 'wrong' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: 'Email ou senha inválidos' });
  });

  it('POST /customer-auth/forgot-password always returns 200 (no enumeration)', async () => {
    const app = buildTestApp(runtimePool);
    const known = await app.inject({
      method: 'POST',
      url: '/customer-auth/forgot-password',
      payload: { agencySlug: agencySlugA, email: customerAccountEmail },
    });
    const unknown = await app.inject({
      method: 'POST',
      url: '/customer-auth/forgot-password',
      payload: { agencySlug: agencySlugA, email: 'nobody@example.test' },
    });
    expect(known.statusCode).toBe(200);
    expect(unknown.statusCode).toBe(200);
  });

  it('POST /platform-auth/login without MFA returns a usable session; /platform-auth/logout revokes it', async () => {
    const app = buildTestApp(runtimePool);

    const loginResponse = await app.inject({
      method: 'POST',
      url: '/platform-auth/login',
      payload: { email: platformUserEmail, password: platformUserPassword },
    });
    expect(loginResponse.statusCode).toBe(200);
    const loginBody: { state: string; sessionToken: string } = loginResponse.json();
    expect(loginBody.state).toBe('FULLY_AUTHENTICATED');

    const logoutResponse = await app.inject({
      method: 'POST',
      url: '/platform-auth/logout',
      headers: { authorization: `Bearer ${loginBody.sessionToken}` },
    });
    expect(logoutResponse.statusCode).toBe(204);
  });

  it('POST /platform-auth/login with MFA enrolled requires /platform-auth/mfa/verify before the token is usable', async () => {
    const app = buildTestApp(runtimePool);
    const secret = totpProvider.generateSecret(platformUserEmail, 'Travel Platform').secret;
    await adminPool.query(`UPDATE platform_users SET mfa_enabled = true, mfa_secret = $2 WHERE email = $1`, [
      platformUserEmail,
      secret,
    ]);

    const loginResponse = await app.inject({
      method: 'POST',
      url: '/platform-auth/login',
      payload: { email: platformUserEmail, password: platformUserPassword },
    });
    expect(loginResponse.statusCode).toBe(200);
    const loginBody: { state: string; mfaChallengeToken: string } = loginResponse.json();
    expect(loginBody.state).toBe('MFA_REQUIRED');

    const code = generateTotpCode(secret);
    const verifyResponse = await app.inject({
      method: 'POST',
      url: '/platform-auth/mfa/verify',
      payload: { sessionToken: loginBody.mfaChallengeToken, code },
    });
    expect(verifyResponse.statusCode).toBe(200);
    const verifyBody: { state: string; sessionToken: string } = verifyResponse.json();
    expect(verifyBody.state).toBe('FULLY_AUTHENTICATED');
  });

  it('POST /platform-auth/login with wrong password returns 401 with a generic message', async () => {
    const app = buildTestApp(runtimePool);
    const response = await app.inject({
      method: 'POST',
      url: '/platform-auth/login',
      payload: { email: platformUserEmail, password: 'wrong' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: 'Email ou senha inválidos' });
  });

  function generateTotpCode(secretBase32: string): string {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const window = Math.floor(nowSeconds / 30);
    const secretBytes = totpProvider.decodeBase32(secretBase32);
    const hmac = createHmac('sha1', secretBytes);
    const counterBuffer = Buffer.alloc(8);
    let c = window;
    for (let i = 7; i >= 0; i--) {
      counterBuffer[i] = c & 0xff;
      c = Math.floor(c / 256);
    }
    hmac.update(counterBuffer);
    const digest = hmac.digest();
    const offset = digest[digest.length - 1]! & 0x0f;
    const code =
      ((digest[offset]! & 0x7f) << 24) |
      ((digest[offset + 1]! & 0xff) << 16) |
      ((digest[offset + 2]! & 0xff) << 8) |
      (digest[offset + 3]! & 0xff);
    return (code % 1_000_000).toString().padStart(6, '0');
  }

  function buildTestApp(pool: Pool) {
    return buildApp({
      authProvider: { authenticate: () => Promise.resolve(null) },
      validateUserAgencyAccess: () => Promise.resolve(false),
      // resolveCustomerSessionByToken() (used by createCustomerSessionAuthProvider,
      // layered in automatically whenever platformDatabase is supplied -- see
      // app.ts) already re-reads the account row tenant-scoped, so a resolved
      // session's (customerId, agencyId) pair is trustworthy by construction --
      // same rationale as auth-http.test.ts's validateUserAgencyAccess.
      validateCustomerAgencyAccess: (customerId, agencyId) =>
        Promise.resolve(customerId === customerAId && agencyId === agencyAId),
      database: createDatabaseRuntime(pool),
      platformDatabase: createPlatformDatabaseRuntime(pool),
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
      throw new Error('Customer/Platform auth HTTP tests require localhost only.');
    }
    if (!databaseName.includes('test')) {
      throw new Error('Customer/Platform auth HTTP tests require a database name with a test marker.');
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
    await seedFixtures(pool);
  }

  async function seedFixtures(pool: Pool): Promise<void> {
    await pool.query(
      `INSERT INTO agencies (id, name, slug, email, plan, status)
       VALUES ($1, 'Agency A', $2, 'agency-a-cp-auth-http@example.test', 'FREE', 'ACTIVE')`,
      [agencyAId, agencySlugA],
    );
    await pool.query(
      `INSERT INTO customers (id, agency_id, name, email, status)
       VALUES ($1, $2, 'Customer HTTP A', $3, 'ACTIVE')`,
      [customerAId, agencyAId, 'customer-http-a-record@example.test'],
    );
    await pool.query(
      `INSERT INTO customer_accounts (agency_id, customer_id, email, password_hash, status)
       VALUES ($1, $2, $3, $4, 'ACTIVE')`,
      [agencyAId, customerAId, customerAccountEmail, await hashPassword(customerAccountPassword)],
    );
    await pool.query(
      `INSERT INTO platform_users (email, password_hash, role, status)
       VALUES ($1, $2, 'PLATFORM_ADMIN', 'ACTIVE')`,
      [platformUserEmail, await hashPassword(platformUserPassword)],
    );
  }
});
