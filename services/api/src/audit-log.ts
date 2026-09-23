import { getTenantContext } from '../../../packages/domain/tenant-context';
import type { DatabaseRuntime, TenantTransactionClient } from './database';

export const AuditEventType = {
  AUTH_LOGIN_SUCCEEDED: 'AUTH_LOGIN_SUCCEEDED',
  AUTH_LOGIN_FAILED: 'AUTH_LOGIN_FAILED',
  AUTH_LOGOUT: 'AUTH_LOGOUT',
  AUTH_DEV_AUTH_PRODUCTION_REJECTED: 'AUTH_DEV_AUTH_PRODUCTION_REJECTED',
  MFA_CHALLENGE_SUCCEEDED: 'MFA_CHALLENGE_SUCCEEDED',
  MFA_CHALLENGE_FAILED: 'MFA_CHALLENGE_FAILED',
  MFA_ENROLLED: 'MFA_ENROLLED',
  MFA_DISABLED: 'MFA_DISABLED',
  MFA_RECOVERY_CODE_USED: 'MFA_RECOVERY_CODE_USED',
  PASSWORD_RESET_REQUESTED: 'PASSWORD_RESET_REQUESTED',
  PASSWORD_RESET_COMPLETED: 'PASSWORD_RESET_COMPLETED',
  SESSION_REVOKED: 'SESSION_REVOKED',
  SECURITY_RATE_LIMIT_BLOCKED: 'SECURITY_RATE_LIMIT_BLOCKED',
  SECURITY_CAPTCHA_REQUIRED: 'SECURITY_CAPTCHA_REQUIRED',
  USER_CREATED: 'USER_CREATED',
  USER_DISABLED: 'USER_DISABLED',
  USER_ROLE_CHANGED: 'USER_ROLE_CHANGED',
  AGENCY_SETTINGS_UPDATED: 'AGENCY_SETTINGS_UPDATED',
  AGENCY_BRANDING_UPDATED: 'AGENCY_BRANDING_UPDATED',
  DEPARTMENT_CREATED: 'DEPARTMENT_CREATED',
  DEPARTMENT_UPDATED: 'DEPARTMENT_UPDATED',
  DEPARTMENT_DELETED: 'DEPARTMENT_DELETED',
  INVITATION_SENT: 'INVITATION_SENT',
  INVITATION_ACCEPTED: 'INVITATION_ACCEPTED',
  INVITATION_REVOKED: 'INVITATION_REVOKED',
  PERMISSION_RESTRICTION_CREATED: 'PERMISSION_RESTRICTION_CREATED',
  PERMISSION_RESTRICTION_DELETED: 'PERMISSION_RESTRICTION_DELETED',
  ONBOARDING_STEP_UPDATED: 'ONBOARDING_STEP_UPDATED',
  ONBOARDING_COMPLETED: 'ONBOARDING_COMPLETED',
  ENTITLEMENT_CHANGED: 'ENTITLEMENT_CHANGED',
  PAYMENT_RECORDED: 'PAYMENT_RECORDED',
  BOOKING_CANCELLED: 'BOOKING_CANCELLED',
  PROPOSAL_CREATED: 'PROPOSAL_CREATED',
  PROPOSAL_SENT: 'PROPOSAL_SENT',
  PROPOSAL_ACCEPTED: 'PROPOSAL_ACCEPTED',
  PROPOSAL_DECLINED: 'PROPOSAL_DECLINED',
  PROPOSAL_CANCELLED: 'PROPOSAL_CANCELLED',
  SALE_CREATED: 'SALE_CREATED',
  SALE_CONFIRMED: 'SALE_CONFIRMED',
  SALE_CANCELLED: 'SALE_CANCELLED',
  SALE_PAID: 'SALE_PAID',
  CUSTOMER_PROFILE_UPDATED: 'CUSTOMER_PROFILE_UPDATED',
  CUSTOMER_CREATED: 'CUSTOMER_CREATED',
  CUSTOMER_UPDATED: 'CUSTOMER_UPDATED',
  WISH_CREATED: 'WISH_CREATED',
  WISH_UPDATED: 'WISH_UPDATED',
  TRIP_CREATED: 'TRIP_CREATED',
  TRIP_UPDATED: 'TRIP_UPDATED',
  REVENUE_CREATED: 'REVENUE_CREATED',
  REVENUE_UPDATED: 'REVENUE_UPDATED',
  REVENUE_PAID: 'REVENUE_PAID',
  REVENUE_CANCELLED: 'REVENUE_CANCELLED',
  EXPENSE_CREATED: 'EXPENSE_CREATED',
  EXPENSE_UPDATED: 'EXPENSE_UPDATED',
  EXPENSE_PAID: 'EXPENSE_PAID',
  EXPENSE_CANCELLED: 'EXPENSE_CANCELLED',
  CASH_TRANSACTION_CREATED: 'CASH_TRANSACTION_CREATED',
  RECONCILIATION_CREATED: 'RECONCILIATION_CREATED',
  // Customer 360 (Task 4). Document-specific events live in their own
  // insert-only `document_audit_events` trail (see document-audit.ts); these
  // cover the customer-profile satellites that belong in the general log.
  CUSTOMER_ADDRESS_CREATED: 'CUSTOMER_ADDRESS_CREATED',
  CUSTOMER_ADDRESS_UPDATED: 'CUSTOMER_ADDRESS_UPDATED',
  CUSTOMER_ADDRESS_DELETED: 'CUSTOMER_ADDRESS_DELETED',
  CUSTOMER_DEPENDENT_CREATED: 'CUSTOMER_DEPENDENT_CREATED',
  CUSTOMER_DEPENDENT_UPDATED: 'CUSTOMER_DEPENDENT_UPDATED',
  CUSTOMER_DEPENDENT_DELETED: 'CUSTOMER_DEPENDENT_DELETED',
  CUSTOMER_DOCUMENT_CREATED: 'CUSTOMER_DOCUMENT_CREATED',
  CUSTOMER_DOCUMENT_UPDATED: 'CUSTOMER_DOCUMENT_UPDATED',
  CUSTOMER_DOCUMENT_DELETED: 'CUSTOMER_DOCUMENT_DELETED',
  // Client Onboarding (Agent 02): secure remote enrollment link flow.
  ENROLLMENT_LINK_CREATED: 'ENROLLMENT_LINK_CREATED',
  ENROLLMENT_LINK_REVOKED: 'ENROLLMENT_LINK_REVOKED',
  ENROLLMENT_SUBMISSION_CREATED: 'ENROLLMENT_SUBMISSION_CREATED',
  ENROLLMENT_SUBMISSION_CHANGES_REQUESTED: 'ENROLLMENT_SUBMISSION_CHANGES_REQUESTED',
  ENROLLMENT_SUBMISSION_APPROVED: 'ENROLLMENT_SUBMISSION_APPROVED',
  // Partner Portal (Agent 04): CommercialPartner / PartnerContract /
  // PartnerLink / PartnerAttribution / PartnerCommission.
  PARTNER_CREATED: 'PARTNER_CREATED',
  PARTNER_UPDATED: 'PARTNER_UPDATED',
  PARTNER_CONTRACT_CREATED: 'PARTNER_CONTRACT_CREATED',
  PARTNER_CONTRACT_UPDATED: 'PARTNER_CONTRACT_UPDATED',
  PARTNER_LINK_CREATED: 'PARTNER_LINK_CREATED',
  PARTNER_LINK_REVOKED: 'PARTNER_LINK_REVOKED',
  PARTNER_ATTRIBUTION_CREATED: 'PARTNER_ATTRIBUTION_CREATED',
  PARTNER_COMMISSION_GENERATED: 'PARTNER_COMMISSION_GENERATED',
  PARTNER_COMMISSION_APPROVED: 'PARTNER_COMMISSION_APPROVED',
  PARTNER_COMMISSION_PAYABLE_CREATED: 'PARTNER_COMMISSION_PAYABLE_CREATED',
  // Upsell (Agent 08): SaleItem/ProposalOptionalItem/UpsellSuggestion.
  SALE_ITEM_CREATED: 'SALE_ITEM_CREATED',
  SALE_ITEM_CANCELLED: 'SALE_ITEM_CANCELLED',
  PROPOSAL_OPTIONAL_ITEM_CREATED: 'PROPOSAL_OPTIONAL_ITEM_CREATED',
  PROPOSAL_OPTIONAL_ITEM_ACCEPTED: 'PROPOSAL_OPTIONAL_ITEM_ACCEPTED',
  PROPOSAL_OPTIONAL_ITEM_DECLINED: 'PROPOSAL_OPTIONAL_ITEM_DECLINED',
  UPSELL_RULE_CREATED: 'UPSELL_RULE_CREATED',
  UPSELL_SUGGESTION_GENERATED: 'UPSELL_SUGGESTION_GENERATED',
  UPSELL_SUGGESTION_ACCEPTED: 'UPSELL_SUGGESTION_ACCEPTED',
  UPSELL_SUGGESTION_DISMISSED: 'UPSELL_SUGGESTION_DISMISSED',
  // Contracts (Agent 03): templates, generated documents, signatories,
  // secure public signature links.
  CONTRACT_TEMPLATE_CREATED: 'CONTRACT_TEMPLATE_CREATED',
  CONTRACT_TEMPLATE_UPDATED: 'CONTRACT_TEMPLATE_UPDATED',
  CONTRACT_DOCUMENT_CREATED: 'CONTRACT_DOCUMENT_CREATED',
  CONTRACT_DOCUMENT_STATUS_CHANGED: 'CONTRACT_DOCUMENT_STATUS_CHANGED',
  CONTRACT_DOCUMENT_CANCELLED: 'CONTRACT_DOCUMENT_CANCELLED',
  CONTRACT_SIGNATURE_LINK_CREATED: 'CONTRACT_SIGNATURE_LINK_CREATED',
  CONTRACT_SIGNATURE_LINK_REVOKED: 'CONTRACT_SIGNATURE_LINK_REVOKED',
  CONTRACT_SIGNATORY_VIEWED: 'CONTRACT_SIGNATORY_VIEWED',
  CONTRACT_SIGNATORY_SIGNED: 'CONTRACT_SIGNATORY_SIGNED',
  CONTRACT_SIGNATORY_DECLINED: 'CONTRACT_SIGNATORY_DECLINED',
  // Insurance (Agent 09 / Products Upsell): policy sale is the finance
  // convergence point (creates a Receivable via financial.ts), so it is
  // audited like other sale-adjacent events.
  INSURANCE_PRODUCT_CREATED: 'INSURANCE_PRODUCT_CREATED',
  INSURANCE_POLICY_CREATED: 'INSURANCE_POLICY_CREATED',
  INSURANCE_POLICY_STATUS_UPDATED: 'INSURANCE_POLICY_STATUS_UPDATED',
  INSURANCE_TRAVELER_ADDED: 'INSURANCE_TRAVELER_ADDED',
  INSURANCE_DOCUMENT_CREATED: 'INSURANCE_DOCUMENT_CREATED',
  // Partner Campaigns (Agent 10): external-partner advertising campaigns --
  // distinct from the internal "offer growth" CAMPAIGN_* events above,
  // which belong to the unrelated agency-owned campaigns.ts module.
  PARTNER_CAMPAIGN_CREATED: 'PARTNER_CAMPAIGN_CREATED',
  PARTNER_CAMPAIGN_STATUS_CHANGED: 'PARTNER_CAMPAIGN_STATUS_CHANGED',
  CAMPAIGN_PLACEMENT_CREATED: 'CAMPAIGN_PLACEMENT_CREATED',
  // Customer Segmentation: saved filter rules (SEGMENT_SHARED fires only
  // when an update flips scope PERSONAL -> SHARED, not on every edit).
  SEGMENT_CREATED: 'SEGMENT_CREATED',
  SEGMENT_UPDATED: 'SEGMENT_UPDATED',
  SEGMENT_ARCHIVED: 'SEGMENT_ARCHIVED',
  SEGMENT_SHARED: 'SEGMENT_SHARED',
  // Import Center: file import pipeline audit events.
  IMPORT_JOB_CREATED: 'IMPORT_JOB_CREATED',
  IMPORT_JOB_UPDATED: 'IMPORT_JOB_UPDATED',
  IMPORT_JOB_DRY_RUN: 'IMPORT_JOB_DRY_RUN',
  IMPORT_JOB_COMPLETED: 'IMPORT_JOB_COMPLETED',
  IMPORT_JOB_CANCELLED: 'IMPORT_JOB_CANCELLED',
  // Agency Communication: tenant-scoped communication audit events.
  AGENCY_COMMUNICATION_CREATED: 'AGENCY_COMMUNICATION_CREATED',
  AGENCY_COMMUNICATION_PUBLISHED: 'AGENCY_COMMUNICATION_PUBLISHED',
  AGENCY_COMMUNICATION_ARCHIVED: 'AGENCY_COMMUNICATION_ARCHIVED',
  OFFER_VISIBILITY_CHANGED: 'OFFER_VISIBILITY_CHANGED',
  // Media Library (docs/product/MEDIA_LIBRARY.md). Lifecycle of the
  // central agency asset library: created/updated/archived/deleted track
  // the asset itself (entityType MEDIA_ASSET); linked/unlinked track the
  // polymorphic media_asset_links rows, logged against the ENTITY type
  // (OFFER/PROPOSAL/COMMUNICATION) that gained or lost the reference.
  MEDIA_ASSET_CREATED: 'MEDIA_ASSET_CREATED',
  MEDIA_ASSET_UPDATED: 'MEDIA_ASSET_UPDATED',
  MEDIA_ASSET_ARCHIVED: 'MEDIA_ASSET_ARCHIVED',
  MEDIA_ASSET_DELETED: 'MEDIA_ASSET_DELETED',
  MEDIA_ASSET_LINKED: 'MEDIA_ASSET_LINKED',
  MEDIA_ASSET_UNLINKED: 'MEDIA_ASSET_UNLINKED',
} as const;

