/**
 * Customer 360 -- identity documents.
 *
 * Tenant-scoped, soft-deletable document records. `is_expired` is not a
 * stored/generated column (Postgres generated columns cannot reference
 * CURRENT_DATE, which is not immutable) -- it's computed in every SELECT
 * below from `expiry_date` so it always reflects "today," never a stale
 * write-time snapshot. Document numbers are masked before they reach either
 * audit trail.
 */

import type { CustomerDocument } from '../../../packages/domain/types';
import {
  DocumentAuditEventType,
  DocumentType,
  DocumentVerificationStatus,
} from '../../../packages/domain/types';
import { getAgencyId } from '../../../packages/domain/tenant-context';
import type { DatabaseRuntime } from './database';
import { ValidationError } from './errors';
import { AuditEventType, recordAuditEvent } from './audit-log';
import { recordDocumentAuditEvent } from './document-audit';
import { maskDocumentNumber } from './document-masking';

const DOCUMENT_COLUMNS = `id, agency_id, customer_id, document_type, document_number, holder_name,
              holder_birth_date, holder_nationality, issuing_country, issuing_authority,
              issued_date, expiry_date,
              (expiry_date IS NOT NULL AND expiry_date < CURRENT_DATE) AS is_expired,
              verification_status, verified_at,
              verified_by_user_id, notes, created_at, updated_at, deleted_at`;

export interface CustomerDocumentRow {
  id: string;
  agency_id: string;
  customer_id: string;
  document_type: DocumentType;
  document_number: string;
  holder_name: string | null;
  holder_birth_date: string | null;
  holder_nationality: string | null;
  issuing_country: string | null;
  issuing_authority: string | null;
  issued_date: string | null;
  expiry_date: string | null;
  is_expired: boolean;
  verification_status: DocumentVerificationStatus;
  verified_at: string | null;
  verified_by_user_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CreateDocumentInput {
  customerId: string;
  documentType: DocumentType;
  documentNumber: string;
  holderName?: string;
  holderBirthDate?: string;
  holderNationality?: string;
  issuingCountry?: string;
  issuingAuthority?: string;
  issuedDate?: string;
  expiryDate?: string;
  notes?: string;
}

export interface UpdateDocumentInput {
  documentType?: DocumentType;
  documentNumber?: string;
  holderName?: string | null;
  holderBirthDate?: string | null;
  holderNationality?: string | null;
  issuingCountry?: string | null;
  issuingAuthority?: string | null;
  issuedDate?: string | null;
  expiryDate?: string | null;
  verificationStatus?: DocumentVerificationStatus;
  notes?: string | null;
}

export async function listDocuments(
  database: DatabaseRuntime,
  customerId: string,
): Promise<CustomerDocument[]> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<CustomerDocumentRow>(
      `SELECT ${DOCUMENT_COLUMNS}
       FROM customer_documents
       WHERE agency_id = $1 AND customer_id = $2 AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [agencyId, customerId],
    );

    return result.rows.map(toCustomerDocument);
  });
}

export async function getDocumentById(
  database: DatabaseRuntime,
  id: string,
): Promise<CustomerDocument | null> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<CustomerDocumentRow>(
      `SELECT ${DOCUMENT_COLUMNS}
       FROM customer_documents
       WHERE agency_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [agencyId, id],
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    const document = toCustomerDocument(row);
    // Reading an identity document is itself an auditable act.
    await recordDocumentAuditEvent(client, DocumentAuditEventType.DOCUMENT_VIEWED, {
      documentId: document.id,
      customerId: document.customerId,
    });

    return document;
  });
}

export async function createDocument(
  database: DatabaseRuntime,
  data: CreateDocumentInput,
): Promise<CustomerDocument> {
  const agencyId = getAgencyId();

  requireNonBlank(data.customerId, 'customerId');
  requireNonBlank(data.documentNumber, 'documentNumber');
  requireDocumentType(data.documentType);

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<CustomerDocumentRow>(
      `INSERT INTO customer_documents
         (agency_id, customer_id, document_type, document_number, holder_name,
          holder_birth_date, holder_nationality, issuing_country, issuing_authority,
          issued_date, expiry_date, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING ${DOCUMENT_COLUMNS}`,
      [
        agencyId,
        data.customerId,
        data.documentType,
        data.documentNumber.trim(),
        data.holderName ?? null,
        data.holderBirthDate ?? null,
        data.holderNationality ?? null,
        data.issuingCountry ?? null,
        data.issuingAuthority ?? null,
        data.issuedDate ?? null,
        data.expiryDate ?? null,
        data.notes ?? null,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('Customer document insert did not return a row');
    }

    const document = toCustomerDocument(row);
    const maskedNumber = maskDocumentNumber(document.documentNumber, document.documentType);

    await recordDocumentAuditEvent(client, DocumentAuditEventType.DOCUMENT_CREATED, {
      documentId: document.id,
      customerId: document.customerId,
      metadata: {
        documentType: document.documentType,
        maskedDocumentNumber: maskedNumber,
      },
    });
    await recordAuditEvent(client, {
      eventType: AuditEventType.CUSTOMER_DOCUMENT_CREATED,
      entityType: 'customer_document',
      entityId: document.id,
      metadata: {
        customerId: document.customerId,
        documentType: document.documentType,
        maskedDocumentNumber: maskedNumber,
      },
    });

    return document;
  });
}

