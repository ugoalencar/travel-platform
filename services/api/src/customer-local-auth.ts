/**
 * Local email+password authentication for Customer Portal accounts
 * (Frontend Auth & Session track, decided 2026-09-14).
 *
 * Mirrors local-auth.ts's staff flow exactly (same session mechanism --
 * opaque Bearer token hashed in auth_sessions, same public-lookup-GUC
 * pattern, same generic-failure/no-enumeration posture, same
 * LoginAbuseProtector-compatible shape) against customer_accounts
 * instead of users. No MFA -- not required for customers by any spec in
 * this pack; the customer_accounts schema has no MFA columns either.
 *
 * Sessions live in customer_sessions (062_customer_platform_local_auth.sql),
 * not auth_sessions -- auth_sessions.user_id FKs to users(id), which a
 * customer_accounts row can never satisfy.
 */

import { randomBytes, createHash } from 'node:crypto';
import { runWithTenantContext, UnauthorizedError } from '../../../packages/domain/tenant-context';
import { UserRole } from '../../../packages/domain/types';
import type { PlatformDatabaseRuntime, TenantTransactionClient } from './database';
import { NotFoundError } from './errors';
import { hashPassword, unusablePasswordHash, verifyPassword } from './password-hashing';
import { AuditEventType, recordAuditEvent } from './audit-log';
import { resolveAgencyIdBySlug } from './local-auth';
import { sendCustomerPasswordResetEmail } from './email';

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000; // 30 min

function generateOpaqueToken(): string {
  return randomBytes(32).toString('hex');
}

function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Same rationale as local-auth.ts's withAgencyAudit(): recordAuditEvent()
 * reads ambient AsyncLocalStorage context that withAgencyTransaction()'s
 * SQL-level tenant context alone never establishes. */
function withAgencyAudit<T>(
  platformDatabase: PlatformDatabaseRuntime,
  agencyId: string,
  actorLabel: string,
  operation: (client: TenantTransactionClient) => Promise<T>,
): Promise<T> {
  return runWithTenantContext(
    { agencyId, userId: actorLabel, userRole: UserRole.VIEWER, email: '' },
    () => platformDatabase.withAgencyTransaction(agencyId, actorLabel, operation),
  );
}

export interface CustomerLoginInput {
  agencySlug: string;
  email: string;
  password: string;
  ip: string;
}

export interface CustomerLoginResult {
  sessionToken: string;
  expiresAt: Date;
  agencyId: string;
  customerId: string;
  email: string;
}

interface CustomerAccountRow {
  id: string;
  customer_id: string;
  email: string;
  password_hash: string;
  status: 'ACTIVE' | 'INACTIVE' | 'LOCKED';
}

const GENERIC_LOGIN_ERROR = 'Email ou senha inválidos';

