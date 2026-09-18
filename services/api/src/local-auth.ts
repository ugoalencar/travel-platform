/**
 * Local email+password authentication (Pilot Delivery Gap Closure --
 * Agent 02/Identity). Closes a real gap: no working login existed
 * anywhere in the product before this (see 061_local_password_auth.sql's
 * header for the full "why").
 *
 * Flow:
 *   POST /auth/login (agencySlug, email, password)
 *     -> FULLY_AUTHENTICATED (no MFA enrolled) -- session token returned
 *     -> MFA_REQUIRED (MFA enrolled) -- a session row is created in
 *        MFA_REQUIRED state; SessionAuthProvider rejects it on ordinary
 *        routes until verified.
 *   POST /auth/mfa/verify (sessionToken, code) -> FULLY_AUTHENTICATED
 *   POST /auth/forgot-password (agencySlug, email) -> always generic
 *   POST /auth/reset-password (token, newPassword) -> revokes all sessions
 *   POST /auth/logout -> revokes the current session
 *   GET  /auth/sessions / POST /auth/sessions/:id/revoke -> self-service
 *
 * Every credential-bearing lookup that must run before tenant context
 * exists uses the same session-local-GUC exact-match RLS pattern as
 * invitations/enrollment (never current_agency_id() IS NULL alone).
 */

import { randomBytes, createHash } from 'node:crypto';
import {
  getAgencyId,
  getUserId,
  runWithTenantContext,
  UnauthorizedError,
} from '../../../packages/domain/tenant-context';
import { UserRole } from '../../../packages/domain/types';
import type { DatabaseRuntime, PlatformDatabaseRuntime, TenantTransactionClient } from './database';
import { ConflictError, NotFoundError, ValidationError } from './errors';
import { hashPassword, unusablePasswordHash, verifyPassword } from './password-hashing';
import { sendStaffPasswordResetEmail } from './email';
import {
  createTotpProvider,
  hashRecoveryCode,
  verifyRecoveryCode,
  type TotpProvider,
} from './mfa-provider';
import { AuditEventType, recordAuditEvent } from './audit-log';

// ============================================================
// Session tokens
// ============================================================

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const MFA_CHALLENGE_TTL_MS = 10 * 60 * 1000; // 10min to complete MFA after primary auth

function generateOpaqueToken(): string {
  return randomBytes(32).toString('hex');
}

function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * withAgencyTransaction() sets tenant context at the SQL level
 * (set_tenant_context()) but not the ambient JS-side AsyncLocalStorage
 * context recordAuditEvent() reads via getTenantContext() -- that's only
 * ever established by runWithTenantContext() at the top of an
 * already-authenticated HTTP request. login/reset-password/etc. run
 * BEFORE any such request context exists (establishing it is the whole
 * point), so every recordAuditEvent() call in this module needs both
 * layers set up together. userRole/email are placeholders here --
 * recordAuditEvent() only ever reads agencyId/userId off the context.
 */
function withAgencyAudit<T>(
  platformDatabase: PlatformDatabaseRuntime,
  agencyId: string,
  actorUserId: string,
  operation: (client: TenantTransactionClient) => Promise<T>,
): Promise<T> {
  return runWithTenantContext(
    { agencyId, userId: actorUserId, userRole: UserRole.OWNER, email: '' },
    () => platformDatabase.withAgencyTransaction(agencyId, actorUserId, operation),
  );
}

// ============================================================
// Agency resolution (public, by slug)
// ============================================================

export async function resolveAgencyIdBySlug(
  platformDatabase: PlatformDatabaseRuntime,
  slug: string,
): Promise<{ agencyId: string; name: string } | null> {
  return platformDatabase.withPublicLookupTransaction(
    'app.agency_slug_lookup',
    slug,
    async (client) => {
      const result = await client.query<{ id: string; name: string }>(
        `SELECT id, name FROM agencies WHERE slug = $1`,
        [slug],
      );
      const row = result.rows[0];
      return row ? { agencyId: row.id, name: row.name } : null;
    },
  );
}

// ============================================================
// Login
// ============================================================

export interface LoginInput {
  agencySlug: string;
  email: string;
  password: string;
  ip: string;
  userAgent?: string;
}

export type LoginResult =
  | { state: 'MFA_REQUIRED'; sessionToken: string; expiresAt: Date }
  | {
      state: 'FULLY_AUTHENTICATED';
      sessionToken: string;
      expiresAt: Date;
      userId: string;
      agencyId: string;
      role: UserRole;
      email: string;
      mfaEnrollmentRecommended: boolean;
    };

