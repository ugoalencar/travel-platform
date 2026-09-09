/**
 * Customer 360 -- document audit trail.
 *
 * `document_audit_events` is an insert-only table: this module deliberately
 * exposes no update or delete helper. Reads are tenant-scoped through the same
 * `withTenantTransaction` pipeline as every other service, and all metadata is
 * pushed through the masking utility so a document number or CPF can never
 * land in the trail in the clear.
 */

import type { DocumentAuditEvent } from '../../../packages/domain/types';
import { DocumentAuditEventType } from '../../../packages/domain/types';
import { getAgencyId, getTenantContext } from '../../../packages/domain/tenant-context';
import type { DatabaseRuntime, TenantTransactionClient } from './database';
import { maskSensitiveFields } from './document-masking';

interface DocumentAuditEventRow {
  id: string;
  agency_id: string;
  document_id: string | null;
  attachment_id: string | null;
  user_id: string | null;
  customer_id: string | null;
  event_type: DocumentAuditEventType;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface RecordDocumentAuditEventInput {
  documentId?: string | undefined;
  attachmentId?: string | undefined;
  userId?: string | undefined;
  customerId?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

/**
 * Append one event to the document audit trail.
 *
 * Takes an already-open tenant transaction client so the audit write commits
 * (or rolls back) atomically with the operation it describes.
 *
 * `userId` defaults to the acting user from the ambient tenant context, which
 * is what every CRUD caller wants; it stays overridable for system-initiated
 * events such as an OCR callback.
 */
export async function recordDocumentAuditEvent(
  client: TenantTransactionClient,
  eventType: DocumentAuditEventType,
  data: RecordDocumentAuditEventInput = {},
): Promise<void> {
  const context = getTenantContext();
  // Customer-portal contexts carry a synthetic `customer-context:<id>` userId
  // that is not a row in `users`; never write it into the FK-backed column.
  const contextUserId = context.userId.startsWith('customer-context:') ? null : context.userId;
  const actorUserId = data.userId ?? contextUserId;
  const metadata = data.metadata === undefined ? null : maskSensitiveFields(data.metadata);

  await client.query(
    `INSERT INTO document_audit_events
       (agency_id, document_id, attachment_id, user_id, customer_id, event_type, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      context.agencyId,
      data.documentId ?? null,
      data.attachmentId ?? null,
      actorUserId,
      data.customerId ?? null,
      eventType,
      metadata === null ? null : JSON.stringify(metadata),
    ],
  );
}

/** Full audit trail for one customer, newest first. */
export async function getAuditLog(
  database: DatabaseRuntime,
  customerId: string,
  limit = 200,
): Promise<DocumentAuditEvent[]> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<DocumentAuditEventRow>(
      `SELECT id, agency_id, document_id, attachment_id, user_id, customer_id,
              event_type, metadata, created_at
       FROM document_audit_events
       WHERE agency_id = $1 AND customer_id = $2
       ORDER BY created_at DESC, id DESC
       LIMIT $3`,
      [agencyId, customerId, normalizeLimit(limit)],
    );

    return result.rows.map(toDocumentAuditEvent);
  });
}

/** Full audit trail for one document, newest first. */
export async function getDocumentAuditLog(
  database: DatabaseRuntime,
  documentId: string,
  limit = 200,
): Promise<DocumentAuditEvent[]> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<DocumentAuditEventRow>(
      `SELECT id, agency_id, document_id, attachment_id, user_id, customer_id,
              event_type, metadata, created_at
       FROM document_audit_events
       WHERE agency_id = $1 AND document_id = $2
       ORDER BY created_at DESC, id DESC
       LIMIT $3`,
      [agencyId, documentId, normalizeLimit(limit)],
    );

    return result.rows.map(toDocumentAuditEvent);
  });
}

function normalizeLimit(limit: number): number {
  if (!Number.isFinite(limit) || limit <= 0) {
    return 200;
  }
  return Math.min(Math.floor(limit), 1000);
}

function toDocumentAuditEvent(row: DocumentAuditEventRow): DocumentAuditEvent {
  return {
    id: row.id,
    agencyId: row.agency_id,
    eventType: row.event_type,
    createdAt: new Date(row.created_at),
    ...(row.document_id !== null ? { documentId: row.document_id } : {}),
    ...(row.attachment_id !== null ? { attachmentId: row.attachment_id } : {}),
    ...(row.user_id !== null ? { userId: row.user_id } : {}),
    ...(row.customer_id !== null ? { customerId: row.customer_id } : {}),
    ...(row.metadata !== null ? { metadata: row.metadata } : {}),
  };
}

export { DocumentAuditEventType };