export async function customerLogin(
  platformDatabase: PlatformDatabaseRuntime,
  input: CustomerLoginInput,
): Promise<CustomerLoginResult> {
  const agency = await resolveAgencyIdBySlug(platformDatabase, input.agencySlug);
  if (!agency) {
    await verifyPassword(input.password, unusablePasswordHash());
    throw new UnauthorizedError(GENERIC_LOGIN_ERROR);
  }

  const account = await withAgencyAudit(
    platformDatabase,
    agency.agencyId,
    'customer-login-attempt',
    async (client) => {
      const result = await client.query<CustomerAccountRow>(
        `SELECT id, customer_id, email, password_hash, status FROM customer_accounts
         WHERE agency_id = $1 AND email = $2`,
        [agency.agencyId, input.email],
      );
      return result.rows[0] ?? null;
    },
  );

  const passwordOk = await verifyPassword(input.password, account?.password_hash ?? unusablePasswordHash());

  if (!account || !passwordOk || account.status !== 'ACTIVE') {
    if (account) {
      await withAgencyAudit(platformDatabase, agency.agencyId, account.customer_id, async (client) => {
        await recordAuditEvent(client, {
          eventType: AuditEventType.AUTH_LOGIN_FAILED,
          entityType: 'customer_account',
          entityId: account.id,
          outcome: 'FAILURE',
        });
      });
    }
    throw new UnauthorizedError(GENERIC_LOGIN_ERROR);
  }

  const rawToken = generateOpaqueToken();
  const tokenHash = hashOpaqueToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await withAgencyAudit(platformDatabase, agency.agencyId, account.customer_id, async (client) => {
    await client.query(
      `INSERT INTO customer_sessions
         (agency_id, customer_account_id, session_token_hash, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [agency.agencyId, account.id, tokenHash, expiresAt],
    );
    await client.query(`UPDATE customer_accounts SET last_login_at = now() WHERE id = $1`, [account.id]);
    await recordAuditEvent(client, {
      eventType: AuditEventType.AUTH_LOGIN_SUCCEEDED,
      entityType: 'customer_account',
      entityId: account.id,
      outcome: 'SUCCESS',
    });
  });

  return {
    sessionToken: rawToken,
    expiresAt,
    agencyId: agency.agencyId,
    customerId: account.customer_id,
    email: account.email,
  };
}

export interface ResolvedCustomerSession {
  agencyId: string;
  customerId: string;
  sessionId: string;
}

export async function resolveCustomerSessionByToken(
  platformDatabase: PlatformDatabaseRuntime,
  rawToken: string,
): Promise<ResolvedCustomerSession | null> {
  const tokenHash = hashOpaqueToken(rawToken);
  const session = await platformDatabase.withPublicLookupTransaction(
    'app.session_lookup_hash',
    tokenHash,
    async (client) => {
      const result = await client.query<{
        id: string;
        agency_id: string;
        customer_account_id: string;
        expires_at: string;
        invalidated_at: string | null;
      }>(
        `SELECT id, agency_id, customer_account_id, expires_at, invalidated_at
         FROM customer_sessions WHERE session_token_hash = $1`,
        [tokenHash],
      );
      return result.rows[0] ?? null;
    },
  );

  if (!session || session.invalidated_at || new Date(session.expires_at) < new Date()) {
    return null;
  }

  return withAgencyAudit(platformDatabase, session.agency_id, session.customer_account_id, async (client) => {
    const result = await client.query<{ customer_id: string; status: string }>(
      `SELECT customer_id, status FROM customer_accounts WHERE agency_id = $1 AND id = $2`,
      [session.agency_id, session.customer_account_id],
    );
    const row = result.rows[0];
    if (!row || row.status !== 'ACTIVE') {
      return null;
    }
    return { agencyId: session.agency_id, customerId: row.customer_id, sessionId: session.id };
  });
}

export async function customerLogout(
  platformDatabase: PlatformDatabaseRuntime,
  rawToken: string,
): Promise<void> {
  const session = await resolveCustomerSessionByToken(platformDatabase, rawToken);
  if (!session) return;

  await withAgencyAudit(platformDatabase, session.agencyId, session.customerId, async (client) => {
    await client.query(
      `UPDATE customer_sessions SET invalidated_at = now(), revoked_reason = 'LOGOUT', updated_at = now()
       WHERE id = $1`,
      [session.sessionId],
    );
    await recordAuditEvent(client, {
      eventType: AuditEventType.SESSION_REVOKED,
      entityType: 'auth_session',
      entityId: session.sessionId,
      metadata: { reasonCode: 'LOGOUT' },
    });
  });
}

// ============================================================
// Forgot / reset password (same token mechanism as staff, scoped to
// customer_accounts). Reuses password_reset_tokens -- its FK targets
// (agency_id, user_id) -> users(agency_id, id), which customer accounts
// don't satisfy, so a customer reset token is tracked in its own table.
// ============================================================

export async function customerForgotPassword(
  platformDatabase: PlatformDatabaseRuntime,
  agencySlug: string,
  email: string,
  ip: string,
): Promise<void> {
  const agency = await resolveAgencyIdBySlug(platformDatabase, agencySlug);
  if (!agency) return;

  await withAgencyAudit(platformDatabase, agency.agencyId, 'customer-forgot-password', async (client) => {
    const result = await client.query<{ id: string; customer_id: string; status: string; email: string }>(
      `SELECT id, customer_id, status, email FROM customer_accounts WHERE agency_id = $1 AND email = $2`,
      [agency.agencyId, email],
    );
    const account = result.rows[0];
    if (!account || account.status !== 'ACTIVE') return;

    const rawToken = generateOpaqueToken();
    const tokenHash = hashOpaqueToken(rawToken);
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);

    await client.query(
      `INSERT INTO customer_password_reset_tokens (agency_id, customer_account_id, token_hash, expires_at, requested_ip)
       VALUES ($1, $2, $3, $4, $5)`,
      [agency.agencyId, account.id, tokenHash, expiresAt, ip],
    );
    await recordAuditEvent(client, {
      eventType: AuditEventType.PASSWORD_RESET_REQUESTED,
      entityType: 'customer_account',
      entityId: account.id,
    });

    const agencyNameResult = await client.query<{ name: string }>(
      `SELECT name FROM agencies WHERE id = $1`,
      [agency.agencyId],
    );

    // Same posture as the staff flow: never let a delivery failure leak
    // through the generic HTTP response (anti-enumeration). The email
    // module itself logs failures loudly.
    try {
      await sendCustomerPasswordResetEmail({
        to: account.email,
        token: rawToken,
        ...(agencyNameResult.rows[0]?.name ? { agencyName: agencyNameResult.rows[0].name } : {}),
      });
    } catch {
      // Already logged. Never rethrow here.
    }
  });
}

export async function customerResetPassword(
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
        customer_account_id: string;
        expires_at: string;
        used_at: string | null;
      }>(
        `SELECT id, agency_id, customer_account_id, expires_at, used_at
         FROM customer_password_reset_tokens WHERE token_hash = $1`,
        [tokenHash],
      );
      return result.rows[0] ?? null;
    },
  );

  if (!tokenInfo || tokenInfo.used_at || new Date(tokenInfo.expires_at) < new Date()) {
    throw new NotFoundError('Link de redefinição inválido ou expirado');
  }

  const newHash = await hashPassword(newPassword);

  await withAgencyAudit(
    platformDatabase,
    tokenInfo.agency_id,
    tokenInfo.customer_account_id,
    async (client) => {
      await client.query(`UPDATE customer_password_reset_tokens SET used_at = now() WHERE id = $1`, [
        tokenInfo.id,
      ]);
      await client.query(
        `UPDATE customer_accounts SET password_hash = $2, updated_at = now()
         WHERE agency_id = $1 AND id = $3`,
        [tokenInfo.agency_id, newHash, tokenInfo.customer_account_id],
      );
      await client.query(
        `UPDATE customer_sessions SET invalidated_at = now(), revoked_reason = 'PASSWORD_RESET', updated_at = now()
         WHERE agency_id = $1 AND customer_account_id = $2 AND invalidated_at IS NULL`,
        [tokenInfo.agency_id, tokenInfo.customer_account_id],
      );
      await recordAuditEvent(client, {
        eventType: AuditEventType.PASSWORD_RESET_COMPLETED,
        entityType: 'customer_account',
        entityId: tokenInfo.customer_account_id,
      });
    },
  );
}
