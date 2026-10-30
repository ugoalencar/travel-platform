/**
 * Closed catalog of (resource, action) keys that per-user overrides and
 * role restrictions may refer to (SEC-01, ADR-009). Anything outside this
 * list is rejected on write and denied on read (fail closed).
 *
 * v1 rules: only read keys are delegable (GRANT), only to AGENT, and the
 * delegable set is exactly the 12 modules of `agent_area_grants`.
 */
import { UserRole } from '../../../../packages/domain/types';
import type { AreaGrant } from '../area-grants';

export interface CatalogEntry {
  resource: string;
  action: string;
  /** Informational base role; the call site still passes the enforced floor. */
  minRole: UserRole;
  /** May receive an individual GRANT. */
  delegable: boolean;
  grantableToRoles: readonly UserRole[];
  /** Mutations are never delegable in v1. */
  mutation: boolean;
  /**
   * Whether the server applies a per-user REVOKE for this key today (the bridge
   * in area-grants.ts). REVOKE is rejected for keys that are not enforced, so the
   * UI can never promise a block the server does not apply.
   */
  enforced: boolean;
  /** Legacy `agent_area_grants` value this key mirrors, when any. */
  areaGrant?: AreaGrant;
  /** Travel Lite permission key, for future Lite -> Full migration; null = no counterpart. */
  liteKey: string | null;
}

const read = (
  resource: string,
  action: string,
  areaGrant: AreaGrant,
  liteKey: string | null,
  enforced: boolean,
): CatalogEntry => ({
  resource,
  action,
  minRole: UserRole.MANAGER,
  delegable: true,
  grantableToRoles: [UserRole.AGENT],
  mutation: false,
  enforced,
  areaGrant,
  liteKey,
});

const fixed = (
  resource: string,
  action: string,
  minRole: UserRole,
  mutation: boolean,
  liteKey: string | null,
): CatalogEntry => ({
  resource,
  action,
  minRole,
  delegable: false,
  grantableToRoles: [],
  mutation,
  enforced: false,
  liteKey,
});

export const CATALOG: readonly CatalogEntry[] = [
  read('sales', 'proposals.read', 'SALES_PROPOSALS', null, false),
  read('sales', 'bookings.read', 'SALES_BOOKINGS', null, false),
  read('sales', 'sales.read', 'SALES_SALES', 'sales.read_all', false),
  read('financial', 'overview.read', 'FINANCIAL_OVERVIEW', 'finance.read', true),
  read('financial', 'receivables.read', 'FINANCIAL_RECEIVABLES', 'finance.read', true),
  read('financial', 'payables.read', 'FINANCIAL_PAYABLES', 'finance.read', true),
  read('financial', 'cash.read', 'FINANCIAL_CASH', 'finance.read', true),
  read('financial', 'reconciliation.read', 'FINANCIAL_RECONCILIATION', 'finance.read', true),
  read('financial', 'revenues.read', 'FINANCIAL_REVENUES', 'finance.read', true),
  read('financial', 'expenses.read', 'FINANCIAL_EXPENSES', 'finance.read', true),
  read('financial', 'dre.read', 'FINANCIAL_DRE', 'finance.read', true),
  read('financial', 'reports.read', 'FINANCIAL_REPORTS', 'reports.sales_all', true),
  // Keys already used by permission_restrictions + assertNotRestricted (restrict-only).
  fixed('customers', 'read', UserRole.VIEWER, false, 'customers.read'),
  fixed('financial', 'view', UserRole.MANAGER, false, 'finance.read'),
  fixed('employees', 'view', UserRole.MANAGER, false, null),
  fixed('air-services', 'create', UserRole.AGENT, true, null),
  // Q4 (ADR-008): own keys, administrator only, never delegable.
  fixed('customers', 'fields_manage', UserRole.ADMIN, true, 'customers.fields_manage'),
  fixed('catalog', 'manage', UserRole.ADMIN, true, 'catalog.manage'),
  // BAK-01: OWNER-only, exact role; present so a GRANT/REVOKE on it is rejected (not delegable, not enforced).
  fixed('backup', 'export', UserRole.OWNER, true, null),
];

/** Keys that must never become delegable (guarded by a test). */
export const NEVER_DELEGABLE_KEYS: readonly string[] = [
  'users:manage',
  'permissions:manage',
  'backup:export',
  'backup:restore',
  'dashboard:configure',
  'security:manage',
  'platform:manage',
  'customers:fields_manage',
  'catalog:manage',
];

export function findCatalogEntry(resource: string, action: string): CatalogEntry | undefined {
  return CATALOG.find((entry) => entry.resource === resource && entry.action === action);
}