export async function updateDocument(
  database: DatabaseRuntime,
  id: string,
  data: UpdateDocumentInput,
): Promise<CustomerDocument | null> {
  const agencyId = getAgencyId();

  if (data.documentNumber !== undefined) {
    requireNonBlank(data.documentNumber, 'documentNumber');
  }
  if (data.documentType !== undefined) {
    requireDocumentType(data.documentType);
  }
  if (data.verificationStatus !== undefined) {
    requireVerificationStatus(data.verificationStatus);
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  const changedFields: string[] = [];
  let index = 1;

  const assign = (column: string, value: unknown): void => {
    fields.push(`${column} = $${++index}`);
    values.push(value);
    changedFields.push(column);
  };

  if (data.documentType !== undefined) assign('document_type', data.documentType);
  if (data.documentNumber !== undefined) assign('document_number', data.documentNumber.trim());
  if (data.holderName !== undefined) assign('holder_name', data.holderName);
  if (data.holderBirthDate !== undefined) assign('holder_birth_date', data.holderBirthDate);
  if (data.holderNationality !== undefined) assign('holder_nationality', data.holderNationality);
  if (data.issuingCountry !== undefined) assign('issuing_country', data.issuingCountry);
  if (data.issuingAuthority !== undefined) assign('issuing_authority', data.issuingAuthority);
  if (data.issuedDate !== undefined) assign('issued_date', data.issuedDate);
  if (data.expiryDate !== undefined) assign('expiry_date', data.expiryDate);
  if (data.notes !== undefined) assign('notes', data.notes);
  if (data.verificationStatus !== undefined) {
    assign('verification_status', data.verificationStatus);
    // Stamp the reviewer trail alongside a status transition to VERIFIED.
    fields.push(
      `verified_at = CASE WHEN $${index}::text = 'VERIFIED' THEN now() ELSE verified_at END`,
    );
  }

  if (fields.length === 0) {
    return getDocumentById(database, id);
  }

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<CustomerDocumentRow>(
      `UPDATE customer_documents
       SET ${fields.join(', ')}, updated_at = now()
       WHERE agency_id = $1 AND id = $${index + 1} AND deleted_at IS NULL
       RETURNING ${DOCUMENT_COLUMNS}`,
      [agencyId, ...values, id],
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    const document = toCustomerDocument(row);
    await recordDocumentAuditEvent(client, DocumentAuditEventType.DOCUMENT_UPDATED, {
      documentId: document.id,
      customerId: document.customerId,
      metadata: { fieldsChanged: changedFields },
    });
    await recordAuditEvent(client, {
      eventType: AuditEventType.CUSTOMER_DOCUMENT_UPDATED,
      entityType: 'customer_document',
      entityId: document.id,
      metadata: { customerId: document.customerId, fieldsChanged: changedFields },
    });

    return document;
  });
}

/** Soft delete. The row is retained; only `deleted_at` is stamped. */
export async function deleteDocument(
  database: DatabaseRuntime,
  id: string,
): Promise<CustomerDocument | null> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<CustomerDocumentRow>(
      `UPDATE customer_documents
       SET deleted_at = now(), updated_at = now()
       WHERE agency_id = $1 AND id = $2 AND deleted_at IS NULL
       RETURNING ${DOCUMENT_COLUMNS}`,
      [agencyId, id],
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    const document = toCustomerDocument(row);
    await recordDocumentAuditEvent(client, DocumentAuditEventType.DOCUMENT_SOFT_DELETED, {
      documentId: document.id,
      customerId: document.customerId,
    });
    await recordAuditEvent(client, {
      eventType: AuditEventType.CUSTOMER_DOCUMENT_DELETED,
      entityType: 'customer_document',
      entityId: document.id,
      metadata: { customerId: document.customerId },
    });

    return document;
  });
}

function requireNonBlank(value: unknown, field: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError(`Field "${field}" is required and must be a non-empty string`);
  }
}

function requireDocumentType(value: unknown): void {
  const allowed = Object.values(DocumentType) as string[];
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new ValidationError(`Field "documentType" must be one of: ${allowed.join(', ')}`);
  }
}

function requireVerificationStatus(value: unknown): void {
  const allowed = Object.values(DocumentVerificationStatus) as string[];
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new ValidationError(`Field "verificationStatus" must be one of: ${allowed.join(', ')}`);
  }
}

export function toCustomerDocument(row: CustomerDocumentRow): CustomerDocument {
  return {
    id: row.id,
    agencyId: row.agency_id,
    customerId: row.customer_id,
    documentType: row.document_type,
    documentNumber: row.document_number,
    isExpired: row.is_expired,
    verificationStatus: row.verification_status,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(row.holder_name !== null ? { holderName: row.holder_name } : {}),
    ...(row.holder_birth_date !== null
      ? { holderBirthDate: new Date(row.holder_birth_date) }
      : {}),
    ...(row.holder_nationality !== null ? { holderNationality: row.holder_nationality } : {}),
    ...(row.issuing_country !== null ? { issuingCountry: row.issuing_country } : {}),
    ...(row.issuing_authority !== null ? { issuingAuthority: row.issuing_authority } : {}),
    ...(row.issued_date !== null ? { issuedDate: new Date(row.issued_date) } : {}),
    ...(row.expiry_date !== null ? { expiryDate: new Date(row.expiry_date) } : {}),
    ...(row.verified_at !== null ? { verifiedAt: new Date(row.verified_at) } : {}),
    ...(row.verified_by_user_id !== null
      ? { verifiedByUserId: row.verified_by_user_id }
      : {}),
    ...(row.notes !== null ? { notes: row.notes } : {}),
    ...(row.deleted_at !== null ? { deletedAt: new Date(row.deleted_at) } : {}),
  };
}
