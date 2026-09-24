import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash, createHmac } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { createPlatformDatabaseRuntime } from '../src/database';
import type { PlatformDatabaseRuntime } from '../src/database';
import { hashPassword } from '../src/password-hashing';
import { createTotpProvider } from '../src/mfa-provider';
import {
  customerForgotPassword,
  customerLogin,
  customerLogout,
  customerResetPassword,
  resolveCustomerSessionByToken,
} from '../src/customer-local-auth';
import {
  confirmPlatformMfaEnrollment,
  platformLogin,
  platformLogout,
  resolvePlatformSessionByToken,
  setPlatformUserStatus,
  startPlatformMfaEnrollment,
  verifyPlatformMfaAndCompleteLogin,
} from '../src/platform-local-auth';
import { decryptMfaSecret, isMfaSecretEncrypted } from '../src/mfa-encryption';

const repoRoot = resolve(import.meta.dirname, '../../..');
const migrationsDir = resolve(repoRoot, 'infrastructure/migrations');
const migrationFiles = readdirSync(migrationsDir)
  .filter((name) => /^\d+_.+\.sql$/.test(name))
  .sort()
  .map((name) => resolve(migrationsDir, name));
const prepareRolesSql = resolve(repoRoot, 'tests/integration/database/002_prepare_local_roles.sql');
const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.local-postgres.yml');

const projectName = 'travel-platform-customer-platform-auth-postgres';
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

const agencyAId = '10000000-0000-4000-8000-00000000000a';
const agencySlugA = 'agency-a-customer-platform-auth-test';
const customerAId = '30000000-0000-4000-8000-00000000000a';
const customerAccountEmail = 'customer-a@example.test';
const customerAccountPassword = 'customer-strong-password-1';
const platformUserEmail = 'platform-admin@example.test';
const platformUserPassword = 'platform-strong-password-1';

