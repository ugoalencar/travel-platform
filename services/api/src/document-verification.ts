/**
 * Customer 360 -- document verification.
 *
 * Compares the fields an OCR extraction reported against the document record a
 * human entered, storing a per-field boolean plus a discrepancy bag. A
 * verification never auto-approves on its own: it writes the comparison and
 * moves the parent document to VERIFIED or MISMATCH, leaving MANUAL_REVIEW as
 * the escape hatch a human can record notes against.
 */

import type { DocumentExtraction, DocumentVerification } from '../../../packages/domain/types';
import {
  DocumentAuditEventType,
  DocumentVerificationStatus,
} from '../../../packages/domain/types';
import { getAgencyId, getTenantContext } from '../../../packages/domain/tenant-context';
import type { DatabaseRuntime, TenantTransactionClient } from './database';
import { NotFoundError, ValidationError } from './errors';
import { recordDocumentAuditEvent } from './document-audit';

const VERIFICATION_COLUMNS = `id, agency_id, document_id, extraction_id, holder_name_match,
              holder_birth_date_match, holder_nationality_match, document_number_match,
              discrepancies, manual_review_notes, reviewed_at, reviewed_by_user_id,
              created_at, updated_at`;

interface DocumentVerificationRow {
  id: string;
  agency_id: string;
  document_id: string;
  extraction_id: string | null;
  holder_name_match: boolean | null;
  holder_birth_date_match: boolean | null;
  holder_nationality_match: boolean | null;
  document_number_match: boolean | null;
  discrepancies: Record<string, unknown> | null;
  manual_review_notes: string | null;
  reviewed_at: string | null;
  reviewed_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

interface DocumentComparisonRow {
  customer_id: string;
  document_number: string;
  holder_name: string | null;
  holder_birth_date: string | null;
  holder_nationality: string | null;
}

/** One field's comparison outcome. `null` means "not comparable". */
type MatchResult = boolean | null;

interface ComparisonOutcome {
  holderNameMatch: MatchResult;
  holderBirthDateMatch: MatchResult;
  holderNationalityMatch: MatchResult;
  documentNumberMatch: MatchResult;
  discrepancies: Record<string, unknown>;
}

/**
 * Create a bare verification row, optionally linked to an extraction.
 *
 * Used for the manual-review path, where a human is recording a judgement
 * without an automated comparison behind it.
 */
export async function createVerification(
  database: DatabaseRuntime,
  documentId: string,
  extractionId?: string,
  manualReviewNotes?: string,
): Promise<DocumentVerification> {
  const agencyId = getAgencyId();
  requireNonBlank(documentId, 'documentId');

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<DocumentVerificationRow>(
      `INSERT INTO document_verifications
         (agency_id, document_id, extraction_id, manual_review_notes)
       VALUES ($1, $2, $3, $4)
       RETURNING ${VERIFICATION_COLUMNS}`,
      [agencyId, documentId, extractionId ?? null, manualReviewNotes ?? null],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('Document verification insert did not return a row');
    }

    return toDocumentVerification(row);
  });
}

/**
 * Compare an extraction's fields against the stored document and persist the
 * result, updating the document's verification status to match.
 */
