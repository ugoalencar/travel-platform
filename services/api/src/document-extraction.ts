/**
 * Customer 360 -- OCR extraction flow.
 *
 * Owns the `document_extractions` lifecycle: PENDING on insert, PROCESSING
 * once the provider has accepted the task, then COMPLETED or FAILED. The OCR
 * backend is injected as an `OcrProviderContract`, so this module has no
 * vendor dependency of its own.
 */

import type { DocumentExtraction } from '../../../packages/domain/types';
import { DocumentAuditEventType, OcrProcessingStatus } from '../../../packages/domain/types';
import { getAgencyId } from '../../../packages/domain/tenant-context';
import type { DatabaseRuntime } from './database';
import { ValidationError } from './errors';
import { recordDocumentAuditEvent } from './document-audit';
import type { OcrProviderContract } from './ocr-provider';

const EXTRACTION_COLUMNS = `id, agency_id, document_id, provider, extracted_data, confidence,
              field_confidence, processing_status, processed_at, error_message, created_at, updated_at`;

interface DocumentExtractionRow {
  id: string;
  agency_id: string;
  document_id: string;
  provider: string;
  extracted_data: Record<string, unknown>;
  confidence: string | number | null;
  field_confidence: Record<string, unknown> | null;
  processing_status: OcrProcessingStatus;
  processed_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Register a document with the OCR provider and persist the resulting task.
 *
 * The provider call happens outside the database transaction on purpose: a
 * slow or hung third-party HTTP request must not hold a tenant transaction
 * (and its `set_tenant_context` connection) open. A provider failure is
 * recorded as a FAILED extraction rather than propagated, so the caller always
 * gets a durable row to poll or retry from.
 */
export async function submitDocumentForExtraction(
  database: DatabaseRuntime,
  documentId: string,
  attachmentId: string,
  fileUrl: string,
  documentType: string,
  provider: OcrProviderContract,
): Promise<DocumentExtraction> {
  const agencyId = getAgencyId();

  requireNonBlank(documentId, 'documentId');
  requireNonBlank(attachmentId, 'attachmentId');
  requireNonBlank(fileUrl, 'fileUrl');

  const pending = await database.withTenantTransaction(async (client) => {
    const result = await client.query<DocumentExtractionRow>(
      `INSERT INTO document_extractions
         (agency_id, document_id, provider, extracted_data, processing_status)
       VALUES ($1, $2, $3, $4::jsonb, $5)
       RETURNING ${EXTRACTION_COLUMNS}`,
      [agencyId, documentId, provider.name, '{}', OcrProcessingStatus.PENDING],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('Document extraction insert did not return a row');
    }

    await recordDocumentAuditEvent(client, DocumentAuditEventType.EXTRACTION_STARTED, {
      documentId,
      attachmentId,
      metadata: { provider: provider.name, extractionId: row.id },
    });

    return toDocumentExtraction(row);
  });

  let taskId: string;
  try {
    taskId = await provider.submitForExtraction({
      agencyId,
      documentId,
      attachmentId,
      fileUrl,
      documentType,
    });
  } catch (error: unknown) {
    const failed = await failExtraction(database, pending.id, describeError(error));
    return failed ?? pending;
  }

  const promoted = await database.withTenantTransaction(async (client) => {
    const result = await client.query<DocumentExtractionRow>(
      `UPDATE document_extractions
       SET processing_status = $3,
           extracted_data = jsonb_build_object('taskId', $4::text),
           updated_at = now()
       WHERE agency_id = $1 AND id = $2
       RETURNING ${EXTRACTION_COLUMNS}`,
      [agencyId, pending.id, OcrProcessingStatus.PROCESSING, taskId],
    );

    const row = result.rows[0];
    return row ? toDocumentExtraction(row) : null;
  });

  return promoted ?? pending;
}

/** Persist a successful extraction result and close out the task. */
export async function completeDocumentExtraction(
  database: DatabaseRuntime,
  extractionId: string,
  extractedData: Record<string, unknown>,
  confidence?: number,
  fieldConfidence?: Record<string, number>,
): Promise<DocumentExtraction | null> {
  const agencyId = getAgencyId();
  const normalizedConfidence = normalizeConfidence(confidence);
  const normalizedFieldConfidence = normalizeFieldConfidence(fieldConfidence);

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<DocumentExtractionRow>(
      `UPDATE document_extractions
       SET extracted_data = $3::jsonb,
           confidence = $4,
           field_confidence = $5::jsonb,
           processing_status = $6,
           processed_at = now(),
           error_message = NULL,
           updated_at = now()
       WHERE agency_id = $1 AND id = $2
       RETURNING ${EXTRACTION_COLUMNS}`,
      [
        agencyId,
        extractionId,
        JSON.stringify(extractedData),
        normalizedConfidence,
        normalizedFieldConfidence === null ? null : JSON.stringify(normalizedFieldConfidence),
        OcrProcessingStatus.COMPLETED,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    const extraction = toDocumentExtraction(row);
    await recordDocumentAuditEvent(client, DocumentAuditEventType.EXTRACTION_COMPLETED, {
      documentId: extraction.documentId,
      metadata: {
        extractionId: extraction.id,
        provider: extraction.provider,
        confidence: extraction.confidence ?? null,
        // Field names only -- extracted values may include document numbers.
        extractedFields: Object.keys(extractedData),
      },
    });

    return extraction;
  });
}

/** Mark an extraction FAILED with a diagnostic message. */
export async function failExtraction(
  database: DatabaseRuntime,
  extractionId: string,
  errorMessage: string,
): Promise<DocumentExtraction | null> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<DocumentExtractionRow>(
      `UPDATE document_extractions
       SET processing_status = $3,
           error_message = $4,
           processed_at = now(),
           updated_at = now()
       WHERE agency_id = $1 AND id = $2
       RETURNING ${EXTRACTION_COLUMNS}`,
      [agencyId, extractionId, OcrProcessingStatus.FAILED, errorMessage],
    );

