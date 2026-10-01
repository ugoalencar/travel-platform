/**
 * Travel Lite authorization: explicit permissions + data scope.
 *
 * The catalog, per-role defaults and per-user overrides live in the database
 * (004_access_control_dashboard.sql). Effective permissions are resolved
 * once per request at authentication time and carried in the tenant
 * context. Route handlers only ask "may this principal do X" and "which
 * rows may it see" — never "is the role Y".
 */
import type { TenantClient } from './database';
import { ForbiddenError, UnauthorizedError } from './errors';

/** Mirrors the `permissions` table (asserted by a test). */
export const PERMISSIONS = [
  'users.manage',
  'permissions.manage',
  'customers.create',
  'customers.read_all',
  'customers.read_own',
  'customers.update_all',
  'customers.update_own',
  'sales.create',
  'sales.read_all',
  'sales.read_own',
  'sales.update_all',
  'sales.update_own',
  'sellers.read',
  'sellers.manage',
  'commissions.read_all',
  'commissions.read_own',
  'commissions.approve',
  'commissions.pay',
  'finance.read',
  'finance.manage',
  'imports.manage',
  'reports.sales_all',
  'reports.sales_own',
  'reports.sellers_all',
  'reports.finance',
  'sale_costs.read_own',
  'sale_costs.read_all',
  'sale_costs.create',
  'sale_costs.update',
  'dashboard.configure',
  'settings.manage',
  'suppliers.manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export function isPermission(value: unknown): value is Permission {
  return typeof value === 'string' && (PERMISSIONS as readonly string[]).includes(value);
}

export interface AccessContext {
  role: string;
  roleRank: number;
  /** Role with every permission of the tenant (MASTER). */
  grantsAll: boolean;
  permissions: ReadonlySet<string>;
  /** Seller linked to the logged-in user (sellers.user_id), if any. */
  sellerId: string | null;
}

export function can(context: AccessContext, permission: Permission): boolean {
  return context.permissions.has(permission);
}

export function requirePermission(context: AccessContext | undefined, ...anyOf: Permission[]): void {
  if (!context) throw new UnauthorizedError();
  if (!anyOf.some((permission) => context.permissions.has(permission))) {
    throw new ForbiddenError(`Requires permission ${anyOf.join(' or ')}`);
  }
}

/**
 * Data scope for a resource with *_all / *_own permissions.
 * `own` with sellerId null matches nothing (a login without seller has no
 * own data). Neither permission -> 403.
 */
export type Scope = { all: true } | { all: false; sellerId: string | null };

export function scopeFor(context: AccessContext, all: Permission, own: Permission): Scope {
  if (can(context, all)) return { all: true };
  if (can(context, own)) return { all: false, sellerId: context.sellerId };
  throw new ForbiddenError(`Requires permission ${all} or ${own}`);
}

export function inScope(scope: Scope, sellerId: string | null): boolean {
  return scope.all || (scope.sellerId !== null && scope.sellerId === sellerId);
}

/**
 * SQL condition restricting `column` to the scope, pushing its parameter.
 * Returns null for the unrestricted scope.
 */
export function scopeCondition(scope: Scope, column: string, params: unknown[]): string | null {
  if (scope.all) return null;
  if (scope.sellerId === null) return 'false';
  params.push(scope.sellerId);
  return `${column} = $${params.length}`;
}

/**
 * A seller filter requested by an own-scoped user must be their own seller;
 * asking for another seller's data is refused (403) instead of silently
 * returning an empty page.
 */
export function effectiveSellerFilter(scope: Scope, requested: string | null): string | null {
  if (scope.all) return requested;
  // Fail closed: "own" without a linked seller must never become "no filter".
  if (scope.sellerId === null) throw new ForbiddenError('User is not linked to a seller');
  if (requested !== null && requested !== scope.sellerId) {
    throw new ForbiddenError('Access to another seller is not allowed');
  }
  return scope.sellerId;
}

/**
 * Effective permissions: grants_all role -> whole catalog; otherwise the
 * role defaults minus REVOKE overrides plus GRANT overrides.
 */
export async function effectivePermissions(
  client: TenantClient,
  tenantId: string,
  userId: string,
  role: string,
  grantsAll: boolean,
): Promise<string[]> {
  const result = await client.query<{ key: string }>(
    `SELECT p.key
       FROM permissions p
      WHERE $3::boolean
         OR (EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role = $4 AND rp.permission = p.key)
             AND NOT EXISTS (SELECT 1 FROM user_permissions up
                              WHERE up.tenant_id = $1 AND up.user_id = $2
                                AND up.permission = p.key AND up.effect = 'REVOKE'))
         OR EXISTS (SELECT 1 FROM user_permissions up
                     WHERE up.tenant_id = $1 AND up.user_id = $2
                       AND up.permission = p.key AND up.effect = 'GRANT')
      ORDER BY p.key`,
    [tenantId, userId, grantsAll, role],
  );
  return result.rows.map((row) => row.key);
}

/** Role, effective permissions and linked seller of a user. */
export async function loadAccess(
  client: TenantClient,
  tenantId: string,
  userId: string,
  role: string,
): Promise<AccessContext | null> {
  const roleResult = await client.query<{ rank: number; grants_all: boolean }>(
    'SELECT rank, grants_all FROM roles WHERE key = $1',
    [role],
  );
  const roleRow = roleResult.rows[0];
  if (!roleRow) return null;

  const permissions = await effectivePermissions(client, tenantId, userId, role, roleRow.grants_all);
  const sellerResult = await client.query<{ id: string }>(
    'SELECT id FROM sellers WHERE tenant_id = $1 AND user_id = $2',
    [tenantId, userId],
  );

  return {
    role,
    roleRank: roleRow.rank,
    grantsAll: roleRow.grants_all,
    permissions: new Set(permissions),
    sellerId: sellerResult.rows[0]?.id ?? null,
  };
}