export async function verifyAgainstCustomer(
  database: DatabaseRuntime,
  documentId: string,
  extraction: DocumentExtraction,
): Promise<DocumentVerification> {
  const agencyId = getAgencyId();
  requireNonBlank(documentId, 'documentId');

  return database.withTenantTransaction(async (client) => {
    const documentResult = await client.query<DocumentComparisonRow>(
      `SELECT customer_id, document_number, holder_name, holder_birth_date, holder_nationality
       FROM customer_documents
       WHERE agency_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [agencyId, documentId],
    );

    const document = documentResult.rows[0];
    if (!document) {
      throw new NotFoundError('Document not found');
    }

    const outcome = compareExtraction(document, extraction.extractedData);
    const status = deriveStatus(outcome);

    const result = await client.query<DocumentVerificationRow>(
      `INSERT INTO document_verifications
         (agency_id, document_id, extraction_id, holder_name_match, holder_birth_date_match,
          holder_nationality_match, document_number_match, discrepancies)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       RETURNING ${VERIFICATION_COLUMNS}`,
      [
        agencyId,
        documentId,
        extraction.id,
        outcome.holderNameMatch,
        outcome.holderBirthDateMatch,
        outcome.holderNationalityMatch,
        outcome.documentNumberMatch,
        JSON.stringify(outcome.discrepancies),
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('Document verification insert did not return a row');
    }

    await applyDocumentStatus(client, agencyId, documentId, status);

    const verification = toDocumentVerification(row);
    await recordDocumentAuditEvent(client, DocumentAuditEventType.VERIFICATION_COMPLETED, {
      documentId,
      customerId: document.customer_id,
      metadata: {
        verificationId: verification.id,
        extractionId: extraction.id,
        resultingStatus: status,
        // Field names and booleans only -- never the compared values.
        holderNameMatch: outcome.holderNameMatch,
        holderBirthDateMatch: outcome.holderBirthDateMatch,
        holderNationalityMatch: outcome.holderNationalityMatch,
        documentNumberMatch: outcome.documentNumberMatch,
      },
    });

    return verification;
  });
}

export async function getVerification(
  database: DatabaseRuntime,
  id: string,
): Promise<DocumentVerification | null> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<DocumentVerificationRow>(
      `SELECT ${VERIFICATION_COLUMNS}
       FROM document_verifications
       WHERE agency_id = $1 AND id = $2`,
      [agencyId, id],
    );

    const row = result.rows[0];
    return row ? toDocumentVerification(row) : null;
  });
}

/** Most recent verification for a document, or null when never verified. */
export async function getLatestVerificationForDocument(
  database: DatabaseRuntime,
  documentId: string,
): Promise<DocumentVerification | null> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<DocumentVerificationRow>(
      `SELECT ${VERIFICATION_COLUMNS}
       FROM document_verifications
       WHERE agency_id = $1 AND document_id = $2
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [agencyId, documentId],
    );

    const row = result.rows[0];
    return row ? toDocumentVerification(row) : null;
  });
}

/**
 * Attach a human review to a verification and move the document to
 * MANUAL_REVIEW.
 */
export async function recordManualReview(
  database: DatabaseRuntime,
  verificationId: string,
  reviewedByUserId: string,
  notes: string,
): Promise<DocumentVerification | null> {
  const agencyId = getAgencyId();
  requireNonBlank(reviewedByUserId, 'reviewedByUserId');
  requireNonBlank(notes, 'notes');

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<DocumentVerificationRow>(
      `UPDATE document_verifications
       SET reviewed_at = now(),
           reviewed_by_user_id = $3,
           manual_review_notes = $4,
           updated_at = now()
       WHERE agency_id = $1 AND id = $2
       RETURNING ${VERIFICATION_COLUMNS}`,
      [agencyId, verificationId, reviewedByUserId, notes],
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    const verification = toDocumentVerification(row);
    await applyDocumentStatus(
      client,
      agencyId,
      verification.documentId,
      DocumentVerificationStatus.MANUAL_REVIEW,
    );

    await recordDocumentAuditEvent(client, DocumentAuditEventType.VERIFICATION_COMPLETED, {
      documentId: verification.documentId,
      userId: reviewedByUserId,
      metadata: {
        verificationId: verification.id,
        resultingStatus: DocumentVerificationStatus.MANUAL_REVIEW,
        manualReview: true,
      },
    });

    return verification;
  });
}

/**
 * Field-by-field comparison of extracted data against the stored document.
 *
 * Exported for direct unit testing: the comparison rules (case- and
 * accent-insensitive names, punctuation-insensitive document numbers,
 * date-only birth dates) are the substance of this service and deserve tests
 * that do not need a database.
 */
export function compareExtraction(
  document: Pick<
    DocumentComparisonRow,
    'document_number' | 'holder_name' | 'holder_birth_date' | 'holder_nationality'
  >,
  extractedData: Record<string, unknown>,
): ComparisonOutcome {
  const discrepancies: Record<string, unknown> = {};

  const holderNameMatch = compareField(
    'holderName',
    document.holder_name,
    readString(extractedData, 'holderName', 'holder_name'),
    normalizeName,
    discrepancies,
  );
  const holderBirthDateMatch = compareField(
    'holderBirthDate',
    document.holder_birth_date,
    readString(extractedData, 'holderBirthDate', 'holder_birth_date'),
    normalizeDate,
    discrepancies,
  );
  const holderNationalityMatch = compareField(
    'holderNationality',
    document.holder_nationality,
    readString(extractedData, 'holderNationality', 'holder_nationality'),
    normalizeName,
    discrepancies,
  );
  const documentNumberMatch = compareField(
    'documentNumber',
    document.document_number,
    readString(extractedData, 'documentNumber', 'document_number'),
    normalizeDocumentNumber,
    discrepancies,
  );

  return {
    holderNameMatch,
    holderBirthDateMatch,
    holderNationalityMatch,
    documentNumberMatch,
    discrepancies,
  };
}

