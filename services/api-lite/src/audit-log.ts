/**
 * Append-only audit log. Mirrors services/api/src/audit-log.ts:
 * SAVEPOINT-guarded insert that NEVER propagates a failure to the business
 * transaction (auditability without availability risk), and metadata that
 * is sanitized before storage (primitives only, capped).
 */
import type { TenantClient } from './database';
import { getOptionalTenantContext } from './tenant-context';

export const AUDIT_EVENTS = {
  PAYMENT_CONDITION_CREATED: 'PAYMENT_CONDITION_CREATED',
  SALE_PAYMENT_SCHEDULE_APPLIED: 'SALE_PAYMENT_SCHEDULE_APPLIED',
  SALE_PAYMENT_RECORDED: 'SALE_PAYMENT_RECORDED',
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILED: 'LOGIN_FAILED',
  LOGOUT: 'LOGOUT',
  CUSTOMER_CREATED: 'CUSTOMER_CREATED',
  CUSTOMER_UPDATED: 'CUSTOMER_UPDATED',
  CUSTOMER_REASSIGNED: 'CUSTOMER_REASSIGNED',
  USER_CREATED: 'USER_CREATED',
  USER_UPDATED: 'USER_UPDATED',
  USER_PASSWORD_RESET: 'USER_PASSWORD_RESET',
  USER_REQUIRED_PASSWORD_CHANGED: 'USER_REQUIRED_PASSWORD_CHANGED',
  PASSWORD_RESET_REQUESTED: 'PASSWORD_RESET_REQUESTED',
  PASSWORD_RESET_COMPLETED: 'PASSWORD_RESET_COMPLETED',
  USER_ROLE_CHANGED: 'USER_ROLE_CHANGED',
  USER_STATUS_CHANGED: 'USER_STATUS_CHANGED',
  USER_PERMISSIONS_CHANGED: 'USER_PERMISSIONS_CHANGED',
  USER_SELLER_LINKED: 'USER_SELLER_LINKED',
  DASHBOARD_CONFIGURED: 'DASHBOARD_CONFIGURED',
  BRANDING_UPDATED: 'BRANDING_UPDATED',
  SELLER_CREATED: 'SELLER_CREATED',
  SELLER_UPDATED: 'SELLER_UPDATED',
  SALE_CREATED: 'SALE_CREATED',
  SALE_UPDATED: 'SALE_UPDATED',
  SALE_CONFIRMED: 'SALE_CONFIRMED',
  SALE_CANCELLED: 'SALE_CANCELLED',
  COMMISSION_CREATED: 'COMMISSION_CREATED',
  COMMISSION_OVERRIDE: 'COMMISSION_OVERRIDE',
  COMMISSION_APPROVED: 'COMMISSION_APPROVED',
  COMMISSION_RECALCULATED: 'COMMISSION_RECALCULATED',
  COMMISSION_RULE_CREATED: 'COMMISSION_RULE_CREATED',
  COMMISSION_RULE_REVISED: 'COMMISSION_RULE_REVISED',
  COMMISSION_RULE_ARCHIVED: 'COMMISSION_RULE_ARCHIVED',
  COMMISSION_PAID: 'COMMISSION_PAID',
  PAYMENT_RECEIVED: 'PAYMENT_RECEIVED',
  PAYMENT_REVERSED: 'PAYMENT_REVERSED',
  EXPENSE_CREATED: 'EXPENSE_CREATED',
  EXPENSE_PAID: 'EXPENSE_PAID',
  CATEGORY_CREATED: 'CATEGORY_CREATED',
  CATEGORY_UPDATED: 'CATEGORY_UPDATED',
  CATEGORY_DELETED: 'CATEGORY_DELETED',
  SALE_CATEGORY_FORM_UPDATED: 'SALE_CATEGORY_FORM_UPDATED',
  COMMISSION_FINANCIAL_PROFILE_CREATED: 'COMMISSION_FINANCIAL_PROFILE_CREATED',
  CUSTOMER_FIELD_SETTINGS_CHANGED: 'CUSTOMER_FIELD_SETTINGS_CHANGED',
  AGENCY_REVENUE_RULE_CREATED: 'AGENCY_REVENUE_RULE_CREATED',
  AGENCY_REVENUE_RULE_REVISED: 'AGENCY_REVENUE_RULE_REVISED',
  AGENCY_REVENUE_CALCULATED: 'AGENCY_REVENUE_CALCULATED',
  AGENCY_REVENUE_ENTITLED: 'AGENCY_REVENUE_ENTITLED',
  AGENCY_REVENUE_RECEIVED: 'AGENCY_REVENUE_RECEIVED',
  AGENCY_REVENUE_REACTIVATED: 'AGENCY_REVENUE_REACTIVATED',
  AGENCY_REVENUE_CANCELLED: 'AGENCY_REVENUE_CANCELLED',
  CATALOG_PRODUCT_CREATED: 'CATALOG_PRODUCT_CREATED',
  CATALOG_PRODUCT_UPDATED: 'CATALOG_PRODUCT_UPDATED',
  SALE_ITEM_CREATED: 'SALE_ITEM_CREATED',
  SALE_ITEM_CANCELLED: 'SALE_ITEM_CANCELLED',
  ACCOUNT_CREATED: 'ACCOUNT_CREATED',
  ACCOUNT_UPDATED: 'ACCOUNT_UPDATED',
  FINANCIAL_CATEGORY_CREATED: 'FINANCIAL_CATEGORY_CREATED',
  FINANCIAL_CATEGORY_UPDATED: 'FINANCIAL_CATEGORY_UPDATED',
  PAYMENT_METHOD_CREATED: 'PAYMENT_METHOD_CREATED',
  PAYMENT_METHOD_UPDATED: 'PAYMENT_METHOD_UPDATED',
} as const;