export type AuditEventType = (typeof AuditEventType)[keyof typeof AuditEventType];
export type AuditOutcome = 'SUCCESS' | 'FAILURE' | 'BLOCKED';

export interface RecordAuditEventInput {
  eventType: AuditEventType;
  entityType: string;
  entityId?: string;
  outcome?: AuditOutcome;
  metadata?: Record<string, unknown>;
}

interface AuditLogRow {
  id: string;
  occurred_at: string;
  agency_id: string;
  actor_type: string;
  actor_id: string | null;
  event_type: AuditEventType;
  entity_type: string;
  entity_id: string | null;
  outcome: AuditOutcome;
  metadata: unknown;
}

export interface AuditLogEntry {
  id: string;
  occurredAt: Date;
  agencyId: string;
  actorType: string;
  actorId?: string;
  eventType: AuditEventType;
  entityType: string;
  entityId?: string;
  outcome: AuditOutcome;
  metadata: unknown;
}

export interface ListAuditEventsOptions {
  eventType?: AuditEventType;
  limit?: number;
}

const allowedMetadataKeys = new Set([
  'amount',
  'currency',
  'method',
  'paymentDirection',
  'status',
  'fromStatus',
  'toStatus',
  'fieldsChanged',
  'reasonCode',
  'requestId',
  'result',
  // Media Library metadata (see MEDIA_ASSET_* events above).
  'entityType',
  'mediaAssetId',
  'usage',
  'sortOrder',
  'linkId',
  'title',
  'fileName',
  'mimeType',
]);