/**
 * A verification is VERIFIED only when every comparable field matched and at
 * least one field was actually comparable. Any mismatch is a MISMATCH; an
 * extraction that produced nothing comparable stays PENDING rather than
 * silently passing.
 */
function deriveStatus(outcome: ComparisonOutcome): DocumentVerificationStatus {
  const results = [
    outcome.holderNameMatch,
    outcome.holderBirthDateMatch,
    outcome.holderNationalityMatch,
    outcome.documentNumberMatch,
  ];

  if (results.some((value) => value === false)) {
    return DocumentVerificationStatus.MISMATCH;
  }
  if (results.some((value) => value === true)) {
    return DocumentVerificationStatus.VERIFIED;
  }
  return DocumentVerificationStatus.PENDING;
}

async function applyDocumentStatus(
  client: TenantTransactionClient,
  agencyId: string,
  documentId: string,
  status: DocumentVerificationStatus,
): Promise<void> {
  const context = getTenantContext();
  const reviewerId = context.userId.startsWith('customer-context:') ? null : context.userId;

  await client.query(
    `UPDATE customer_documents
     SET verification_status = $3,
         verified_at = CASE WHEN $3::text = 'VERIFIED' THEN now() ELSE verified_at END,
         verified_by_user_id = CASE WHEN $3::text = 'VERIFIED' THEN $4 ELSE verified_by_user_id END,
         updated_at = now()
     WHERE agency_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [agencyId, documentId, status, reviewerId],
  );
}

function compareField(
  field: string,
  stored: string | null,
  extracted: string | null,
  normalize: (value: string) => string,
  discrepancies: Record<string, unknown>,
): MatchResult {
  // Nothing to compare against on either side -- not a mismatch, just unknown.
  if (stored === null || stored.trim().length === 0) {
    return null;
  }
  if (extracted === null || extracted.trim().length === 0) {
    discrepancies[field] = { reason: 'MISSING_IN_EXTRACTION' };
    return null;
  }

  const matched = normalize(stored) === normalize(extracted);
  if (!matched) {
    // Record that the field differed without echoing either raw value: both
    // sides can be a passport or CPF number.
    discrepancies[field] = { reason: 'VALUE_MISMATCH' };
  }

  return matched;
}

function readString(
  data: Record<string, unknown>,
  ...keys: readonly string[]
): string | null {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }
  return null;
}

function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function normalizeDocumentNumber(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

function normalizeDate(value: string): string {
  const trimmed = value.trim();

  // Accept dd/mm/yyyy alongside ISO, which is what most Brazilian documents
  // carry and what several OCR backends echo verbatim.
  const brazilian = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (brazilian) {
    return `${brazilian[3]}-${brazilian[2]}-${brazilian[1]}`;
  }

  // Trim any time component from an ISO timestamp.
  const isoMatch = /^(\d{4}-\d{2}-\d{2})/.exec(trimmed);
  return isoMatch?.[1] ?? trimmed;
}

function requireNonBlank(value: unknown, field: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError(`Field "${field}" is required and must be a non-empty string`);
  }
}

function toDocumentVerification(row: DocumentVerificationRow): DocumentVerification {
  return {
    id: row.id,
    agencyId: row.agency_id,
    documentId: row.document_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(row.extraction_id !== null ? { extractionId: row.extraction_id } : {}),
    ...(row.holder_name_match !== null ? { holderNameMatch: row.holder_name_match } : {}),
    ...(row.holder_birth_date_match !== null
      ? { holderBirthDateMatch: row.holder_birth_date_match }
      : {}),
    ...(row.holder_nationality_match !== null
      ? { holderNationalityMatch: row.holder_nationality_match }
      : {}),
    ...(row.document_number_match !== null
      ? { documentNumberMatch: row.document_number_match }
      : {}),
    ...(row.discrepancies !== null ? { discrepancies: row.discrepancies } : {}),
    ...(row.manual_review_notes !== null
      ? { manualReviewNotes: row.manual_review_notes }
      : {}),
    ...(row.reviewed_at !== null ? { reviewedAt: new Date(row.reviewed_at) } : {}),
    ...(row.reviewed_by_user_id !== null
      ? { reviewedByUserId: row.reviewed_by_user_id }
      : {}),
  };
}

export type { ComparisonOutcome, DocumentVerificationRow };