interface UserAuthRow {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  password_hash: string;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
}

const GENERIC_LOGIN_ERROR = 'Email ou senha inválidos';

export async function login(
  platformDatabase: PlatformDatabaseRuntime,
  input: LoginInput,
): Promise<LoginResult> {
  const agency = await resolveAgencyIdBySlug(platformDatabase, input.agencySlug);
  if (!agency) {
    // Same generic message/timing path as "user not found" below --
    // never reveal whether the agency slug itself exists.
    await verifyPassword(input.password, unusablePasswordHash());
    throw new UnauthorizedError(GENERIC_LOGIN_ERROR);
  }

  const user = await withAgencyAudit(
    platformDatabase,
    agency.agencyId,
    'login-attempt',
    async (client) => {
      const result = await client.query<UserAuthRow>(
        `SELECT id, email, name, role, password_hash, status FROM users WHERE agency_id = $1 AND email = $2`,
        [agency.agencyId, input.email],
      );
      return result.rows[0] ?? null;
    },
  );

  const passwordOk = await verifyPassword(input.password, user?.password_hash ?? unusablePasswordHash());

  if (!user || !passwordOk || user.status !== 'ACTIVE') {
    if (user) {
      await withAgencyAudit(platformDatabase, agency.agencyId, user.id, async (client) => {
        await recordAuditEvent(client, {
          eventType: AuditEventType.AUTH_LOGIN_FAILED,
          entityType: 'user',
          entityId: user.id,
          outcome: 'FAILURE',
        });
      });
    }
    throw new UnauthorizedError(GENERIC_LOGIN_ERROR);
  }

  const mfaSecret = await withAgencyAudit(platformDatabase, agency.agencyId, user.id, (client) =>
    getActiveMfaSecret(client, user.id),
  );

  const rawToken = generateOpaqueToken();
  const tokenHash = hashOpaqueToken(rawToken);
  const now = Date.now();

  if (mfaSecret) {
    const expiresAt = new Date(now + MFA_CHALLENGE_TTL_MS);
    await withAgencyAudit(platformDatabase, agency.agencyId, user.id, async (client) => {
      await client.query(
        `INSERT INTO auth_sessions
           (agency_id, user_id, principal_type, auth_state, session_token_hash, expires_at)
         VALUES ($1, $2, 'STAFF', 'MFA_REQUIRED', $3, $4)`,
        [agency.agencyId, user.id, tokenHash, expiresAt],
      );
    });
    return { state: 'MFA_REQUIRED', sessionToken: rawToken, expiresAt };
  }

  const expiresAt = new Date(now + SESSION_TTL_MS);
  await withAgencyAudit(platformDatabase, agency.agencyId, user.id, async (client) => {
    await client.query(
      `INSERT INTO auth_sessions
         (agency_id, user_id, principal_type, auth_state, session_token_hash, expires_at)
       VALUES ($1, $2, 'STAFF', 'FULLY_AUTHENTICATED', $3, $4)`,
      [agency.agencyId, user.id, tokenHash, expiresAt],
    );
    await client.query('UPDATE users SET last_login_at = now() WHERE agency_id = $1 AND id = $2', [
      agency.agencyId,
      user.id,
    ]);
    await recordAuditEvent(client, {
      eventType: AuditEventType.AUTH_LOGIN_SUCCEEDED,
      entityType: 'user',
      entityId: user.id,
      outcome: 'SUCCESS',
    });
  });

  const mfaMandatory = await withAgencyAudit(platformDatabase, agency.agencyId, user.id, (client) =>
    isMfaRequiredForRole(client, agency.agencyId, user.role),
  );

  return {
    state: 'FULLY_AUTHENTICATED',
    sessionToken: rawToken,
    expiresAt,
    userId: user.id,
    agencyId: agency.agencyId,
    role: user.role,
    email: user.email,
    mfaEnrollmentRecommended: mfaMandatory,
  };
}

async function isMfaRequiredForRole(
  client: TenantTransactionClient,
  agencyId: string,
  role: UserRole,
): Promise<boolean> {
  const result = await client.query<{ required: boolean }>(
    `SELECT required FROM mfa_requirements WHERE agency_id = $1 AND role = $2`,
    [agencyId, role],
  );
  return result.rows[0]?.required ?? (role === UserRole.OWNER || role === UserRole.ADMIN);
}