const maxMetadataStringLength = 128;

export async function recordAuditEvent(
  client: TenantTransactionClient,
  input: RecordAuditEventInput,
): Promise<void> {
  const context = getTenantContext();

  await client.query('SAVEPOINT audit_insert');
  try {
    await client.query(
      `INSERT INTO audit_logs
         (agency_id, actor_type, actor_id, event_type, entity_type, entity_id, outcome, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [
        context.agencyId,
        'USER',
        context.userId,
        input.eventType,
        input.entityType,
        input.entityId ?? null,
        input.outcome ?? 'SUCCESS',
        JSON.stringify(sanitizeAuditMetadata(input.metadata)),
      ],
    );
    await client.query('RELEASE SAVEPOINT audit_insert');
  } catch {
    await client.query('ROLLBACK TO SAVEPOINT audit_insert');
  }
}

export async function listAuditEvents(
  client: TenantTransactionClient,
  options: ListAuditEventsOptions = {},
): Promise<AuditLogEntry[]> {
  const agencyId = getTenantContext().agencyId;
  const values: unknown[] = [agencyId];
  let filter = 'agency_id = $1';

  if (options.eventType) {
    values.push(options.eventType);
    filter += ` AND event_type = $${values.length}`;
  }

  values.push(normalizeLimit(options.limit));
  const result = await client.query<AuditLogRow>(
    `SELECT id, occurred_at, agency_id, actor_type, actor_id, event_type, entity_type,
            entity_id, outcome, metadata
     FROM audit_logs
     WHERE ${filter}
     ORDER BY occurred_at DESC, id DESC
     LIMIT $${values.length}`,
    values,
  );

  return result.rows.map(toAuditLogEntry);
}

export async function listTenantAuditEvents(
  database: DatabaseRuntime,
  options: ListAuditEventsOptions = {},
): Promise<AuditLogEntry[]> {
  return database.withTenantTransaction((client) => listAuditEvents(client, options));
}

export function sanitizeAuditMetadata(metadata: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!metadata) {
    return {};
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (!allowedMetadataKeys.has(key)) {
      continue;
    }

    const safeValue = sanitizeMetadataValue(key, value);
    if (safeValue !== undefined) {
      sanitized[key] = safeValue;
    }
  }

  return sanitized;
}

function sanitizeMetadataValue(key: string, value: unknown): string | number | boolean | string[] | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    return sanitizeMetadataString(value);
  }

  if (key === 'fieldsChanged' && Array.isArray(value)) {
    const fields = value
      .filter((field): field is string => typeof field === 'string')
      .map(sanitizeMetadataString)
      .filter((field): field is string => field !== undefined)
      .slice(0, 20);
    return fields.length > 0 ? fields : undefined;
  }

  return undefined;
}

function sanitizeMetadataString(value: string): string | undefined {
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maxMetadataStringLength
    ? normalized
    : undefined;
}

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isInteger(limit) || limit === undefined) {
    return 100;
  }

  return Math.min(Math.max(limit, 1), 100);
}

function toAuditLogEntry(row: AuditLogRow): AuditLogEntry {
  return {
    id: row.id,
    occurredAt: new Date(row.occurred_at),
    agencyId: row.agency_id,
    actorType: row.actor_type,
    eventType: row.event_type,
    entityType: row.entity_type,
    outcome: row.outcome,
    metadata: row.metadata,
    ...(row.actor_id ? { actorId: row.actor_id } : {}),
    ...(row.entity_id ? { entityId: row.entity_id } : {}),
  };
}
