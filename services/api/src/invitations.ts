// Teams / Memberships / Invitations (Agent 01 SaaS Admin).
//
// Security posture (mirrors services/api/src/enrollment.ts's
// resolvePublicEnrollmentToken/submitEnrollment pattern -- see
// security/NON_NEGOTIABLES.md "Tokens publicos"):
//   * high-entropy token: crypto.randomBytes(32), never Math.random().
//   * only the sha256 hash of the token is ever persisted -- the raw
//     token is returned to the caller exactly once, at creation time.
//   * expiry + revocation both fail closed.
//   * the public resolve/accept path never lets the caller choose or
//     leak which tenant a token belongs to: it resolves ONLY via the
//     hash, and invalid/expired/revoked/unknown/already-accepted tokens
//     all produce the exact same generic rejection.
//
// RBAC for granting a role via invitation: the inviter can never invite
// someone at a role higher than their own (an ADMIN cannot invite an
// OWNER; a MANAGER cannot invite an ADMIN or OWNER), enforced in
// createInvitation() in addition to the route-level requireRole() floor.
import { createHash, randomBytes } from 'node:crypto';
import { hashPassword } from './password-hashing';
import {
  getAgencyId,
  getUserId,
  requireRole,
  runWithTenantContext,
} from '../../../packages/domain/tenant-context';
import type { TenantContext } from '../../../packages/domain/types';
import { UserRole } from '../../../packages/domain/types';
import type { DatabaseRuntime } from './database';
import { ConflictError, NotFoundError, ValidationError } from './errors';
import { AuditEventType, recordAuditEvent } from './audit-log';

export const DEFAULT_INVITATION_TTL_DAYS = 7;

const ROLE_RANK: Record<UserRole, number> = {
  [UserRole.OWNER]: 100,
  [UserRole.ADMIN]: 80,
  [UserRole.MANAGER]: 60,
  [UserRole.AGENT]: 40,
  [UserRole.VIEWER]: 20,
};

function publicInvitationContext(agencyId: string, invitationId: string): TenantContext {
  return {
    agencyId,
    userId: `invitation:${invitationId}`,
    userRole: UserRole.VIEWER,
    email: '',
  };
}

export function generateInvitationToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashInvitationToken(token) };
}

export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';