    const row = result.rows[0];
    return row ? toDocumentExtraction(row) : null;
  });
}

export async function getExtraction(
  database: DatabaseRuntime,
  id: string,
): Promise<DocumentExtraction | null> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<DocumentExtractionRow>(
      `SELECT ${EXTRACTION_COLUMNS}
       FROM document_extractions
       WHERE agency_id = $1 AND id = $2`,
      [agencyId, id],
    );

    const row = result.rows[0];
    return row ? toDocumentExtraction(row) : null;
  });
}

export async function listExtractionsForDocument(
  database: DatabaseRuntime,
  documentId: string,
): Promise<DocumentExtraction[]> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<DocumentExtractionRow>(
      `SELECT ${EXTRACTION_COLUMNS}
       FROM document_extractions
       WHERE agency_id = $1 AND document_id = $2
       ORDER BY created_at DESC`,
      [agencyId, documentId],
    );

    return result.rows.map(toDocumentExtraction);
  });
}

/**
 * Poll the provider for an in-flight extraction and persist a terminal result.
 *
 * Returns the extraction unchanged while the provider still reports
 * `processing`.
 */
export async function pollExtraction(
  database: DatabaseRuntime,
  extractionId: string,
  taskId: string,
  provider: OcrProviderContract,
): Promise<DocumentExtraction | null> {
  const result = await provider.getExtractionResult(taskId);

  if (result === null) {
    return failExtraction(database, extractionId, `Unknown provider task: ${taskId}`);
  }

  if (result.status === 'processing') {
    return getExtraction(database, extractionId);
  }

  if (result.status === 'failed') {
    return failExtraction(database, extractionId, result.error ?? 'Extraction failed');
  }

  return completeDocumentExtraction(
    database,
    extractionId,
    result.data ?? {},
    result.confidence,
    result.fieldConfidences,
  );
}

function requireNonBlank(value: unknown, field: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError(`Field "${field}" is required and must be a non-empty string`);
  }
}

function normalizeConfidence(confidence: number | undefined): number | null {
  if (confidence === undefined || !Number.isFinite(confidence)) {
    return null;
  }
  return Math.min(100, Math.max(0, confidence));
}

function normalizeFieldConfidence(
  fieldConfidence: Record<string, number> | undefined,
): Record<string, number> | null {
  if (fieldConfidence === undefined) {
    return null;
  }

  const normalized: Record<string, number> = {};
  for (const [field, value] of Object.entries(fieldConfidence)) {
    if (Number.isFinite(value)) {
      normalized[field] = Math.min(100, Math.max(0, value));
    }
  }
  return Object.keys(normalized).length > 0 ? normalized : null;
}

function describeError(error: unknown): string {
  // Provider errors can embed request URLs/keys; keep only the message text.
  return error instanceof Error ? error.message : 'OCR provider submission failed';
}

/** Exported so the audit/extraction tests can build rows without a database. */
export function toDocumentExtraction(row: DocumentExtractionRow): DocumentExtraction {
  const confidence = row.confidence === null ? undefined : Number(row.confidence);

  return {
    id: row.id,
    agencyId: row.agency_id,
    documentId: row.document_id,
    provider: row.provider,
    extractedData: row.extracted_data ?? {},
    processingStatus: row.processing_status,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(confidence !== undefined && Number.isFinite(confidence) ? { confidence } : {}),
    ...(row.field_confidence !== null
      ? { fieldConfidence: row.field_confidence as Record<string, number> }
      : {}),
    ...(row.processed_at !== null ? { processedAt: new Date(row.processed_at) } : {}),
    ...(row.error_message !== null ? { errorMessage: row.error_message } : {}),
  };
}

export type { DocumentExtractionRow };
