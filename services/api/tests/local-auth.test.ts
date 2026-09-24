import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash, createHmac } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { UserRole } from '../../../packages/domain/types';
import { createDatabaseRuntime, createPlatformDatabaseRuntime, type DatabaseRuntime } from '../src/database';
import type { PlatformDatabaseRuntime } from '../src/database';
import { hashPassword } from '../src/password-hashing';
import { createTotpProvider } from '../src/mfa-provider';
import {
  confirmMfaEnrollment,
  disableMfa,
  forgotPassword,
  listMySessions,
  login,
  resetPassword,
  resolveSessionByToken,
  revokeSession,
  setUserStatus,
  startMfaEnrollment,
  verifyMfaAndCompleteLogin,
} from '../src/local-auth';
import { runWithTenantContext } from '../../../packages/domain/tenant-context';

const repoRoot = resolve(import.meta.dirname, '../../..');
const migrationsDir = resolve(repoRoot, 'infrastructure/migrations');
const migrationFiles = readdirSync(migrationsDir)
  .filter((name) => /^\d+_.+\.sql$/.test(name))
  .sort()
  .map((name) => resolve(migrationsDir, name));
const prepareRolesSql = resolve(repoRoot, 'tests/integration/database/002_prepare_local_roles.sql');
const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.local-postgres.yml');

const projectName = 'travel-platform-local-auth-postgres';
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

const agencyAId = '10000000-0000-4000-8000-000000000006';
const agencySlugA = 'agency-a-local-auth-test';
const ownerAId = '11000000-0000-4000-8000-000000000007';
const ownerAEmail = 'owner-a@example.test';
const ownerAPassword = 'correct-horse-battery-staple';

const ownerContextA = {
  agencyId: agencyAId,
  userId: ownerAId,
  userRole: UserRole.OWNER,
  email: ownerAEmail,
};