interface MfaSecretRow {
  id: string;
  secret_encrypted: string;
  algorithm: 'SHA1' | 'SHA256' | 'SHA512';
  digits: number;
  period: number;
}

async function getActiveMfaSecret(
  client: TenantTransactionClient,
  userId: string,
): Promise<MfaSecretRow | null> {
  const result = await client.query<MfaSecretRow>(
    `SELECT id, secret_encrypted, algorithm, digits, period FROM mfa_totp_secrets
     WHERE user_id = $1 AND verified_at IS NOT NULL AND disabled_at IS NULL`,
    [userId],
  );
  return result.rows[0] ?? null;
}

// ============================================================
// MFA verify (completes login)
// ============================================================

export interface VerifyMfaInput {
  sessionToken: string;
  code: string;
  ip: string;
}

export async function verifyMfaAndCompleteLogin(
  platformDatabase: PlatformDatabaseRuntime,
  totpProvider: TotpProvider,
  input: VerifyMfaInput,
): Promise<{ sessionToken: string; expiresAt: Date; userId: string; agencyId: string; role: UserRole; email: string }> {
  const tokenHash = hashOpaqueToken(input.sessionToken);
  const session = await platformDatabase.withPublicLookupTransaction(
    'app.session_lookup_hash',
    tokenHash,
    async (client) => {
      const result = await client.query<{
        id: string;
        agency_id: string;
        user_id: string;
        auth_state: string;
        expires_at: string;
        invalidated_at: string | null;
      }>(
        `SELECT id, agency_id, user_id, auth_state, expires_at, invalidated_at
         FROM auth_sessions WHERE session_token_hash = $1`,
        [tokenHash],
      );
      return result.rows[0] ?? null;
    },
  );

  if (
    !session ||
    session.auth_state !== 'MFA_REQUIRED' ||
    session.invalidated_at ||
    new Date(session.expires_at) < new Date()
  ) {
    throw new UnauthorizedError('Desafio de MFA inválido ou expirado');
  }

  return withAgencyAudit(platformDatabase, session.agency_id, session.user_id, async (client) => {
    const secret = await getActiveMfaSecret(client, session.user_id);
    if (!secret) {
      throw new UnauthorizedError('MFA não configurado');
    }

    let verified = totpProvider.verifyCode(secret.secret_encrypted, input.code).valid;
    let usedRecoveryCodeId: string | null = null;

    if (!verified) {
      const recoveryResult = await client.query<{ id: string; code_hash: string }>(
        `SELECT id, code_hash FROM mfa_recovery_codes WHERE secret_id = $1 AND used_at IS NULL`,
        [secret.id],
      );
      for (const row of recoveryResult.rows) {
        if (verifyRecoveryCode(input.code, row.code_hash)) {
          verified = true;
          usedRecoveryCodeId = row.id;
          break;
        }
      }
    }

    await client.query(
      `INSERT INTO mfa_totp_attempts (agency_id, user_id, secret_id, outcome, ip_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [session.agency_id, session.user_id, secret.id, verified ? 'SUCCESS' : 'FAILURE', input.ip],
    );

    if (!verified) {
      await recordAuditEvent(client, {
        eventType: AuditEventType.MFA_CHALLENGE_FAILED,
        entityType: 'user',
        entityId: session.user_id,
        outcome: 'FAILURE',
      });
      throw new UnauthorizedError('Código de MFA inválido');
    }

    if (usedRecoveryCodeId) {
      await client.query(`UPDATE mfa_recovery_codes SET used_at = now() WHERE id = $1`, [
        usedRecoveryCodeId,
      ]);
      await recordAuditEvent(client, {
        eventType: AuditEventType.MFA_RECOVERY_CODE_USED,
        entityType: 'user',
        entityId: session.user_id,
        outcome: 'SUCCESS',
      });
    }

    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await client.query(
      `UPDATE auth_sessions SET auth_state = 'FULLY_AUTHENTICATED', expires_at = $2, updated_at = now()
       WHERE id = $1`,
      [session.id, expiresAt],
    );
    await client.query('UPDATE users SET last_login_at = now() WHERE agency_id = $1 AND id = $2', [
      session.agency_id,
      session.user_id,
    ]);

    const userResult = await client.query<{ email: string; role: UserRole }>(
      `SELECT email, role FROM users WHERE agency_id = $1 AND id = $2`,
      [session.agency_id, session.user_id],
    );
    const userRow = userResult.rows[0];
    if (!userRow) throw new NotFoundError('Usuário não encontrado');

    await recordAuditEvent(client, {
      eventType: AuditEventType.MFA_CHALLENGE_SUCCEEDED,
      entityType: 'user',
      entityId: session.user_id,
      outcome: 'SUCCESS',
    });
    await recordAuditEvent(client, {
      eventType: AuditEventType.AUTH_LOGIN_SUCCEEDED,
      entityType: 'user',
      entityId: session.user_id,
      outcome: 'SUCCESS',
    });

    return {
      sessionToken: input.sessionToken,
      expiresAt,
      userId: session.user_id,
      agencyId: session.agency_id,
      role: userRow.role,
      email: userRow.email,
    };
  });
}

// ============================================================
// Session resolution (used by SessionAuthProvider on every request)
// ============================================================

export interface ResolvedSession {
  userId: string;
  agencyId: string;
  role: UserRole;
  email: string;
  sessionId: string;
}

export async function resolveSessionByToken(
  platformDatabase: PlatformDatabaseRuntime,
  rawToken: string,
): Promise<ResolvedSession | null> {
  const tokenHash = hashOpaqueToken(rawToken);
  const session = await platformDatabase.withPublicLookupTransaction(
    'app.session_lookup_hash',
    tokenHash,
    async (client) => {
      const result = await client.query<{
        id: string;
        agency_id: string;
        user_id: string;
        auth_state: string;
        expires_at: string;
        invalidated_at: string | null;
      }>(
        `SELECT id, agency_id, user_id, auth_state, expires_at, invalidated_at
         FROM auth_sessions WHERE session_token_hash = $1`,
        [tokenHash],
      );
      return result.rows[0] ?? null;
    },
  );

  if (
    !session ||
    session.auth_state !== 'FULLY_AUTHENTICATED' ||
    session.invalidated_at ||
    new Date(session.expires_at) < new Date()
  ) {
    return null;
  }

  return withAgencyAudit(platformDatabase, session.agency_id, session.user_id, async (client) => {
    const result = await client.query<{ email: string; role: UserRole; status: string }>(
      `SELECT email, role, status FROM users WHERE agency_id = $1 AND id = $2`,
      [session.agency_id, session.user_id],
    );
    const row = result.rows[0];
    if (!row || row.status !== 'ACTIVE') {
      return null;
    }
    return {
      userId: session.user_id,
      agencyId: session.agency_id,
      role: row.role,
      email: row.email,
      sessionId: session.id,
    };
  });
}

// ============================================================
// Logout / session revocation
// ============================================================

export async function revokeSession(
  database: DatabaseRuntime,
  sessionId: string,
  reason: string,
): Promise<boolean> {
  return database.withTenantTransaction(async (client) => {
    const result = await client.query(
      `UPDATE auth_sessions SET invalidated_at = now(), revoked_reason = $3, updated_at = now()
       WHERE agency_id = $1 AND id = $2 AND invalidated_at IS NULL`,
      [getAgencyId(), sessionId, reason],
    );
    if ((result.rowCount ?? 0) > 0) {
      await recordAuditEvent(client, {
        eventType: AuditEventType.SESSION_REVOKED,
        entityType: 'auth_session',
        entityId: sessionId,
        metadata: { reasonCode: reason },
      });
      return true;
    }
    return false;
  });
}

export async function revokeAllSessionsForUser(
  client: TenantTransactionClient,
  agencyId: string,
  userId: string,
  reason: string,
): Promise<number> {
  const result = await client.query(
    `UPDATE auth_sessions SET invalidated_at = now(), revoked_reason = $3, updated_at = now()
     WHERE agency_id = $1 AND user_id = $2 AND invalidated_at IS NULL`,
    [agencyId, userId, reason],
  );
  if ((result.rowCount ?? 0) > 0) {
    await recordAuditEvent(client, {
      eventType: AuditEventType.SESSION_REVOKED,
      entityType: 'user',
      entityId: userId,
      metadata: { reasonCode: reason },
    });
  }
  return result.rowCount ?? 0;
}

export interface SessionSummary {
  id: string;
  createdAt: Date;
  expiresAt: Date;
  isCurrent: boolean;
}

export async function listMySessions(
  database: DatabaseRuntime,
  currentSessionId: string,
): Promise<SessionSummary[]> {
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<{ id: string; created_at: string; expires_at: string }>(
      `SELECT id, created_at, expires_at FROM auth_sessions
       WHERE agency_id = $1 AND user_id = $2 AND invalidated_at IS NULL AND expires_at > now()
       ORDER BY created_at DESC`,
      [getAgencyId(), getUserId()],
    );
    return result.rows.map((row) => ({
      id: row.id,
      createdAt: new Date(row.created_at),
      expiresAt: new Date(row.expires_at),
      isCurrent: row.id === currentSessionId,
    }));
  });
}

// ============================================================
// Forgot / reset password
// ============================================================

const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000; // 30 min

export async function forgotPassword(
  platformDatabase: PlatformDatabaseRuntime,
  agencySlug: string,
  email: string,
  ip: string,
): Promise<void> {
  const agency = await resolveAgencyIdBySlug(platformDatabase, agencySlug);
  if (!agency) {
    return; // generic: caller always sees the same success response
  }

  await withAgencyAudit(platformDatabase, agency.agencyId, 'forgot-password', async (client) => {
    const result = await client.query<{ id: string; status: string; email: string }>(
      `SELECT id, status, email FROM users WHERE agency_id = $1 AND email = $2`,
      [agency.agencyId, email],
    );
    const user = result.rows[0];
    if (!user || user.status !== 'ACTIVE') {
      return; // still generic -- no user-enumeration signal
    }

    const rawToken = generateOpaqueToken();
    const tokenHash = hashOpaqueToken(rawToken);
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);

    await client.query(
      `INSERT INTO password_reset_tokens (agency_id, user_id, token_hash, expires_at, requested_ip)
       VALUES ($1, $2, $3, $4, $5)`,
      [agency.agencyId, user.id, tokenHash, expiresAt, ip],
    );
    await recordAuditEvent(client, {
      eventType: AuditEventType.PASSWORD_RESET_REQUESTED,
      entityType: 'user',
      entityId: user.id,
    });

    const agencyNameResult = await client.query<{ name: string }>(
      `SELECT name FROM agencies WHERE id = $1`,
      [agency.agencyId],
    );

    // Send the real reset email -- but never let a delivery failure leak
    // through the HTTP response, which must stay generic regardless of
    // whether the account exists (anti-enumeration). A misconfigured/down
    // provider is still logged loudly inside sendStaffPasswordResetEmail
    // (fail-closed at the observability layer, not at the public response).
    try {
      await sendStaffPasswordResetEmail({
        to: user.email,
        token: rawToken,
        ...(agencyNameResult.rows[0]?.name ? { agencyName: agencyNameResult.rows[0].name } : {}),
      });
    } catch {
      // Already logged by the email module itself. Never rethrow here.
    }
  });
}

export async function resetPassword(
  platformDatabase: PlatformDatabaseRuntime,
  rawToken: string,
  newPassword: string,
): Promise<void> {
  const tokenHash = hashOpaqueToken(rawToken);

  const tokenInfo = await platformDatabase.withPublicLookupTransaction(
    'app.password_reset_lookup_hash',
    tokenHash,
    async (client) => {
      const result = await client.query<{
        id: string;
        agency_id: string;
        user_id: string;
        expires_at: string;
        used_at: string | null;
      }>(
        `SELECT id, agency_id, user_id, expires_at, used_at FROM password_reset_tokens
         WHERE token_hash = $1`,
        [tokenHash],
      );
      return result.rows[0] ?? null;
    },
  );

  if (!tokenInfo || tokenInfo.used_at || new Date(tokenInfo.expires_at) < new Date()) {
    throw new NotFoundError('Link de redefinição inválido ou expirado');
  }

  const newHash = await hashPassword(newPassword);

  await withAgencyAudit(platformDatabase, tokenInfo.agency_id, tokenInfo.user_id, async (client) => {
    // Mark the token used via the same public-lookup GUC scope it was
    // read under above (a fresh withAgencyTransaction call establishes
    // ordinary tenant context, which the public-token UPDATE policy does
    // NOT match -- so this update goes through the tenant policy instead,
    // which is exactly what we want now that agency_id is known).
    await client.query(`UPDATE password_reset_tokens SET used_at = now() WHERE id = $1`, [
      tokenInfo.id,
    ]);
    await client.query(`UPDATE users SET password_hash = $3, updated_at = now() WHERE agency_id = $1 AND id = $2`, [
      tokenInfo.agency_id,
      tokenInfo.user_id,
      newHash,
    ]);
    await revokeAllSessionsForUser(client, tokenInfo.agency_id, tokenInfo.user_id, 'PASSWORD_RESET');
    await recordAuditEvent(client, {
      eventType: AuditEventType.PASSWORD_RESET_COMPLETED,
      entityType: 'user',
      entityId: tokenInfo.user_id,
    });
  });
}

// ============================================================
// MFA enrollment
// ============================================================

export interface MfaEnrollmentStart {
  secretId: string;
  provisioningUri: string;
  recoveryCodes: string[];
}

export async function startMfaEnrollment(
  database: DatabaseRuntime,
  totpProvider: TotpProvider,
  accountEmail: string,
): Promise<MfaEnrollmentStart> {
  return database.withTenantTransaction(async (client) => {
    const existing = await getActiveMfaSecret(client, getUserId());
    if (existing) {
      throw new ConflictError('MFA já está ativo para este usuário');
    }

    const generated = totpProvider.generateSecret(accountEmail, 'Travel Platform');

    const result = await client.query<{ id: string }>(
      `INSERT INTO mfa_totp_secrets (agency_id, user_id, secret_encrypted)
       VALUES ($1, $2, $3) RETURNING id`,
      [getAgencyId(), getUserId(), generated.secret],
    );
    const secretId = result.rows[0]?.id;
    if (!secretId) throw new Error('MFA secret insert did not return an id');

    for (let i = 0; i < generated.recoveryCodesPlaintext.length; i++) {
      const code = generated.recoveryCodesPlaintext[i];
      if (!code) continue;
      await client.query(
        `INSERT INTO mfa_recovery_codes (agency_id, user_id, secret_id, code_hash, position)
         VALUES ($1, $2, $3, $4, $5)`,
        [getAgencyId(), getUserId(), secretId, hashRecoveryCode(code), i + 1],
      );
    }

    return {
      secretId,
      provisioningUri: generated.provisioningUri,
      recoveryCodes: generated.recoveryCodesPlaintext,
    };
  });
}

export async function confirmMfaEnrollment(
  database: DatabaseRuntime,
  totpProvider: TotpProvider,
  secretId: string,
  code: string,
): Promise<void> {
  await database.withTenantTransaction(async (client) => {
    const result = await client.query<{ secret_encrypted: string; verified_at: string | null }>(
      `SELECT secret_encrypted, verified_at FROM mfa_totp_secrets
       WHERE agency_id = $1 AND id = $2 AND user_id = $3 AND disabled_at IS NULL`,
      [getAgencyId(), secretId, getUserId()],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundError('Cadastro de MFA não encontrado');
    if (row.verified_at) throw new ConflictError('MFA já foi confirmado');

    const verification = totpProvider.verifyCode(row.secret_encrypted, code);
    if (!verification.valid) {
      throw new ValidationError('Código de verificação inválido');
    }

    await client.query(`UPDATE mfa_totp_secrets SET verified_at = now(), updated_at = now() WHERE id = $1`, [
      secretId,
    ]);
    await recordAuditEvent(client, {
      eventType: AuditEventType.MFA_ENROLLED,
      entityType: 'user',
      entityId: getUserId(),
    });
  });
}

export async function disableMfa(database: DatabaseRuntime, reason: string): Promise<void> {
  await database.withTenantTransaction(async (client) => {
    const secret = await getActiveMfaSecret(client, getUserId());
    if (!secret) throw new NotFoundError('MFA não está ativo');

    await client.query(`UPDATE mfa_totp_secrets SET disabled_at = now(), updated_at = now() WHERE id = $1`, [
      secret.id,
    ]);
    await recordAuditEvent(client, {
      eventType: AuditEventType.MFA_DISABLED,
      entityType: 'user',
      entityId: getUserId(),
      metadata: { reasonCode: reason },
    });
  });
}

// ============================================================
// User status (disable/suspend invalidates access)
// ============================================================

export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

export async function setUserStatus(
  database: DatabaseRuntime,
  targetUserId: string,
  status: UserStatus,
  reason: string,
): Promise<void> {
  await database.withTenantTransaction(async (client) => {
    const result = await client.query(
      `UPDATE users SET status = $3, updated_at = now() WHERE agency_id = $1 AND id = $2`,
      [getAgencyId(), targetUserId, status],
    );
    if ((result.rowCount ?? 0) === 0) {
      throw new NotFoundError('Usuário não encontrado');
    }
    if (status !== 'ACTIVE') {
      await revokeAllSessionsForUser(client, getAgencyId(), targetUserId, reason);
    }
  });
}

export function createTotpProviderFromEnv(env: Record<string, string | undefined> = process.env): TotpProvider {
  return createTotpProvider(env);
}
