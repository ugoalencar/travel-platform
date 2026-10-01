import { createHash, randomBytes } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import type { LiteDatabase, TenantClient } from './database';
import { UnauthorizedError } from './errors';
import { loadAccess } from './access';
import type { TenantPrincipal } from './tenant-context';

declare module 'fastify' {
  interface FastifyRequest {
    liteAuth?: TenantPrincipal;
  }
}

export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// v1.<tenantId>.<userId>.<32-byte secret hex> — the tenant/user prefix is a
// claim only; it is never trusted until the hashed token matches a live row
// inside that tenant's RLS context.
const TOKEN_RE = /^v1\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([0-9a-f]{64})$/i;

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateSessionToken(tenantId: string, userId: string): string {
  return `v1.${tenantId}.${userId}.${randomBytes(32).toString('hex')}`;
}

export function parseSessionToken(token: string): { tenantId: string; userId: string } | null {
  const match = TOKEN_RE.exec(token);
  if (!match) return null;
  const [, tenantId, userId] = match;
  if (!tenantId || !userId || !UUID_RE.test(tenantId) || !UUID_RE.test(userId)) return null;
  return { tenantId, userId };
}

interface SessionRow {
  session_id: string;
  expires_at: string;
  revoked_at: string | null;
  role: string;
  email: string;
  status: string;
}

async function loadSession(
  client: TenantClient,
  tokenHash: string,
  tenantId: string,
  userId: string,
): Promise<TenantPrincipal | null> {
  const result = await client.query<SessionRow>(
    `SELECT s.id AS session_id, s.expires_at, s.revoked_at,
            u.role, u.email, u.status
       FROM auth_sessions s
       JOIN users u ON u.tenant_id = s.tenant_id AND u.id = s.user_id
      WHERE s.token_hash = $1
        AND s.tenant_id = $2
        AND s.user_id = $3`,
    [tokenHash, tenantId, userId],
  );
  const row = result.rows[0];
  if (!row) return null;
  if (row.revoked_at !== null) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) return null;
  if (row.status !== 'ACTIVE') return null;
  const access = await loadAccess(client, tenantId, userId, row.role);
  if (!access) return null;
  return { tenantId, userId, sessionId: row.session_id, email: row.email, ...access };
}

/**
 * Bearer authentication: verifies the opaque session token inside the
 * tenant's RLS context and attaches request.liteAuth. Any failure is the same
 * 401 (no oracle for expired vs invalid vs foreign token).
 */
export function createAuthenticateHook(database: LiteDatabase) {
  return async function authenticate(request: FastifyRequest): Promise<void> {
    const header = request.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedError();
    }
    const token = header.slice('Bearer '.length).trim();
    const parsed = parseSessionToken(token);
    if (!parsed) {
      throw new UnauthorizedError();
    }

    const principal = await database.runAsTenant(parsed.tenantId, parsed.userId, (client) =>
      loadSession(client, hashToken(token), parsed.tenantId, parsed.userId),
    );
    if (!principal) {
      throw new UnauthorizedError();
    }
    request.liteAuth = principal;
  };
}

export interface CreatedSession {
  token: string;
  sessionId: string;
  expiresAt: Date;
}

export async function createSession(
  database: LiteDatabase,
  tenantId: string,
  userId: string,
): Promise<CreatedSession> {
  const token = generateSessionToken(tenantId, userId);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  const sessionId = await database.runAsTenant(tenantId, userId, async (client) => {
    const result = await client.query<{ id: string }>(
      `INSERT INTO auth_sessions (tenant_id, user_id, token_hash, expires_at)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [tenantId, userId, hashToken(token), expiresAt.toISOString()],
    );
    return result.rows[0]!.id;
  });

  return { token, sessionId, expiresAt };
}

export async function revokeSession(database: LiteDatabase, principal: TenantPrincipal): Promise<void> {
  await database.runAsTenant(principal.tenantId, principal.userId, async (client) => {
    await client.query(
      `UPDATE auth_sessions SET revoked_at = now()
        WHERE id = $1 AND tenant_id = $2 AND user_id = $3 AND revoked_at IS NULL`,
      [principal.sessionId, principal.tenantId, principal.userId],
    );
  });
}
