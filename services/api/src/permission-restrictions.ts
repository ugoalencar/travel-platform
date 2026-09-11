// PermissionRestriction (Agent 01 SaaS Admin).
//
// Additive-only, tenant-scoped narrowing of what a role may do WITHIN
// THAT TENANT. This is layered ON TOP OF requireRole() -- never a
// replacement for it -- and can only take permissions away, never grant
// permissions the base RBAC hierarchy (OWNER>ADMIN>MANAGER>AGENT>VIEWER)
// would not already allow. See governance/AUTONOMY.md and
// security/NON_NEGOTIABLES.md: RBAC base meanings must never change.
//
// Guardrails enforced here (not just at the DB layer):
//   * OWNER and ADMIN can never be restricted -- prevents a tenant from
//     locking itself out of its own agency (self-lockout). Enforced by
//     both the CHECK constraint on permission_restrictions.role and the
//     assertion in createPermissionRestriction() below.
//   * assertNotRestricted() is called AFTER requireRole() at each route
//     boundary that opts in -- it can only reject a request that RBAC
//     already would have allowed; it can never let through a request
//     RBAC denies (there is no bypass path here at all).
import { getAgencyId, getUserId, requireRole } from '../../../packages/domain/tenant-context';
import { UserRole } from '../../../packages/domain/types';
import type { DatabaseRuntime, TenantTransactionClient } from './database';
import { ForbiddenError } from '../../../packages/domain/tenant-context';
import { ConflictError, ValidationError } from './errors';
import { AuditEventType, recordAuditEvent } from './audit-log';

export interface PermissionRestriction {
  id: string;
  agencyId: string;
  role: UserRole;
  resource: string;
  action: string;
  createdByUserId: string;
  createdAt: Date;
}

interface PermissionRestrictionRow {
  id: string;
  agency_id: string;
  role: UserRole;
  resource: string;
  action: string;
  created_by_user_id: string;
  created_at: string;
}

// Roles a tenant is allowed to restrict. OWNER/ADMIN are intentionally
// excluded -- restricting them would let a tenant lock itself out of its
// own agency, which this mechanism must never permit.
const RESTRICTABLE_ROLES: ReadonlySet<UserRole> = new Set([
  UserRole.MANAGER,
  UserRole.AGENT,
  UserRole.VIEWER,
]);

function toPermissionRestriction(row: PermissionRestrictionRow): PermissionRestriction {
  return {
    id: row.id,
    agencyId: row.agency_id,
    role: row.role,
    resource: row.resource,
    action: row.action,
    createdByUserId: row.created_by_user_id,
    createdAt: new Date(row.created_at),
  };
}

export interface CreatePermissionRestrictionInput {
  role: UserRole;
  resource: string;
  action: string;
}

export async function createPermissionRestriction(
  database: DatabaseRuntime,
  input: CreatePermissionRestrictionInput,
): Promise<PermissionRestriction> {
  // Only OWNER/ADMIN may configure restrictions for their tenant.
  requireRole(UserRole.ADMIN);
  const agencyId = getAgencyId();
  const createdByUserId = getUserId();

  if (!RESTRICTABLE_ROLES.has(input.role)) {
    throw new ValidationError(
      'Apenas os papéis MANAGER, AGENT e VIEWER podem ser restringidos. OWNER e ADMIN nunca podem ser restringidos (previne bloqueio do próprio tenant).',
    );
  }
  const resource = input.resource?.trim();
  const action = input.action?.trim();
  if (!resource || !action) {
    throw new ValidationError('resource e action são obrigatórios');
  }

  return database.withTenantTransaction(async (client) => {
    let result;
    try {
      result = await client.query<PermissionRestrictionRow>(
        `INSERT INTO permission_restrictions (agency_id, role, resource, action, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, agency_id, role, resource, action, created_by_user_id, created_at`,
        [agencyId, input.role, resource, action, createdByUserId],
      );
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        throw new ConflictError('Esta restrição já existe para este papel/recurso/ação');
      }
      throw error;
    }
    const row = result.rows[0];
    if (!row) {
      throw new Error('Permission restriction insert did not return a row');
    }
    const created = toPermissionRestriction(row);
    await recordAuditEvent(client, {
      eventType: AuditEventType.PERMISSION_RESTRICTION_CREATED,
      entityType: 'permission_restriction',
      entityId: created.id,
      metadata: { role: created.role, resource: created.resource, action: created.action },
    });
    return created;
  });
}

export async function listPermissionRestrictions(
  database: DatabaseRuntime,
): Promise<PermissionRestriction[]> {
  requireRole(UserRole.VIEWER);
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<PermissionRestrictionRow>(
      `SELECT id, agency_id, role, resource, action, created_by_user_id, created_at
       FROM permission_restrictions WHERE agency_id = $1 ORDER BY created_at DESC`,
      [agencyId],
    );
    return result.rows.map(toPermissionRestriction);
  });
}

export async function deletePermissionRestriction(
  database: DatabaseRuntime,
  id: string,
): Promise<boolean> {
  requireRole(UserRole.ADMIN);
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<{ id: string; role: UserRole; resource: string; action: string }>(
      `DELETE FROM permission_restrictions WHERE agency_id = $1 AND id = $2
       RETURNING id, role, resource, action`,
      [agencyId, id],
    );
    const row = result.rows[0];
    if (!row) {
      return false;
    }
    await recordAuditEvent(client, {
      eventType: AuditEventType.PERMISSION_RESTRICTION_DELETED,
      entityType: 'permission_restriction',
      entityId: row.id,
      metadata: { role: row.role, resource: row.resource, action: row.action },
    });
    return true;
  });
}

// ============================================================
// Enforcement helper -- call AFTER requireRole() at a route boundary.
// ============================================================
//
// This can only ever narrow: it looks up whether the CURRENT actor's
// role has been restricted, for this tenant, from (resource, action).
// It never consults or overrides requireRole() -- a caller whose role
// fails requireRole() never reaches this check at all, and a caller who
// passes requireRole() can still be blocked here if their tenant chose
// to restrict it. OWNER/ADMIN rows can never exist in the table (DB
// CHECK constraint + createPermissionRestriction() validation), so this
// can never block an OWNER/ADMIN regardless of what is queried.
export async function assertNotRestricted(
  client: TenantTransactionClient,
  role: UserRole,
  resource: string,
  action: string,
): Promise<void> {
  if (role === UserRole.OWNER || role === UserRole.ADMIN) {
    return;
  }
  const agencyId = getAgencyId();
  const result = await client.query<{ id: string }>(
    `SELECT id FROM permission_restrictions
     WHERE agency_id = $1 AND role = $2 AND resource = $3 AND action = $4
     LIMIT 1`,
    [agencyId, role, resource, action],
  );
  if (result.rows.length > 0) {
    throw new ForbiddenError(
      `Esta ação (${resource}:${action}) foi restringida para o papel ${role} nesta agência`,
    );
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}