export type AuditEventType = (typeof AUDIT_EVENTS)[keyof typeof AUDIT_EVENTS];

/**
 * Money-moving events fail closed: if the audit row cannot be written the
 * surrounding transaction fails and rolls back, so no commission approval,
 * override, payment or reversal can complete without its audit trail.
 */
export const REQUIRED_AUDIT_EVENTS: ReadonlySet<string> = new Set([
  AUDIT_EVENTS.PAYMENT_CONDITION_CREATED,
  AUDIT_EVENTS.SALE_PAYMENT_SCHEDULE_APPLIED,
  AUDIT_EVENTS.SALE_PAYMENT_RECORDED,
  'BACKUP_EXPORTED',
  AUDIT_EVENTS.COMMISSION_APPROVED,
  AUDIT_EVENTS.COMMISSION_OVERRIDE,
  AUDIT_EVENTS.COMMISSION_PAID,
  AUDIT_EVENTS.COMMISSION_RULE_CREATED,
  AUDIT_EVENTS.COMMISSION_RULE_REVISED,
  AUDIT_EVENTS.COMMISSION_RULE_ARCHIVED,
  // Configuration changes that decide what every later sale must contain.
  AUDIT_EVENTS.SALE_CATEGORY_FORM_UPDATED,
  AUDIT_EVENTS.COMMISSION_FINANCIAL_PROFILE_CREATED,
  AUDIT_EVENTS.CUSTOMER_FIELD_SETTINGS_CHANGED,
  AUDIT_EVENTS.AGENCY_REVENUE_RULE_CREATED,
  AUDIT_EVENTS.AGENCY_REVENUE_RULE_REVISED,
  AUDIT_EVENTS.AGENCY_REVENUE_CALCULATED,
  AUDIT_EVENTS.AGENCY_REVENUE_ENTITLED,
  AUDIT_EVENTS.AGENCY_REVENUE_RECEIVED,
  AUDIT_EVENTS.AGENCY_REVENUE_REACTIVATED,
  AUDIT_EVENTS.AGENCY_REVENUE_CANCELLED,
  AUDIT_EVENTS.EXPENSE_CREATED,
  AUDIT_EVENTS.EXPENSE_PAID,
  AUDIT_EVENTS.PAYMENT_RECEIVED,
  AUDIT_EVENTS.PAYMENT_REVERSED,
]);

export type AuditMetadata = Record<string, string | number | boolean | null>;

export interface AuditEventInput {
  eventType: string;
  entityType?: string;
  entityId?: string;
  metadata?: AuditMetadata;
}

const METADATA_KEY_RE = /^[A-Za-z0-9_]{1,64}$/;
const MAX_STRING_LENGTH = 500;

function sanitizeMetadata(metadata: AuditMetadata | undefined): Record<string, string | number | boolean | null> {
  if (!metadata) return {};
  const clean: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (!METADATA_KEY_RE.test(key)) continue;
    if (value === null || typeof value === 'boolean' || typeof value === 'number') {
      clean[key] = value;
    } else if (typeof value === 'string') {
      clean[key] = value.slice(0, MAX_STRING_LENGTH);
    }
  }
  return clean;
}

export async function recordAuditEvent(client: TenantClient, input: AuditEventInput): Promise<void> {
  const context = getOptionalTenantContext();
  if (!context || !context.tenantId) {
    // Programming error: audit requires the tenant context established by
    // withTenantTransaction/runAsTenant.
    throw new Error('recordAuditEvent requires a tenant context');
  }

  const insert = () =>
    client.query(
      `INSERT INTO audit_logs (tenant_id, user_id, event_type, entity_type, entity_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        context.tenantId,
        context.userId || null,
        input.eventType,
        input.entityType ?? null,
        input.entityId ?? null,
        JSON.stringify(sanitizeMetadata(input.metadata)),
      ],
    );

  if (REQUIRED_AUDIT_EVENTS.has(input.eventType)) {
    await insert();
    return;
  }

  try {
    await client.query('SAVEPOINT lite_audit_insert');
    await insert();
    await client.query('RELEASE SAVEPOINT lite_audit_insert');
  } catch {
    // Audit failure must never fail the business operation.
    await client.query('ROLLBACK TO SAVEPOINT lite_audit_insert').catch(() => undefined);
  }
}