export interface Invitation {
  id: string;
  agencyId: string;
  email: string;
  role: UserRole;
  status: InvitationStatus;
  invitedByUserId: string;
  expiresAt: Date;
  acceptedAt?: Date;
  revokedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface InvitationRow {
  id: string;
  agency_id: string;
  email: string;
  role: UserRole;
  status: InvitationStatus;
  invited_by_user_id: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
}

const INVITATION_COLUMNS = `id, agency_id, email, role, status, invited_by_user_id,
  expires_at, accepted_at, revoked_at, created_at, updated_at`;

function toInvitation(row: InvitationRow): Invitation {
  return {
    id: row.id,
    agencyId: row.agency_id,
    email: row.email,
    role: row.role,
    status: row.status,
    invitedByUserId: row.invited_by_user_id,
    expiresAt: new Date(row.expires_at),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(row.accepted_at !== null ? { acceptedAt: new Date(row.accepted_at) } : {}),
    ...(row.revoked_at !== null ? { revokedAt: new Date(row.revoked_at) } : {}),
  };
}

// ============================================================
// Staff: create / list / revoke
// ============================================================
export interface CreateInvitationInput {
  email: string;
  role: UserRole;
  ttlDays?: number;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function createInvitation(
  database: DatabaseRuntime,
  inviterRole: UserRole,
  input: CreateInvitationInput,
): Promise<{ invitation: Invitation; token: string }> {
  requireRole(UserRole.ADMIN);
  const agencyId = getAgencyId();
  const invitedByUserId = getUserId();

  const email = input.email?.trim().toLowerCase();
  if (!email || !EMAIL_PATTERN.test(email)) {
    throw new ValidationError('email inválido');
  }
  if (!Object.values(UserRole).includes(input.role)) {
    throw new ValidationError('role inválida');
  }

  // An inviter can never grant a role above their own -- an ADMIN cannot
  // invite an OWNER. Base RBAC (requireRole(ADMIN) above) already keeps
  // MANAGER/AGENT/VIEWER from calling this at all.
  if ((ROLE_RANK[input.role] ?? 0) > (ROLE_RANK[inviterRole] ?? 0)) {
    throw new ValidationError('Não é possível convidar para um papel acima do seu próprio');
  }

  const ttlDays = normalizeTtlDays(input.ttlDays);
  const { token, tokenHash } = generateInvitationToken();

  const invitation = await database.withTenantTransaction(async (client) => {
    const existingActive = await client.query<{ id: string }>(
      `SELECT id FROM users WHERE agency_id = $1 AND lower(email) = $2`,
      [agencyId, email],
    );
    if (existingActive.rows.length > 0) {
      throw new ConflictError('Já existe um membro ativo com este e-mail nesta agência');
    }

    let result;
    try {
      result = await client.query<InvitationRow>(
        `INSERT INTO invitations (agency_id, email, role, token_hash, invited_by_user_id, expires_at)
         VALUES ($1, $2, $3, $4, $5, now() + ($6 || ' days')::interval)
         RETURNING ${INVITATION_COLUMNS}`,
        [agencyId, email, input.role, tokenHash, invitedByUserId, ttlDays],
      );
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        throw new ConflictError('Já existe um convite pendente para este e-mail');
      }
      throw error;
    }

    const row = result.rows[0];
    if (!row) {
      throw new Error('Invitation insert did not return a row');
    }
    const created = toInvitation(row);
    await recordAuditEvent(client, {
      eventType: AuditEventType.INVITATION_SENT,
      entityType: 'invitation',
      entityId: created.id,
      metadata: { role: created.role },
    });
    return created;
  });

  return { invitation, token };
}

export async function listInvitations(database: DatabaseRuntime): Promise<Invitation[]> {
  requireRole(UserRole.ADMIN);
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<InvitationRow>(
      `SELECT ${INVITATION_COLUMNS} FROM invitations WHERE agency_id = $1 ORDER BY created_at DESC`,
      [agencyId],
    );
    return result.rows.map(toInvitation);
  });
}

export async function revokeInvitation(
  database: DatabaseRuntime,
  id: string,
): Promise<Invitation | null> {
  requireRole(UserRole.ADMIN);
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<InvitationRow>(
      `UPDATE invitations
       SET status = 'REVOKED', revoked_at = now(), revoked_by_user_id = $3, updated_at = now()
       WHERE agency_id = $1 AND id = $2 AND status = 'PENDING'
       RETURNING ${INVITATION_COLUMNS}`,
      [agencyId, id, getUserId()],
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }
    const revoked = toInvitation(row);
    await recordAuditEvent(client, {
      eventType: AuditEventType.INVITATION_REVOKED,
      entityType: 'invitation',
      entityId: revoked.id,
    });
    return revoked;
  });
}

// ============================================================
// Public: resolve token / accept (no staff auth -- token-only)
// ============================================================
export interface PublicInvitationInfo {
  agencyId: string;
  invitationId: string;
  email: string;
  role: UserRole;
}

// Resolves ONLY by the token hash. Every failure mode (missing,
// unknown, expired, revoked, already-accepted token) maps to the same
// null result / generic rejection so a caller cannot distinguish them.
export async function resolvePublicInvitationToken(
  database: DatabaseRuntime,
  rawToken: string,
): Promise<PublicInvitationInfo | null> {
  if (typeof rawToken !== 'string' || rawToken.trim().length === 0) {
    return null;
  }

  const tokenHash = hashInvitationToken(rawToken);

  return database.withPlatformTransaction(async (client) => {
    await client.query(`SELECT set_config('app.invitation_lookup_hash', $1, true)`, [tokenHash]);

    const result = await client.query<InvitationRow>(
      `SELECT ${INVITATION_COLUMNS} FROM invitations WHERE token_hash = $1`,
      [tokenHash],
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }
    if (row.status !== 'PENDING') {
      return null;
    }
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      return null;
    }

    return { agencyId: row.agency_id, invitationId: row.id, email: row.email, role: row.role };
  });
}

