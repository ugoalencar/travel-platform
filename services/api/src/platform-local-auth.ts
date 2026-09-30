/**
 * Local email+password authentication for Platform Admin
 * (Frontend Auth & Session track, decided 2026-09-14).
 *
 * platform_users (025_platform_super_admin_authorization.sql) is
 * architecturally distinct from the staff/customer flows: no agency_id
 * (platform-wide, not tenant-scoped), no RLS ("access control is
 * application-code only"), and MFA is a single embedded TOTP secret
 * column rather than the richer per-secret/recovery-codes table used
 * for staff -- there is no recovery-code table for platform_users in the
 * existing schema, so none is invented here; a locked-out platform admin
 * is a break-glass/support operation, not a self-service one.
 *
 * F-07: the embedded secret is encrypted at rest (AES-256-GCM via
 * mfa-encryption.ts, keyed by MFA_ENCRYPTION_KEY). Enrollment is staged
 * (secret written encrypted with mfa_enabled=false until the admin
 * confirms a valid TOTP code); pre-F-07 plaintext rows still verify and
 * are re-encrypted on first successful verification.
 *
 * Recovery (098): enrollment issues one-time MFA recovery codes (stored as
 * SHA-256 hashes) that are accepted in place of a TOTP code; a lost
 * authenticator is reset with password + TOTP-or-recovery-code; a forgotten
 * password is reset through a single-use, expiring emailed token. A password
 * reset never disables MFA.
 *
 * Sessions live in platform_sessions (062_customer_platform_local_auth.sql),
 * not auth_sessions -- that table is agency_id NOT NULL and RLS-protected,
 * neither of which fits a principal with no agency at all.
 */

import { randomBytes, createHash } from 'node:crypto';
import { UnauthorizedError } from '../../../packages/domain/tenant-context';
import type { PlatformUserRole } from '../../../packages/domain/types';
import type { PlatformDatabaseRuntime, TenantTransactionClient } from './database';
import { ConflictError, NotFoundError, ValidationError } from './errors';
import { hashPassword, unusablePasswordHash, verifyPassword } from './password-hashing';
import { createTotpProvider, hashRecoveryCode, verifyRecoveryCode } from './mfa-provider';
import { sendPlatformPasswordResetEmail } from './email';
import { decryptMfaSecret, encryptMfaSecret, isMfaSecretEncrypted } from './mfa-encryption';

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h -- shorter than staff/customer (24h): platform admin holds cross-tenant power
const MFA_CHALLENGE_TTL_MS = 10 * 60 * 1000;
const MAX_MFA_FAILED_ATTEMPTS = 5; // per challenge; then the challenge is invalidated
const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;
const MIN_PLATFORM_PASSWORD_LENGTH = 12;

function generateOpaqueToken(): string {
  return randomBytes(32).toString('hex');
}

function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function recordPlatformAudit(
  client: TenantTransactionClient,
  platformUserId: string,
  action: string,
  details?: Record<string, unknown>,
): Promise<void> {
  return client
    .query(
      `INSERT INTO platform_user_audit (platform_user_id, action, details) VALUES ($1, $2, $3::jsonb)`,
      [platformUserId, action, JSON.stringify(details ?? {})],
    )
    .then(() => undefined);
}

export interface PlatformLoginInput {
  email: string;
  password: string;
  ip: string;
}

export type PlatformLoginResult =
  | { state: 'MFA_REQUIRED'; sessionToken: string; expiresAt: Date }
  | {
      state: 'FULLY_AUTHENTICATED';
      sessionToken: string;
      expiresAt: Date;
      platformUserId: string;
      email: string;
      role: PlatformUserRole;
    };

interface PlatformUserRow {
  id: string;
  email: string;
  password_hash: string;
  role: PlatformUserRole;
  mfa_enabled: boolean;
  mfa_secret: string | null;
  status: string;
}

const GENERIC_LOGIN_ERROR = 'Email ou senha inválidos';
const totpProvider = createTotpProvider();

