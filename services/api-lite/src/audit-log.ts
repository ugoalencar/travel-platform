/**
 * Append-only audit log. Mirrors services/api/src/audit-log.ts:
 * SAVEPOINT-guarded insert that NEVER propagates a failure to the business
 * transaction (auditability without availability risk), and metadata that
 * is sanitized before storage (primitives only, capped).
 */
import type { TenantClient } from './database';
import { getOptionalTenantContext } from './tenant-context';

export const AUDIT_EVENTS = {
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
  COMMISSION_PAID: 'COMMISSION_PAID',
  PAYMENT_RECEIVED: 'PAYMENT_RECEIVED',
  PAYMENT_REVERSED: 'PAYMENT_REVERSED',
  EXPENSE_CREATED: 'EXPENSE_CREATED',
  EXPENSE_PAID: 'EXPENSE_PAID',
  CATEGORY_CREATED: 'CATEGORY_CREATED',
  CATEGORY_UPDATED: 'CATEGORY_UPDATED',
  CATEGORY_DELETED: 'CATEGORY_DELETED',
  ACCOUNT_CREATED: 'ACCOUNT_CREATED',
  ACCOUNT_UPDATED: 'ACCOUNT_UPDATED',
  FINANCIAL_CATEGORY_CREATED: 'FINANCIAL_CATEGORY_CREATED',
  FINANCIAL_CATEGORY_UPDATED: 'FINANCIAL_CATEGORY_UPDATED',
  PAYMENT_METHOD_CREATED: 'PAYMENT_METHOD_CREATED',
  PAYMENT_METHOD_UPDATED: 'PAYMENT_METHOD_UPDATED',
} as const;

export type AuditEventType = (typeof AUDIT_EVENTS)[keyof typeof AUDIT_EVENTS];

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

  try {
    await client.query('SAVEPOINT lite_audit_insert');
    await client.query(
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
    await client.query('RELEASE SAVEPOINT lite_audit_insert');
  } catch {
    // Audit failure must never fail the business operation.
    await client.query('ROLLBACK TO SAVEPOINT lite_audit_insert').catch(() => undefined);
  }
}
