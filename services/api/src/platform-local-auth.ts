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
 * Sessions live in platform_sessions (062_customer_platform_local_auth.sql),
 * not auth_sessions -- that table is agency_id NOT NULL and RLS-protected,
 * neither of which fits a principal with no agency at all.
 */

import { randomBytes, createHash } from 'node:crypto';
import { UnauthorizedError } from '../../../packages/domain/tenant-context';
import type { PlatformUserRole } from '../../../packages/domain/types';
import type { PlatformDatabaseRuntime, TenantTransactionClient } from './database';
import { ConflictError, NotFoundError, ValidationError } from './errors';
import { unusablePasswordHash, verifyPassword } from './password-hashing';
import { createTotpProvider } from './mfa-provider';
import { decryptMfaSecret, encryptMfaSecret, isMfaSecretEncrypted } from './mfa-encryption';

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h -- shorter than staff/customer (24h): platform admin holds cross-tenant power
const MFA_CHALLENGE_TTL_MS = 10 * 60 * 1000;

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

  return platformDatabase.withPublicLookupTransaction(
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
      if (!verification.valid) {
        await recordPlatformAudit(client, user.id, 'MFA_CHALLENGE_FAILED');
        throw new UnauthorizedError('Código de MFA inválido');
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
        sessionToken: input.sessionToken,
        expiresAt,
        platformUserId: user.id,
        email: user.email,
        role: user.role,
      };
    },
  );
}

// ============================================================
// MFA enrollment (F-07)
// ============================================================

export interface PlatformMfaEnrollmentStart {
  provisioningUri: string;
}

/**
 * Stage a new TOTP secret for the authenticated platform admin. The
 * secret is written encrypted with mfa_enabled=false until confirmed, so
 * a staged (or interrupted) enrollment never forces MFA at login. The
 * raw secret is exposed exactly once, inside the otpauth:// URI used to
 * provision the authenticator app -- no recovery codes exist for
 * platform_users (break-glass/support handles lockout, see file header).
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
      await recordPlatformAudit(client, input.platformUserId, 'MFA_ENROLL_STARTED');

      return { provisioningUri: generated.provisioningUri };
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