/**
 * Decrypt a stored platform MFA secret. Encrypted blobs (AES-256-GCM)
 * decrypt; pre-F-07 legacy rows hold base32 plaintext and pass through.
 */
function resolvePlatformMfaSecret(stored: string): string {
  return isMfaSecretEncrypted(stored) ? decryptMfaSecret(stored) : stored;
}

export async function platformLogin(
  platformDatabase: PlatformDatabaseRuntime,
  input: PlatformLoginInput,
): Promise<PlatformLoginResult> {
  const user = await platformDatabase.withPublicLookupTransaction(
    'app.platform_email_lookup',
    input.email,
    async (client) => {
      const result = await client.query<PlatformUserRow>(
        `SELECT id, email, password_hash, role, mfa_enabled, mfa_secret, status
         FROM platform_users WHERE email = $1`,
        [input.email],
      );
      return result.rows[0] ?? null;
    },
  );

  const passwordOk = await verifyPassword(input.password, user?.password_hash ?? unusablePasswordHash());

  if (!user || !passwordOk || user.status !== 'ACTIVE') {
    throw new UnauthorizedError(GENERIC_LOGIN_ERROR);
  }

  const rawToken = generateOpaqueToken();
  const tokenHash = hashOpaqueToken(rawToken);
  const now = Date.now();

  if (user.mfa_enabled && user.mfa_secret) {
    const expiresAt = new Date(now + MFA_CHALLENGE_TTL_MS);
    await platformDatabase.withPublicLookupTransaction('app.platform_email_lookup', input.email, (client) =>
      client.query(
        `INSERT INTO platform_sessions (platform_user_id, session_token_hash, state, expires_at)
         VALUES ($1, $2, 'MFA_PENDING', $3)`,
        [user.id, tokenHash, expiresAt],
      ),
    );
    return { state: 'MFA_REQUIRED', sessionToken: rawToken, expiresAt };
  }

  const expiresAt = new Date(now + SESSION_TTL_MS);
  await platformDatabase.withPublicLookupTransaction('app.platform_email_lookup', input.email, async (client) => {
    await client.query(
      `INSERT INTO platform_sessions (platform_user_id, session_token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, tokenHash, expiresAt],
    );
    await client.query(`UPDATE platform_users SET last_login_at = now() WHERE id = $1`, [user.id]);
    await recordPlatformAudit(client, user.id, 'LOGIN_SUCCEEDED');
  });

  return {
    state: 'FULLY_AUTHENTICATED',
    sessionToken: rawToken,
    expiresAt,
    platformUserId: user.id,
    email: user.email,
    role: user.role,
  };
}

export interface VerifyPlatformMfaInput {
  sessionToken: string;
  code: string;
}

export async function verifyPlatformMfaAndCompleteLogin(
  platformDatabase: PlatformDatabaseRuntime,
  input: VerifyPlatformMfaInput,
): Promise<{ sessionToken: string; expiresAt: Date; platformUserId: string; email: string; role: PlatformUserRole }> {
  const tokenHash = hashOpaqueToken(input.sessionToken);

  const session = await platformDatabase.withPublicLookupTransaction(
    'app.platform_session_lookup_hash',
    tokenHash,
    async (client) => {
      const result = await client.query<{
        id: string;
        platform_user_id: string;
        state: string;
        expires_at: string;
        invalidated_at: string | null;
      }>(
        `SELECT id, platform_user_id, state, expires_at, invalidated_at
         FROM platform_sessions WHERE session_token_hash = $1`,
        [tokenHash],
      );
      return result.rows[0] ?? null;
    },
  );

  if (
    !session ||
    session.state !== 'MFA_PENDING' ||
    session.invalidated_at ||
    new Date(session.expires_at) < new Date()
  ) {
    throw new UnauthorizedError('Desafio de MFA inválido ou expirado');
  }

  const outcome = await platformDatabase.withPublicLookupTransaction(
    'app.platform_session_lookup_hash',
    tokenHash,
    async (client) => {
      const userResult = await client.query<PlatformUserRow>(
        `SELECT id, email, password_hash, role, mfa_enabled, mfa_secret, status FROM platform_users WHERE id = $1`,
        [session.platform_user_id],
      );
      const user = userResult.rows[0];
      if (!user || !user.mfa_secret) {
        throw new UnauthorizedError('MFA não configurado');
      }

      const verification = totpProvider.verifyCode(resolvePlatformMfaSecret(user.mfa_secret), input.code);
      const recoveryCodeId = verification.valid ? null : await findUnusedRecoveryCode(client, user.id, input.code);
      if (!verification.valid && !recoveryCodeId) {
        return { state: 'INVALID' as const, platformUserId: user.id };
      }
      if (recoveryCodeId) {
        await client.query(`UPDATE platform_mfa_recovery_codes SET used_at = now() WHERE id = $1`, [recoveryCodeId]);
        const remaining = await countUnusedRecoveryCodes(client, user.id);
        await recordPlatformAudit(client, user.id, 'MFA_RECOVERY_CODE_USED', { remaining });
      }

      // F-07: re-encrypt a legacy plaintext secret on the first successful
      // verification (fail-closed: a key/encryption failure aborts login).
      if (!isMfaSecretEncrypted(user.mfa_secret)) {
        await client.query(`UPDATE platform_users SET mfa_secret = $2, updated_at = now() WHERE id = $1`, [
          user.id,
          encryptMfaSecret(user.mfa_secret),
        ]);
        await recordPlatformAudit(client, user.id, 'MFA_SECRET_REENCRYPTED');
      }

      const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
      await client.query(
        `UPDATE platform_sessions SET state = 'ACTIVE', expires_at = $2, updated_at = now() WHERE id = $1`,
        [session.id, expiresAt],
      );
      await client.query(`UPDATE platform_users SET last_login_at = now() WHERE id = $1`, [user.id]);
      await recordPlatformAudit(client, user.id, 'LOGIN_SUCCEEDED');

      return {
        state: 'AUTHENTICATED' as const,
        result: {
          sessionToken: input.sessionToken,
          expiresAt,
          platformUserId: user.id,
          email: user.email,
          role: user.role,
        },
      };
    },
  );

  if (outcome.state === 'INVALID') {
    // Persist the failed challenge outside the verification transaction.
    // Throwing inside that transaction rolled this audit row back together
    // with the authentication attempt.
    await platformDatabase.withPublicLookupTransaction(
      'app.platform_session_lookup_hash',
      tokenHash,
      async (client) => {
        const updated = await client.query<{ mfa_failed_attempts: number }>(
          `UPDATE platform_sessions
           SET mfa_failed_attempts = mfa_failed_attempts + 1,
               invalidated_at = CASE WHEN mfa_failed_attempts + 1 >= $2 THEN now() ELSE invalidated_at END,
               revoked_reason = CASE WHEN mfa_failed_attempts + 1 >= $2 THEN 'MFA_TOO_MANY_FAILURES' ELSE revoked_reason END,
               updated_at = now()
           WHERE id = $1
           RETURNING mfa_failed_attempts`,
          [session.id, MAX_MFA_FAILED_ATTEMPTS],
        );
        const attempts = updated.rows[0]?.mfa_failed_attempts ?? 0;
        await recordPlatformAudit(client, outcome.platformUserId, 'MFA_CHALLENGE_FAILED', { attempts });
        if (attempts >= MAX_MFA_FAILED_ATTEMPTS) {
          await recordPlatformAudit(client, outcome.platformUserId, 'SESSION_REVOKED', { reasonCode: 'MFA_TOO_MANY_FAILURES' });
        }
      },
    );
    throw new UnauthorizedError('Código de MFA inválido');
  }

  return outcome.result;
}

// ============================================================
// MFA enrollment (F-07)
// ============================================================

export interface PlatformMfaEnrollmentStart {
  provisioningUri: string;
  /** One-time recovery codes, shown exactly once; only hashes are stored. */
  recoveryCodes: string[];
}

/**
 * Stage a new TOTP secret for the authenticated platform admin. The
 * secret is written encrypted with mfa_enabled=false until confirmed, so
 * a staged (or interrupted) enrollment never forces MFA at login. The
 * raw secret is exposed exactly once, inside the otpauth:// URI used to
 * provision the authenticator app, together with fresh one-time recovery
 * codes (any previous codes are discarded).
 */
export async function startPlatformMfaEnrollment(
  platformDatabase: PlatformDatabaseRuntime,
  input: { platformUserId: string; email: string },
): Promise<PlatformMfaEnrollmentStart> {
  return platformDatabase.withPublicLookupTransaction(
    'app.platform_email_lookup',
    input.platformUserId,
    async (client) => {
      const result = await client.query<{ mfa_enabled: boolean }>(
        `SELECT mfa_enabled FROM platform_users WHERE id = $1`,
        [input.platformUserId],
      );
      const user = result.rows[0];
      if (!user) {
        throw new NotFoundError('Usuário de plataforma não encontrado');
      }
      if (user.mfa_enabled) {
        throw new ConflictError('MFA já está ativo para este usuário');
      }

      const generated = totpProvider.generateSecret(input.email, 'Travel Platform');
      await client.query(
        `UPDATE platform_users SET mfa_secret = $2, mfa_enabled = false, updated_at = now() WHERE id = $1`,
        [input.platformUserId, encryptMfaSecret(generated.secret)],
      );
      await client.query(`DELETE FROM platform_mfa_recovery_codes WHERE platform_user_id = $1`, [input.platformUserId]);
      for (const [index, code] of generated.recoveryCodesPlaintext.entries()) {
        await client.query(
          `INSERT INTO platform_mfa_recovery_codes (platform_user_id, code_hash, position) VALUES ($1, $2, $3)`,
          [input.platformUserId, hashRecoveryCode(code), index + 1],
        );
      }
      await recordPlatformAudit(client, input.platformUserId, 'MFA_ENROLL_STARTED');

      return { provisioningUri: generated.provisioningUri, recoveryCodes: generated.recoveryCodesPlaintext };
    },
  );
}

/**
 * Confirm a staged enrollment: verify one TOTP code against the staged
 * secret, then flip mfa_enabled=true. The stored value is (re)written
 * encrypted so the at-rest invariant holds even if a staged row somehow
 * contained plaintext.
 */
export async function confirmPlatformMfaEnrollment(
  platformDatabase: PlatformDatabaseRuntime,
  input: { platformUserId: string; code: string },
): Promise<void> {
  await platformDatabase.withPublicLookupTransaction(
    'app.platform_email_lookup',
    input.platformUserId,
    async (client) => {
      const result = await client.query<{ mfa_secret: string | null; mfa_enabled: boolean }>(
        `SELECT mfa_secret, mfa_enabled FROM platform_users WHERE id = $1`,
        [input.platformUserId],
      );
      const user = result.rows[0];
      if (!user) {
        throw new NotFoundError('Usuário de plataforma não encontrado');
      }
      if (user.mfa_enabled) {
        throw new ConflictError('MFA já está ativo para este usuário');
      }
      if (!user.mfa_secret) {
        throw new NotFoundError('Cadastro de MFA não encontrado');
      }

      const decryptedSecret = resolvePlatformMfaSecret(user.mfa_secret);
      const verification = totpProvider.verifyCode(decryptedSecret, input.code);
      if (!verification.valid) {
        throw new ValidationError('Código de verificação inválido');
      }

      const storedSecret = isMfaSecretEncrypted(user.mfa_secret)
        ? user.mfa_secret
        : encryptMfaSecret(decryptedSecret);
      await client.query(
        `UPDATE platform_users SET mfa_secret = $2, mfa_enabled = true, updated_at = now() WHERE id = $1`,
        [input.platformUserId, storedSecret],
      );
      await recordPlatformAudit(client, input.platformUserId, 'MFA_ENABLED');
    },
  );
}

export interface ResolvedPlatformSession {
  platformUserId: string;
  role: PlatformUserRole;
  email: string;
  sessionId: string;
}

export async function resolvePlatformSessionByToken(
  platformDatabase: PlatformDatabaseRuntime,
  rawToken: string,
): Promise<ResolvedPlatformSession | null> {
  const tokenHash = hashOpaqueToken(rawToken);

  const resolved = await platformDatabase.withPublicLookupTransaction(
    'app.platform_session_lookup_hash',
    tokenHash,
    async (client) => {
      const sessionResult = await client.query<{
        id: string;
        platform_user_id: string;
        state: string;
        expires_at: string;
        invalidated_at: string | null;
      }>(
        `SELECT id, platform_user_id, state, expires_at, invalidated_at
         FROM platform_sessions WHERE session_token_hash = $1`,
        [tokenHash],
      );
      const session = sessionResult.rows[0];
      if (
        !session ||
        session.state !== 'ACTIVE' ||
        session.invalidated_at ||
        new Date(session.expires_at) < new Date()
      ) {
        return null;
      }

      const userResult = await client.query<{ email: string; role: PlatformUserRole; status: string }>(
        `SELECT email, role, status FROM platform_users WHERE id = $1`,
        [session.platform_user_id],
      );
      const user = userResult.rows[0];
      if (!user || user.status !== 'ACTIVE') {
        return null;
      }

      return {
        platformUserId: session.platform_user_id,
        role: user.role,
        email: user.email,
        sessionId: session.id,
      };
    },
  );

  return resolved;
}

export async function platformLogout(
  platformDatabase: PlatformDatabaseRuntime,
  rawToken: string,
): Promise<void> {
  const session = await resolvePlatformSessionByToken(platformDatabase, rawToken);
  if (!session) return;

  const tokenHash = hashOpaqueToken(rawToken);
  await platformDatabase.withPublicLookupTransaction('app.platform_session_lookup_hash', tokenHash, async (client) => {
    await client.query(
      `UPDATE platform_sessions SET invalidated_at = now(), revoked_reason = 'LOGOUT', updated_at = now()
       WHERE id = $1`,
      [session.sessionId],
    );
    await recordPlatformAudit(client, session.platformUserId, 'SESSION_REVOKED', { reasonCode: 'LOGOUT' });
  });
}

export async function setPlatformUserStatus(
  platformDatabase: PlatformDatabaseRuntime,
  targetPlatformUserId: string,
  status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED',
): Promise<void> {
  await platformDatabase.withPublicLookupTransaction(
    'app.platform_email_lookup',
    targetPlatformUserId,
    async (client) => {
      const result = await client.query(`UPDATE platform_users SET status = $2, updated_at = now() WHERE id = $1`, [
        targetPlatformUserId,
        status,
      ]);
      if ((result.rowCount ?? 0) === 0) {
        throw new NotFoundError('Usuário de plataforma não encontrado');
      }
      if (status !== 'ACTIVE') {
        await client.query(
          `UPDATE platform_sessions SET invalidated_at = now(), revoked_reason = $2, updated_at = now()
           WHERE platform_user_id = $1 AND invalidated_at IS NULL`,
          [targetPlatformUserId, `PLATFORM_USER_${status}`],
        );
        await recordPlatformAudit(client, targetPlatformUserId, 'SUSPENDED', { reasonCode: status });
      }
    },
  );
}

// ============================================================
// Recovery (098)
// ============================================================

async function findUnusedRecoveryCode(
  client: TenantTransactionClient,
  platformUserId: string,
  code: string,
): Promise<string | null> {
  const result = await client.query<{ id: string; code_hash: string }>(
    `SELECT id, code_hash FROM platform_mfa_recovery_codes WHERE platform_user_id = $1 AND used_at IS NULL`,
    [platformUserId],
  );
  const match = result.rows.find((row) => verifyRecoveryCode(code.trim(), row.code_hash));
  return match?.id ?? null;
}

async function countUnusedRecoveryCodes(client: TenantTransactionClient, platformUserId: string): Promise<number> {
  const result = await client.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM platform_mfa_recovery_codes WHERE platform_user_id = $1 AND used_at IS NULL`,
    [platformUserId],
  );
  return Number(result.rows[0]?.count ?? '0');
}

export interface PlatformMfaStatus {
  mfaEnabled: boolean;
  recoveryCodesRemaining: number;
}

export async function getPlatformMfaStatus(
  platformDatabase: PlatformDatabaseRuntime,
  platformUserId: string,
): Promise<PlatformMfaStatus> {
  return platformDatabase.withPublicLookupTransaction('app.platform_email_lookup', platformUserId, async (client) => {
    const result = await client.query<{ mfa_enabled: boolean }>(
      `SELECT mfa_enabled FROM platform_users WHERE id = $1`,
      [platformUserId],
    );
    const user = result.rows[0];
    if (!user) throw new NotFoundError('Usuário de plataforma não encontrado');
    return {
      mfaEnabled: user.mfa_enabled,
      recoveryCodesRemaining: user.mfa_enabled ? await countUnusedRecoveryCodes(client, platformUserId) : 0,
    };
  });
}

/**
 * Lost-authenticator recovery: with a fully authenticated session, the
 * current password AND a valid TOTP or unused recovery code, MFA is cleared
 * (secret + recovery codes) so it can be enrolled again. Every other
 * session of the user is revoked. No permanent bypass: without a second
 * factor (TOTP or recovery code) this never succeeds.
 */
export async function resetPlatformMfa(
  platformDatabase: PlatformDatabaseRuntime,
  input: { platformUserId: string; currentSessionToken: string; password: string; code: string },
): Promise<void> {
  const currentSessionHash = hashOpaqueToken(input.currentSessionToken);
  const outcome = await platformDatabase.withPublicLookupTransaction(
    'app.platform_email_lookup',
    input.platformUserId,
    async (client) => {
      const result = await client.query<PlatformUserRow>(
        `SELECT id, email, password_hash, role, mfa_enabled, mfa_secret, status FROM platform_users WHERE id = $1`,
        [input.platformUserId],
      );
      const user = result.rows[0];
      if (!user) throw new NotFoundError('Usuário de plataforma não encontrado');
      if (!user.mfa_enabled || !user.mfa_secret) throw new ConflictError('MFA não está ativo');

      const passwordOk = await verifyPassword(input.password, user.password_hash);
      const totpOk = totpProvider.verifyCode(resolvePlatformMfaSecret(user.mfa_secret), input.code).valid;
      const recoveryCodeId = totpOk ? null : await findUnusedRecoveryCode(client, user.id, input.code);
      if (!passwordOk || (!totpOk && !recoveryCodeId)) {
        return 'DENIED' as const;
      }

      await client.query(
        `UPDATE platform_users SET mfa_enabled = false, mfa_secret = NULL, updated_at = now() WHERE id = $1`,
        [user.id],
      );
      await client.query(`DELETE FROM platform_mfa_recovery_codes WHERE platform_user_id = $1`, [user.id]);
      await client.query(
        `UPDATE platform_sessions SET invalidated_at = now(), revoked_reason = 'MFA_RESET', updated_at = now()
         WHERE platform_user_id = $1 AND invalidated_at IS NULL AND session_token_hash <> $2`,
        [user.id, currentSessionHash],
      );
      await recordPlatformAudit(client, user.id, 'MFA_RESET', { secondFactor: totpOk ? 'TOTP' : 'RECOVERY_CODE' });
      return 'RESET' as const;
    },
  );

  if (outcome === 'DENIED') {
    await platformDatabase.withPublicLookupTransaction('app.platform_email_lookup', input.platformUserId, (client) =>
      recordPlatformAudit(client, input.platformUserId, 'MFA_RESET_FAILED'),
    );
    throw new UnauthorizedError('Senha ou código inválidos');
  }
}

/**
 * Always resolves without revealing whether the e-mail belongs to a platform
 * user. For an ACTIVE user, previous unused tokens are superseded, a new
 * single-use token (30 min) is stored as a SHA-256 hash and e-mailed.
 */
export async function platformForgotPassword(
  platformDatabase: PlatformDatabaseRuntime,
  email: string,
  ip: string,
): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  const issued = await platformDatabase.withPublicLookupTransaction(
    'app.platform_email_lookup',
    normalizedEmail,
    async (client) => {
      const result = await client.query<{ id: string; email: string; status: string }>(
        `SELECT id, email, status FROM platform_users WHERE lower(email) = $1`,
        [normalizedEmail],
      );
      const user = result.rows[0];
      if (!user || user.status !== 'ACTIVE') return null;

      await client.query(
        `UPDATE platform_password_reset_tokens SET used_at = now() WHERE platform_user_id = $1 AND used_at IS NULL`,
        [user.id],
      );
      const rawToken = generateOpaqueToken();
      await client.query(
        `INSERT INTO platform_password_reset_tokens (platform_user_id, token_hash, expires_at, requested_ip)
         VALUES ($1, $2, $3, $4)`,
        [user.id, hashOpaqueToken(rawToken), new Date(Date.now() + PASSWORD_RESET_TTL_MS), ip],
      );
      await recordPlatformAudit(client, user.id, 'PASSWORD_RESET_REQUESTED');
      return { to: user.email, token: rawToken };
    },
  );

  if (!issued) return;
  try {
    await sendPlatformPasswordResetEmail(issued);
  } catch {
    // Logged by the email module; the public response must stay generic.
  }
}

/**
 * Consumes a reset token (single use, not expired, user ACTIVE), sets the new
 * password and revokes every session of the user. MFA is left untouched: a
 * password reset alone never bypasses the second factor.
 */
export async function platformResetPassword(
  platformDatabase: PlatformDatabaseRuntime,
  rawToken: string,
  newPassword: string,
): Promise<void> {
  if (newPassword.length < MIN_PLATFORM_PASSWORD_LENGTH) {
    throw new ValidationError(`A senha deve ter pelo menos ${MIN_PLATFORM_PASSWORD_LENGTH} caracteres`);
  }
  const tokenHash = hashOpaqueToken(rawToken);
  const newHash = await hashPassword(newPassword);

  const consumed = await platformDatabase.withPublicLookupTransaction(
    'app.platform_reset_lookup_hash',
    tokenHash,
    async (client) => {
      const result = await client.query<{ platform_user_id: string }>(
        `UPDATE platform_password_reset_tokens t SET used_at = now()
         FROM platform_users u
         WHERE t.token_hash = $1 AND t.used_at IS NULL AND t.expires_at > now()
           AND u.id = t.platform_user_id AND u.status = 'ACTIVE'
         RETURNING t.platform_user_id`,
        [tokenHash],
      );
      const platformUserId = result.rows[0]?.platform_user_id;
      if (!platformUserId) return false;

      await client.query(`UPDATE platform_users SET password_hash = $2, updated_at = now() WHERE id = $1`, [
        platformUserId,
        newHash,
      ]);
      await client.query(
        `UPDATE platform_sessions SET invalidated_at = now(), revoked_reason = 'PASSWORD_RESET', updated_at = now()
         WHERE platform_user_id = $1 AND invalidated_at IS NULL`,
        [platformUserId],
      );
      await recordPlatformAudit(client, platformUserId, 'PASSWORD_RESET_COMPLETED');
      return true;
    },
  );

  if (!consumed) {
    throw new NotFoundError('Link de redefinição inválido ou expirado');
  }
}