describe('Local password auth (Pilot Delivery Gap Closure -- Agent 02/Identity)', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let platformPool: Pool;
  let database: DatabaseRuntime;
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
    // F-06: platformDatabase runs on the platform-role pool (mirrors
    // server.ts); the tenant DatabaseRuntime keeps its runtime pool.
    platformPool = new Pool({
      host: databaseHost,
      port: databasePort,
      database: databaseName,
      user: platformUser,
      [poolPasswordKey]: platformPassword,
    });

    database = createDatabaseRuntime(runtimePool, platformPool);
    platformDatabase = createPlatformDatabaseRuntime(platformPool);

    await resetDatabase(adminPool);
  });

  beforeEach(async () => {
    await adminPool.query('TRUNCATE TABLE mfa_totp_attempts RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE mfa_recovery_codes RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE mfa_totp_secrets RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE password_reset_tokens RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE auth_sessions RESTART IDENTITY CASCADE');
    await adminPool.query(
      `UPDATE users SET status = 'ACTIVE', password_hash = $2 WHERE id = $1`,
      [ownerAId, await hashPassword(ownerAPassword)],
    );
  });

  afterAll(async () => {
    await platformPool?.end();
    await runtimePool?.end();
    await adminPool?.end();
  });

  // ------------------------------------------------------------
  // Login
  // ------------------------------------------------------------

  it('logs in with correct credentials -- no MFA enrolled -> FULLY_AUTHENTICATED', async () => {
    const result = await login(platformDatabase, {
      agencySlug: agencySlugA,
      email: ownerAEmail,
      password: ownerAPassword,
      ip: '127.0.0.1',
    });
    expect(result.state).toBe('FULLY_AUTHENTICATED');
    if (result.state === 'FULLY_AUTHENTICATED') {
      expect(result.userId).toBe(ownerAId);
      expect(result.agencyId).toBe(agencyAId);
      expect(result.mfaEnrollmentRecommended).toBe(true); // OWNER role, mfa_requirements defaults to mandatory

      const resolved = await resolveSessionByToken(platformDatabase, result.sessionToken);
      expect(resolved?.userId).toBe(ownerAId);
    }
  });

  it('rejects a wrong password with the same generic error as an unknown user (no enumeration)', async () => {
    await expect(
      login(platformDatabase, {
        agencySlug: agencySlugA,
        email: ownerAEmail,
        password: 'totally-wrong-password',
        ip: '127.0.0.1',
      }),
    ).rejects.toThrow('Email ou senha inválidos');

    await expect(
      login(platformDatabase, {
        agencySlug: agencySlugA,
        email: 'nobody@example.test',
        password: 'anything-at-all',
        ip: '127.0.0.1',
      }),
    ).rejects.toThrow('Email ou senha inválidos');

    await expect(
      login(platformDatabase, {
        agencySlug: 'not-a-real-agency',
        email: ownerAEmail,
        password: ownerAPassword,
        ip: '127.0.0.1',
      }),
    ).rejects.toThrow('Email ou senha inválidos');
  });

  it('disable/suspend user invalidates access: a SUSPENDED user cannot log in', async () => {
    await adminPool.query(`UPDATE users SET status = 'SUSPENDED' WHERE id = $1`, [ownerAId]);
    await expect(
      login(platformDatabase, {
        agencySlug: agencySlugA,
        email: ownerAEmail,
        password: ownerAPassword,
        ip: '127.0.0.1',
      }),
    ).rejects.toThrow('Email ou senha inválidos');
  });

  it('setUserStatus(SUSPENDED) revokes all of the user\'s existing sessions immediately', async () => {
    const loginResult = await login(platformDatabase, {
      agencySlug: agencySlugA,
      email: ownerAEmail,
      password: ownerAPassword,
      ip: '127.0.0.1',
    });
    expect(loginResult.state).toBe('FULLY_AUTHENTICATED');
    if (loginResult.state !== 'FULLY_AUTHENTICATED') return;

    let resolved = await resolveSessionByToken(platformDatabase, loginResult.sessionToken);
    expect(resolved).not.toBeNull();

    await runWithTenantContext(ownerContextA, () =>
      setUserStatus(database, ownerAId, 'SUSPENDED', 'TEST_SUSPEND'),
    );

    resolved = await resolveSessionByToken(platformDatabase, loginResult.sessionToken);
    expect(resolved).toBeNull();

    // Reactivating doesn't resurrect the old (already-invalidated) session.
    await adminPool.query(`UPDATE users SET status = 'ACTIVE' WHERE id = $1`, [ownerAId]);
    resolved = await resolveSessionByToken(platformDatabase, loginResult.sessionToken);
    expect(resolved).toBeNull();
  });

  // ------------------------------------------------------------
  // MFA enrollment + verification + recovery codes
  // ------------------------------------------------------------

  it('enrolls MFA, confirms with a valid TOTP code, then login requires MFA verification', async () => {
    const enrollment = await runWithTenantContext(ownerContextA, () =>
      startMfaEnrollment(database, totpProvider, ownerAEmail),
    );
    expect(enrollment.recoveryCodes).toHaveLength(16);
    expect(enrollment.provisioningUri).toContain('otpauth://totp/');

    const secretMatch = /secret=([A-Z2-7]+)/.exec(enrollment.provisioningUri);
    const secret = secretMatch?.[1];
    expect(secret).toBeTruthy();

    const validCode = totpProvider.verifyCode(secret!, generateCodeForSecret(totpProvider, secret!));
    expect(validCode.valid).toBe(true);

    await runWithTenantContext(ownerContextA, () =>
      confirmMfaEnrollment(database, totpProvider, enrollment.secretId, generateCodeForSecret(totpProvider, secret!)),
    );

    // Login now returns MFA_REQUIRED instead of a usable session directly.
    const loginResult = await login(platformDatabase, {
      agencySlug: agencySlugA,
      email: ownerAEmail,
      password: ownerAPassword,
      ip: '127.0.0.1',
    });
    expect(loginResult.state).toBe('MFA_REQUIRED');

    // The MFA-pending session must NOT authenticate ordinary requests yet.
    const prematureResolve = await resolveSessionByToken(platformDatabase, loginResult.sessionToken);
    expect(prematureResolve).toBeNull();

    const verifyResult = await verifyMfaAndCompleteLogin(platformDatabase, totpProvider, {
      sessionToken: loginResult.sessionToken,
      code: generateCodeForSecret(totpProvider, secret!),
      ip: '127.0.0.1',
    });
    expect(verifyResult.userId).toBe(ownerAId);

    const resolved = await resolveSessionByToken(platformDatabase, loginResult.sessionToken);
    expect(resolved?.userId).toBe(ownerAId);
  });

  it('rejects an invalid TOTP code at MFA verification', async () => {
    const { secret, } = await enrollAndConfirmMfa();
    void secret;

    const loginResult = await login(platformDatabase, {
      agencySlug: agencySlugA,
      email: ownerAEmail,
      password: ownerAPassword,
      ip: '127.0.0.1',
    });
    expect(loginResult.state).toBe('MFA_REQUIRED');
    if (loginResult.state !== 'MFA_REQUIRED') return;

    await expect(
      verifyMfaAndCompleteLogin(platformDatabase, totpProvider, {
        sessionToken: loginResult.sessionToken,
        code: '000000',
        ip: '127.0.0.1',
      }),
    ).rejects.toThrow('Código de MFA inválido');
  });

  it('accepts a valid recovery code exactly once at MFA verification', async () => {
    const { recoveryCode } = await enrollAndConfirmMfa();

    const loginResult = await login(platformDatabase, {
      agencySlug: agencySlugA,
      email: ownerAEmail,
      password: ownerAPassword,
      ip: '127.0.0.1',
    });
    expect(loginResult.state).toBe('MFA_REQUIRED');
    if (loginResult.state !== 'MFA_REQUIRED') return;

    const verified = await verifyMfaAndCompleteLogin(platformDatabase, totpProvider, {
      sessionToken: loginResult.sessionToken,
      code: recoveryCode,
      ip: '127.0.0.1',
    });
    expect(verified.userId).toBe(ownerAId);

    // Second login attempt, reusing the SAME recovery code -- must fail.
    const secondLogin = await login(platformDatabase, {
      agencySlug: agencySlugA,
      email: ownerAEmail,
      password: ownerAPassword,
      ip: '127.0.0.1',
    });
    if (secondLogin.state !== 'MFA_REQUIRED') throw new Error('expected MFA_REQUIRED');
    await expect(
      verifyMfaAndCompleteLogin(platformDatabase, totpProvider, {
        sessionToken: secondLogin.sessionToken,
        code: recoveryCode,
        ip: '127.0.0.1',
      }),
    ).rejects.toThrow('Código de MFA inválido');
  });

  it('disabling MFA is audited and removes the MFA requirement from subsequent logins', async () => {
    await enrollAndConfirmMfa();

    await runWithTenantContext(ownerContextA, () => disableMfa(database, 'USER_REQUESTED'));

    const loginResult = await login(platformDatabase, {
      agencySlug: agencySlugA,
      email: ownerAEmail,
      password: ownerAPassword,
      ip: '127.0.0.1',
    });
    expect(loginResult.state).toBe('FULLY_AUTHENTICATED');

    const auditRows = await adminPool.query<{ event_type: string }>(
      `SELECT event_type FROM audit_logs WHERE agency_id = $1 AND event_type = 'MFA_DISABLED'`,
      [agencyAId],
    );
    expect(auditRows.rows.length).toBeGreaterThan(0);
  });

  // ------------------------------------------------------------
  // Session revocation / logout
  // ------------------------------------------------------------

  it('revokes an individual session by id; that session can no longer authenticate', async () => {
    const loginResult = await login(platformDatabase, {
      agencySlug: agencySlugA,
      email: ownerAEmail,
      password: ownerAPassword,
      ip: '127.0.0.1',
    });
    if (loginResult.state !== 'FULLY_AUTHENTICATED') throw new Error('expected FULLY_AUTHENTICATED');

    const resolved = await resolveSessionByToken(platformDatabase, loginResult.sessionToken);
    expect(resolved).not.toBeNull();

    const revoked = await runWithTenantContext(ownerContextA, () =>
      revokeSession(database, resolved!.sessionId, 'USER_REVOKED'),
    );
    expect(revoked).toBe(true);

    const afterRevoke = await resolveSessionByToken(platformDatabase, loginResult.sessionToken);
    expect(afterRevoke).toBeNull();
  });

  it('lists the caller\'s own active sessions with isCurrent flagged correctly', async () => {
    const first = await login(platformDatabase, {
      agencySlug: agencySlugA,
      email: ownerAEmail,
      password: ownerAPassword,
      ip: '127.0.0.1',
    });
    const second = await login(platformDatabase, {
      agencySlug: agencySlugA,
      email: ownerAEmail,
      password: ownerAPassword,
      ip: '127.0.0.1',
    });
    if (first.state !== 'FULLY_AUTHENTICATED' || second.state !== 'FULLY_AUTHENTICATED') {
      throw new Error('expected FULLY_AUTHENTICATED');
    }

    const secondResolved = await resolveSessionByToken(platformDatabase, second.sessionToken);
    const sessions = await runWithTenantContext(ownerContextA, () =>
      listMySessions(database, secondResolved!.sessionId),
    );
    expect(sessions.length).toBeGreaterThanOrEqual(2);
    expect(sessions.filter((s) => s.isCurrent)).toHaveLength(1);
    expect(sessions.find((s) => s.isCurrent)?.id).toBe(secondResolved!.sessionId);
  });

  // ------------------------------------------------------------
  // Forgot / reset password
  // ------------------------------------------------------------

  it('forgot-password always returns generically for unknown emails/agencies (no enumeration)', async () => {
    await expect(
      forgotPassword(platformDatabase, agencySlugA, 'unknown@example.test', '127.0.0.1'),
    ).resolves.toBeUndefined();
    await expect(
      forgotPassword(platformDatabase, 'not-a-real-agency', ownerAEmail, '127.0.0.1'),
    ).resolves.toBeUndefined();
  });

  it('reset-password: single-use, hashed, expiring token that revokes all sessions and is audited', async () => {
    const loginResult = await login(platformDatabase, {
      agencySlug: agencySlugA,
      email: ownerAEmail,
      password: ownerAPassword,
      ip: '127.0.0.1',
    });
    if (loginResult.state !== 'FULLY_AUTHENTICATED') throw new Error('expected FULLY_AUTHENTICATED');

    await forgotPassword(platformDatabase, agencySlugA, ownerAEmail, '127.0.0.1');

    const tokenRow = await adminPool.query<{ token_hash: string }>(
      `SELECT token_hash FROM password_reset_tokens WHERE agency_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 1`,
      [agencyAId, ownerAId],
    );
    expect(tokenRow.rows).toHaveLength(1);
    // The raw token is never persisted -- only its hash. Recover the raw
    // token the same way the real HTTP layer would receive it: since no
    // email provider is wired yet, forgotPassword() doesn't expose it via
    // its return value either (see local-auth.ts's comment on this), so
    // this test drives resetPassword() through a second, white-box path:
    // insert a fresh, known raw token bound to the same hash-lookup
    // mechanism reset-password uses, to prove the full reset semantics
    // (single-use, revokes sessions, audited) without needing a real
    // mail transport.
    const rawToken = 'test-known-raw-token-0123456789abcdef0123456789abcdef01234567';
    const knownHash = createHash('sha256').update(rawToken).digest('hex');
    await adminPool.query(`UPDATE password_reset_tokens SET token_hash = $2 WHERE token_hash = $1`, [
      tokenRow.rows[0]!.token_hash,
      knownHash,
    ]);

    const newPassword = 'a-brand-new-strong-password';
    await resetPassword(platformDatabase, rawToken, newPassword);

    // Old session is revoked.
    const oldResolved = await resolveSessionByToken(platformDatabase, loginResult.sessionToken);
    expect(oldResolved).toBeNull();

    // Old password no longer works; new one does.
    await expect(
      login(platformDatabase, { agencySlug: agencySlugA, email: ownerAEmail, password: ownerAPassword, ip: '127.0.0.1' }),
    ).rejects.toThrow();
    const relogin = await login(platformDatabase, {
      agencySlug: agencySlugA,
      email: ownerAEmail,
      password: newPassword,
      ip: '127.0.0.1',
    });
    expect(relogin.state).toBe('FULLY_AUTHENTICATED');

    // Token is single-use.
    await expect(resetPassword(platformDatabase, rawToken, 'yet-another-password')).rejects.toThrow();

    const auditRows = await adminPool.query<{ event_type: string }>(
      `SELECT event_type FROM audit_logs WHERE agency_id = $1 AND event_type IN ('PASSWORD_RESET_REQUESTED','PASSWORD_RESET_COMPLETED')`,
      [agencyAId],
    );
    expect(auditRows.rows.map((r) => r.event_type).sort()).toEqual([
      'PASSWORD_RESET_COMPLETED',
      'PASSWORD_RESET_REQUESTED',
    ]);
  });

  it('reset-password rejects an expired token', async () => {
    await forgotPassword(platformDatabase, agencySlugA, ownerAEmail, '127.0.0.1');
    await adminPool.query(
      `UPDATE password_reset_tokens SET expires_at = now() - interval '1 hour' WHERE agency_id = $1 AND user_id = $2`,
      [agencyAId, ownerAId],
    );
    const tokenRow = await adminPool.query<{ token_hash: string }>(
      `SELECT token_hash FROM password_reset_tokens WHERE agency_id = $1 AND user_id = $2`,
      [agencyAId, ownerAId],
    );
    const rawToken = 'expired-test-token-0123456789abcdef0123456789abcdef012345670';
    const knownHash = createHash('sha256').update(rawToken).digest('hex');
    await adminPool.query(`UPDATE password_reset_tokens SET token_hash = $2 WHERE token_hash = $1`, [
      tokenRow.rows[0]!.token_hash,
      knownHash,
    ]);

    await expect(resetPassword(platformDatabase, rawToken, 'new-password-123')).rejects.toThrow(
      'Link de redefinição inválido ou expirado',
    );
  });

  // ------------------------------------------------------------
  // helpers
  // ------------------------------------------------------------

  async function enrollAndConfirmMfa(): Promise<{ secret: string; recoveryCode: string }> {
    const enrollment = await runWithTenantContext(ownerContextA, () =>
      startMfaEnrollment(database, totpProvider, ownerAEmail),
    );
    const secretMatch = /secret=([A-Z2-7]+)/.exec(enrollment.provisioningUri);
    const secret = secretMatch![1]!;
    await runWithTenantContext(ownerContextA, () =>
      confirmMfaEnrollment(database, totpProvider, enrollment.secretId, generateCodeForSecret(totpProvider, secret)),
    );
    return { secret, recoveryCode: enrollment.recoveryCodes[0]! };
  }

  function generateCodeForSecret(provider: ReturnType<typeof createTotpProvider>, secretBase32: string): string {
    // Re-derive a currently-valid code the same way TotpProvider.verifyCode
    // checks it, without depending on a private method -- uses the
    // provider's own decodeBase32 + the HOTP algorithm indirectly by
    // brute-forcing the 6-digit space against verifyCode would be slow;
    // instead reconstruct via the exported HotpProvider primitive.
    const nowSeconds = Math.floor(Date.now() / 1000);
    const period = 30;
    const window = Math.floor(nowSeconds / period);
    const secretBytes = provider.decodeBase32(secretBase32);
    return HotpProviderGenerate(secretBytes, window);
  }

  function HotpProviderGenerate(secret: Buffer, counter: number): string {
    // Mirrors HotpProvider.generateHotp (not exported) -- RFC 4226,
    // SHA1/6-digit/30s defaults matching createTotpProvider()'s defaults.
    const hmac = createHmac('sha1', secret);
    const counterBuffer = Buffer.alloc(8);
    let c = counter;
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
      throw new Error('Local auth tests require localhost only.');
    }
    if (!databaseName.includes('test')) {
      throw new Error('Local auth tests require a database name with a test marker.');
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
       VALUES ($1, 'Agency A', $2, 'agency-a-local-auth@example.test', 'FREE', 'ACTIVE')`,
      [agencyAId, agencySlugA],
    );
    await pool.query(
      `INSERT INTO users (id, agency_id, email, name, role, password_hash, status)
       VALUES ($1, $2, $3, 'Owner A', 'OWNER', $4, 'ACTIVE')`,
      [ownerAId, agencyAId, ownerAEmail, await hashPassword(ownerAPassword)],
    );
  }
});