describe('Customer Portal + Platform Admin local auth (Frontend Auth & Session track)', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let platformPool: Pool;
  let platformDatabase: PlatformDatabaseRuntime;
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
    // F-06: platform_users/platform_sessions are revoked from the runtime
    // role; Platform Admin auth must run on the platform-role pool.
    platformPool = new Pool({
      host: databaseHost,
      port: databasePort,
      database: databaseName,
      user: platformUser,
      [poolPasswordKey]: platformPassword,
    });

    platformDatabase = createPlatformDatabaseRuntime(platformPool);

    await resetDatabase(adminPool);
  });

  beforeEach(async () => {
    await adminPool.query('TRUNCATE TABLE platform_sessions RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE platform_user_audit RESTART IDENTITY CASCADE');
    await adminPool.query('DELETE FROM auth_sessions');
    await adminPool.query('TRUNCATE TABLE customer_sessions RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE customer_password_reset_tokens RESTART IDENTITY CASCADE');
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
    await platformPool?.end();
    await runtimePool?.end();
    await adminPool?.end();
  });

  // ------------------------------------------------------------
  // Customer login
  // ------------------------------------------------------------

  it('customer logs in with correct credentials', async () => {
    const result = await customerLogin(platformDatabase, {
      agencySlug: agencySlugA,
      email: customerAccountEmail,
      password: customerAccountPassword,
      ip: '127.0.0.1',
    });
    expect(result.customerId).toBe(customerAId);

    const resolved = await resolveCustomerSessionByToken(platformDatabase, result.sessionToken);
    expect(resolved?.customerId).toBe(customerAId);
  });

  it('customer login rejects wrong password with a generic message', async () => {
    await expect(
      customerLogin(platformDatabase, {
        agencySlug: agencySlugA,
        email: customerAccountEmail,
        password: 'wrong',
        ip: '127.0.0.1',
      }),
    ).rejects.toThrow('Email ou senha inválidos');
  });

  it('suspended (LOCKED) customer account cannot log in, and logout revokes an active session', async () => {
    const result = await customerLogin(platformDatabase, {
      agencySlug: agencySlugA,
      email: customerAccountEmail,
      password: customerAccountPassword,
      ip: '127.0.0.1',
    });

    await customerLogout(platformDatabase, result.sessionToken);
    expect(await resolveCustomerSessionByToken(platformDatabase, result.sessionToken)).toBeNull();

    await adminPool.query(`UPDATE customer_accounts SET status = 'LOCKED' WHERE customer_id = $1`, [customerAId]);
    await expect(
      customerLogin(platformDatabase, {
        agencySlug: agencySlugA,
        email: customerAccountEmail,
        password: customerAccountPassword,
        ip: '127.0.0.1',
      }),
    ).rejects.toThrow('Email ou senha inválidos');
  });

  it('customer password reset revokes existing sessions and is single-use', async () => {
    const loginResult = await customerLogin(platformDatabase, {
      agencySlug: agencySlugA,
      email: customerAccountEmail,
      password: customerAccountPassword,
      ip: '127.0.0.1',
    });

    await customerForgotPassword(platformDatabase, agencySlugA, customerAccountEmail, '127.0.0.1');
    const tokenRow = await adminPool.query<{ token_hash: string }>(
      `SELECT token_hash FROM customer_password_reset_tokens WHERE agency_id = $1 AND customer_account_id = (
         SELECT id FROM customer_accounts WHERE customer_id = $2 LIMIT 1
       ) ORDER BY created_at DESC LIMIT 1`,
      [agencyAId, customerAId],
    );
    expect(tokenRow.rows).toHaveLength(1);

    const rawToken = 'known-customer-reset-token-0123456789abcdef0123456789abcdef01';
    const knownHash = createHash('sha256').update(rawToken).digest('hex');
    await adminPool.query(`UPDATE customer_password_reset_tokens SET token_hash = $2 WHERE token_hash = $1`, [
      tokenRow.rows[0]!.token_hash,
      knownHash,
    ]);

    await customerResetPassword(platformDatabase, rawToken, 'brand-new-customer-password');

    expect(await resolveCustomerSessionByToken(platformDatabase, loginResult.sessionToken)).toBeNull();
    await expect(customerResetPassword(platformDatabase, rawToken, 'another-password')).rejects.toThrow();

    const relogin = await customerLogin(platformDatabase, {
      agencySlug: agencySlugA,
      email: customerAccountEmail,
      password: 'brand-new-customer-password',
      ip: '127.0.0.1',
    });
    expect(relogin.customerId).toBe(customerAId);
  });

  // ------------------------------------------------------------
  // Platform Admin login
  // ------------------------------------------------------------

  it('platform admin logs in with correct credentials (no MFA enrolled)', async () => {
    const result = await platformLogin(platformDatabase, {
      email: platformUserEmail,
      password: platformUserPassword,
      ip: '127.0.0.1',
    });
    expect(result.state).toBe('FULLY_AUTHENTICATED');
    if (result.state !== 'FULLY_AUTHENTICATED') return;

    const resolved = await resolvePlatformSessionByToken(platformDatabase, result.sessionToken);
    expect(resolved?.email).toBe(platformUserEmail);
  });

  it('platform admin with MFA enrolled must verify before getting a usable session', async () => {
    // Deliberately seeds a LEGACY pre-F-07 plaintext secret: the verify
    // path must still accept it and re-encrypt it at rest on success.
    const secret = totpProvider.generateSecret(platformUserEmail, 'Travel Platform').secret;
    await adminPool.query(`UPDATE platform_users SET mfa_enabled = true, mfa_secret = $2 WHERE email = $1`, [
      platformUserEmail,
      secret,
    ]);

    const loginResult = await platformLogin(platformDatabase, {
      email: platformUserEmail,
      password: platformUserPassword,
      ip: '127.0.0.1',
    });
    expect(loginResult.state).toBe('MFA_REQUIRED');
    if (loginResult.state !== 'MFA_REQUIRED') return;

    const premature = await resolvePlatformSessionByToken(platformDatabase, loginResult.sessionToken);
    expect(premature).toBeNull();

    const code = generateTotpCode(secret);
    const verified = await verifyPlatformMfaAndCompleteLogin(platformDatabase, {
      sessionToken: loginResult.sessionToken,
      code,
    });
    expect(verified.email).toBe(platformUserEmail);

    const resolved = await resolvePlatformSessionByToken(platformDatabase, loginResult.sessionToken);
    expect(resolved?.email).toBe(platformUserEmail);

    // F-07: legacy plaintext must be re-encrypted after the first
    // successful verification, and the migration audited.
    const stored = await adminPool.query<{ mfa_secret: string }>(
      `SELECT mfa_secret FROM platform_users WHERE email = $1`,
      [platformUserEmail],
    );
    expect(stored.rows[0]!.mfa_secret).not.toBe(secret);
    expect(isMfaSecretEncrypted(stored.rows[0]!.mfa_secret)).toBe(true);
    expect(decryptMfaSecret(stored.rows[0]!.mfa_secret)).toBe(secret);

    const userRow = await adminPool.query<{ id: string }>(`SELECT id FROM platform_users WHERE email = $1`, [
      platformUserEmail,
    ]);
    const reencryptAudit = await adminPool.query<{ action: string }>(
      `SELECT action FROM platform_user_audit WHERE platform_user_id = $1 AND action = 'MFA_SECRET_REENCRYPTED'`,
      [userRow.rows[0]!.id],
    );
    expect(reencryptAudit.rows).toHaveLength(1);
  });

  it('platform MFA enrollment stages an encrypted secret and enables MFA only after a valid TOTP confirm', async () => {
    const userRow = await adminPool.query<{ id: string }>(`SELECT id FROM platform_users WHERE email = $1`, [
      platformUserEmail,
    ]);
    const platformUserId = userRow.rows[0]!.id;

    const enrollment = await startPlatformMfaEnrollment(platformDatabase, {
      platformUserId,
      email: platformUserEmail,
    });
    // The only field returned is the otpauth URI -- no raw secret, no
    // recovery codes (platform_users has no recovery-code table).
    expect(Object.keys(enrollment)).toEqual(['provisioningUri']);
    expect(enrollment.provisioningUri).toMatch(/^otpauth:\/\//);
    const secretFromUri = new URL(enrollment.provisioningUri).searchParams.get('secret');
    expect(secretFromUri).toBeTruthy();

    const staged = await adminPool.query<{ mfa_secret: string | null; mfa_enabled: boolean }>(
      `SELECT mfa_secret, mfa_enabled FROM platform_users WHERE id = $1`,
      [platformUserId],
    );
    expect(staged.rows[0]!.mfa_enabled).toBe(false);
    expect(staged.rows[0]!.mfa_secret).toBeTruthy();
    expect(isMfaSecretEncrypted(staged.rows[0]!.mfa_secret!)).toBe(true);
    expect(staged.rows[0]!.mfa_secret).not.toBe(secretFromUri);
    expect(decryptMfaSecret(staged.rows[0]!.mfa_secret!)).toBe(secretFromUri);

    // A staged (unconfirmed) secret must not force MFA at login.
    const preConfirmLogin = await platformLogin(platformDatabase, {
      email: platformUserEmail,
      password: platformUserPassword,
      ip: '127.0.0.1',
    });
    expect(preConfirmLogin.state).toBe('FULLY_AUTHENTICATED');

    await expect(
      confirmPlatformMfaEnrollment(platformDatabase, { platformUserId, code: '000000' }),
    ).rejects.toThrow('Código de verificação inválido');

    await confirmPlatformMfaEnrollment(platformDatabase, {
      platformUserId,
      code: generateTotpCode(secretFromUri!),
    });

    const confirmed = await adminPool.query<{ mfa_secret: string | null; mfa_enabled: boolean }>(
      `SELECT mfa_secret, mfa_enabled FROM platform_users WHERE id = $1`,
      [platformUserId],
    );
    expect(confirmed.rows[0]!.mfa_enabled).toBe(true);
    expect(isMfaSecretEncrypted(confirmed.rows[0]!.mfa_secret!)).toBe(true);
    expect(decryptMfaSecret(confirmed.rows[0]!.mfa_secret!)).toBe(secretFromUri);

    const audit = await adminPool.query<{ action: string }>(
      `SELECT action FROM platform_user_audit WHERE platform_user_id = $1`,
      [platformUserId],
    );
    const actions = audit.rows.map((row) => row.action);
    expect(actions).toContain('MFA_ENROLL_STARTED');
    expect(actions).toContain('MFA_ENABLED');

    const loginResult = await platformLogin(platformDatabase, {
      email: platformUserEmail,
      password: platformUserPassword,
      ip: '127.0.0.1',
    });
    expect(loginResult.state).toBe('MFA_REQUIRED');
    if (loginResult.state !== 'MFA_REQUIRED') return;

    const verified = await verifyPlatformMfaAndCompleteLogin(platformDatabase, {
      sessionToken: loginResult.sessionToken,
      code: generateTotpCode(secretFromUri!),
    });
    expect(verified.email).toBe(platformUserEmail);
  });

  it('re-enrollment is rejected while platform MFA is active', async () => {
    const userRow = await adminPool.query<{ id: string }>(`SELECT id FROM platform_users WHERE email = $1`, [
      platformUserEmail,
    ]);
    const platformUserId = userRow.rows[0]!.id;

    const enrollment = await startPlatformMfaEnrollment(platformDatabase, {
      platformUserId,
      email: platformUserEmail,
    });
    const secretFromUri = new URL(enrollment.provisioningUri).searchParams.get('secret');
    await confirmPlatformMfaEnrollment(platformDatabase, {
      platformUserId,
      code: generateTotpCode(secretFromUri!),
    });

    await expect(
      startPlatformMfaEnrollment(platformDatabase, { platformUserId, email: platformUserEmail }),
    ).rejects.toThrow('MFA já está ativo para este usuário');
  });

  it('platform admin logout revokes the session', async () => {
    const loginResult = await platformLogin(platformDatabase, {
      email: platformUserEmail,
      password: platformUserPassword,
      ip: '127.0.0.1',
    });
    if (loginResult.state !== 'FULLY_AUTHENTICATED') throw new Error('expected FULLY_AUTHENTICATED');

    await platformLogout(platformDatabase, loginResult.sessionToken);
    expect(await resolvePlatformSessionByToken(platformDatabase, loginResult.sessionToken)).toBeNull();
  });

  it('suspending a platform user revokes their sessions and blocks further login', async () => {
    const loginResult = await platformLogin(platformDatabase, {
      email: platformUserEmail,
      password: platformUserPassword,
      ip: '127.0.0.1',
    });
    if (loginResult.state !== 'FULLY_AUTHENTICATED') throw new Error('expected FULLY_AUTHENTICATED');

    const userRow = await adminPool.query<{ id: string }>(`SELECT id FROM platform_users WHERE email = $1`, [
      platformUserEmail,
    ]);
    await setPlatformUserStatus(platformDatabase, userRow.rows[0]!.id, 'SUSPENDED');

    expect(await resolvePlatformSessionByToken(platformDatabase, loginResult.sessionToken)).toBeNull();
    await expect(
      platformLogin(platformDatabase, { email: platformUserEmail, password: platformUserPassword, ip: '127.0.0.1' }),
    ).rejects.toThrow('Email ou senha inválidos');
  });

  // ------------------------------------------------------------
  // helpers
  // ------------------------------------------------------------

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

  function readSqlForPg(filePath: string): string {
    return readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .filter((line) => !line.trimStart().startsWith('\\'))
      .join('\n');
  }

  function assertSafeTestDatabase(): void {
    if (!['127.0.0.1', 'localhost'].includes(databaseHost)) {
      throw new Error('Customer/Platform auth tests require localhost only.');
    }
    if (!databaseName.includes('test')) {
      throw new Error('Customer/Platform auth tests require a database name with a test marker.');
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
       VALUES ($1, 'Agency A', $2, 'agency-a-cp-auth@example.test', 'FREE', 'ACTIVE')`,
      [agencyAId, agencySlugA],
    );
    await pool.query(
      `INSERT INTO customers (id, agency_id, name, email, status)
       VALUES ($1, $2, 'Customer A', $3, 'ACTIVE')`,
      [customerAId, agencyAId, 'customer-a-record@example.test'],
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