export interface AcceptInvitationInput {
  name: string;
  password: string;
}

export interface AcceptedInvitationResult {
  userId: string;
  agencyId: string;
  email: string;
  role: UserRole;
}

export async function acceptInvitation(
  database: DatabaseRuntime,
  invitationInfo: PublicInvitationInfo,
  rawToken: string,
  input: AcceptInvitationInput,
): Promise<AcceptedInvitationResult> {
  const name = input.name?.trim();
  if (!name) {
    throw new ValidationError('Nome é obrigatório');
  }
  if (!input.password || input.password.length < 8) {
    throw new ValidationError('Senha deve ter ao menos 8 caracteres');
  }

  const tokenHash = hashInvitationToken(rawToken);
  // Hashed outside the transaction: scrypt is deliberately CPU-heavy, and
  // holding a DB connection for that long would be wasteful.
  const passwordHash = await hashPassword(input.password);

  return database.withPlatformTransaction(async (client) => {
    await client.query(`SELECT set_config('app.invitation_lookup_hash', $1, true)`, [tokenHash]);

    const invitationResult = await client.query<InvitationRow>(
      `SELECT ${INVITATION_COLUMNS} FROM invitations
       WHERE id = $1 AND agency_id = $2 AND token_hash = $3
         AND status = 'PENDING' AND expires_at > now()`,
      [invitationInfo.invitationId, invitationInfo.agencyId, tokenHash],
    );
    const invitationRow = invitationResult.rows[0];
    if (!invitationRow) {
      // Same generic failure as an unknown token -- no "it expired
      // between resolve and accept" detail leaked.
      throw new NotFoundError('Convite inválido');
    }

    // Token is now authoritatively resolved to exactly this agency --
    // switch into the ordinary tenant RLS scope for the write, same as
    // every staff-authenticated request.
    await client.query('SELECT set_tenant_context($1, $2)', [
      invitationInfo.agencyId,
      `invitation:${invitationInfo.invitationId}`,
    ]);

    let userResult;
    try {
      userResult = await client.query<{ id: string }>(
        `INSERT INTO users (agency_id, email, name, role, password_hash, status)
         VALUES ($1, $2, $3, $4, $5, 'ACTIVE')
         RETURNING id`,
        [
          invitationInfo.agencyId,
          invitationRow.email,
          name,
          invitationRow.role,
          passwordHash,
        ],
      );
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        throw new ConflictError('Já existe um usuário com este e-mail nesta agência');
      }
      throw error;
    }

    const userRow = userResult.rows[0];
    if (!userRow) {
      throw new Error('User insert did not return a row');
    }

    await client.query(
      `UPDATE invitations
       SET status = 'ACCEPTED', accepted_at = now(), accepted_user_id = $2, updated_at = now()
       WHERE id = $1`,
      [invitationInfo.invitationId, userRow.id],
    );

    await runWithTenantContext(
      publicInvitationContext(invitationInfo.agencyId, invitationInfo.invitationId),
      () =>
        recordAuditEvent(client, {
          eventType: AuditEventType.INVITATION_ACCEPTED,
          entityType: 'invitation',
          entityId: invitationInfo.invitationId,
          metadata: { userId: userRow.id, role: invitationRow.role },
        }),
    );

    return {
      userId: userRow.id,
      agencyId: invitationInfo.agencyId,
      email: invitationRow.email,
      role: invitationRow.role,
    };
  });
}

function normalizeTtlDays(input: number | undefined): number {
  if (input === undefined) {
    return DEFAULT_INVITATION_TTL_DAYS;
  }
  if (!Number.isFinite(input) || input < 1 || input > 60) {
    throw new ValidationError('ttlDays deve estar entre 1 e 60');
  }
  return Math.floor(input);
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}
