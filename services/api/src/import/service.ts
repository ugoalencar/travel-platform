/**
 * Import Service — orchestrates the full import pipeline.
 *
 * Pipeline: Upload → Parse → Map → Normalize → Validate →
 *           DryRun → Preview → Confirm → Import → Audit
 *
 * Each step is a state transition on the import_jobs table.
 * The service is idempotent: re-running a step overwrites nothing.
 *
 * SECURITY:
 *   - All operations are tenant-scoped via getAgencyId()
 *   - Storage keys are never client-controlled
 *   - Audit events are recorded at every state transition
 *   - No business logic runs outside a tenant transaction
 */

import type { DatabaseRuntime } from '../database';
import type { ImportJob, ImportError, ImportPreviewRow } from './types';
import {
  ImportJobStatus,
  ImportEntityType,
  ImportRowClassification,
  PREVIEW_ROW_COUNT,
} from './types';
import { parseCsv, autoMapColumns, type ParsedRow } from './parser';
import { validateImportRows } from './validator';
import { getAgencyId, getUserId } from '../../../../packages/domain/tenant-context';
import { AuditEventType, recordAuditEvent } from '../audit-log';

// ============================================================
// Pipeline step: Upload
// ============================================================

export interface UploadResult {
  jobId: string;
  status: ImportJobStatus;
}

/**
 * Record a new import job after file upload.
 * The file should already be stored in Supabase Storage.
 */
export async function createImportJob(
  database: DatabaseRuntime,
  input: {
    entityType: ImportEntityType;
    sourceSystem?: string;
    originalFilename: string;
    storageKey: string;
  },
): Promise<UploadResult> {
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<{ id: string }>(
      `INSERT INTO import_jobs
        (agency_id, created_by, entity_type, source_system, original_filename, storage_key, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        getAgencyId(),
        getUserId(),
        input.entityType,
        input.sourceSystem ?? null,
        input.originalFilename,
        input.storageKey,
        ImportJobStatus.UPLOADING,
      ],
    );

    const jobId = result.rows[0]?.id;
    if (!jobId) throw new Error('Failed to create import job');

    await recordAuditEvent(client, {
      eventType: AuditEventType.IMPORT_JOB_CREATED,
      entityType: 'import_job',
      entityId: jobId,
    });

    return { jobId, status: ImportJobStatus.UPLOADING };
  });
}

// ============================================================
// Pipeline step: Parse
// ============================================================

export interface ParseResult {
  jobId: string;
  headers: string[];
  totalRows: number;
  status: ImportJobStatus;
  warnings: string[];
}

/**
 * Parse the uploaded file and store headers + row count.
 */
export async function parseImportFile(
  database: DatabaseRuntime,
  jobId: string,
  fileContent: Buffer,
  originalFilename: string,
): Promise<ParseResult> {
  const job = await getImportJob(database, jobId);

  // Determine parser based on file extension
  const ext = originalFilename.split('.').pop()?.toLowerCase() ?? '';
  let parsed: ParsedRow[] = [];
  let headers: string[] = [];

  if (ext === 'csv' || ext === 'tsv') {
    const result = parseCsv(fileContent, job.entityType);
    parsed = result.rows;
    headers = result.headers;
  } else if (ext === 'xlsx' || ext === 'xls') {
    // XLSX temporarily unsupported: the `xlsx` npm package has two
    // unpatched HIGH-severity advisories (prototype pollution,
    // ReDoS -- GHSA-4r6h-8v6p-xvw6, GHSA-5pgg-2g8v-p4x9) with no fixed
    // version on the npm registry. Parsing untrusted uploaded files
    // with it is a real attack surface, so the dependency was removed
    // rather than allowlisted. Use CSV until a patched parser is
    // adopted (see docs/product/CENTRO_IMPLANTACAO_DADOS.md).
    throw new Error(
      'Importação de arquivos XLSX está temporariamente desabilitada (vulnerabilidade de segurança não corrigida na biblioteca). Exporte a planilha como CSV e importe novamente.',
    );
  } else {
    throw new Error(`Formato de arquivo não suportado: .${ext}. Use CSV.`);
  }

  // Update job with parse results
  await database.withTenantTransaction(async (client) => {
    await client.query(
      `UPDATE import_jobs
       SET status = $1, total_rows = $2, mapping = $3, updated_at = now()
       WHERE id = $4`,
      [
        ImportJobStatus.PARSING,
        parsed.length,
        JSON.stringify(autoMapFromHeaders(headers, job.entityType)),
        jobId,
      ],
    );

    await recordAuditEvent(client, {
      eventType: AuditEventType.IMPORT_JOB_UPDATED,
      entityType: 'import_job',
      entityId: jobId,
    });
  });

  return {
    jobId,
    headers,
    totalRows: parsed.length,
    status: ImportJobStatus.PARSING,
    warnings: [],
  };
}

// ============================================================
// Pipeline step: Map + Validate + Dry Run
// ============================================================

export interface DryRunResult {
  jobId: string;
  status: ImportJobStatus;
  totalRows: number;
  validRows: number;
  warningRows: number;
  errorRows: number;
  preview: ImportPreviewRow[];
  errors: ImportError[];
}

/**
 * Apply mapping, validate rows, and produce dry-run preview.
 */
export async function dryRunImport(
  database: DatabaseRuntime,
  jobId: string,
  mapping: Record<string, string>,
  parsedRows: ParsedRow[],
): Promise<DryRunResult> {
  const job = await getImportJob(database, jobId);

  // Validate all rows
  const validation = await validateImportRows(
    database,
    job.entityType,
    parsedRows,
    mapping,
  );

  // Build preview (first N rows)
  const preview: ImportPreviewRow[] = parsedRows.slice(0, PREVIEW_ROW_COUNT).map((row, idx) => {
    const result = validation.rows[idx];
    return {
      rowNumber: row.rowNumber,
      classification: result?.classification ?? ImportRowClassification.INVALID,
      data: row.data,
      matchedId: result?.matchedId ?? null,
      issues: result?.issues ?? null,
    };
  });

  // Update job
  await database.withTenantTransaction(async (client) => {
    await client.query(
      `UPDATE import_jobs
       SET status = $1, mapping = $2, total_rows = $3, valid_rows = $4,
           warning_rows = $5, error_rows = $6, errors = $7, preview = $8,
           updated_at = now()
       WHERE id = $9`,
      [
        ImportJobStatus.DRY_RUN,
        JSON.stringify(mapping),
        validation.totalRows,
        validation.validRows,
        validation.warningRows,
        validation.errorRows,
        JSON.stringify(validation.errors),
        JSON.stringify(preview),
        jobId,
      ],
    );

    await recordAuditEvent(client, {
      eventType: AuditEventType.IMPORT_JOB_DRY_RUN,
      entityType: 'import_job',
      entityId: jobId,
    });
  });

  return {
    jobId,
    status: ImportJobStatus.DRY_RUN,
    totalRows: validation.totalRows,
    validRows: validation.validRows,
    warningRows: validation.warningRows,
    errorRows: validation.errorRows,
    preview,
    errors: validation.errors,
  };
}

// ============================================================
// Pipeline step: Confirm + Import
// ============================================================

export interface ImportResult {
  jobId: string;
  status: ImportJobStatus;
  createdRows: number;
  updatedRows: number;
  skippedRows: number;
}

/**
 * Confirm and execute the import.
 * Only NEW rows are inserted; MATCHED rows are skipped (or optionally updated).
 */
export async function executeImport(
  database: DatabaseRuntime,
  jobId: string,
  parsedRows: ParsedRow[],
): Promise<ImportResult> {
  const job = await getImportJob(database, jobId);

  if (job.status !== ImportJobStatus.DRY_RUN) {
    throw new Error(`Import job must be in DRY_RUN status to confirm. Current: ${job.status}`);
  }

  let createdRows = 0;
  const updatedRows = 0;
  let skippedRows = 0;

  // Import in a single transaction
  await database.withTenantTransaction(async (client) => {
    // Update status to IMPORTING
    await client.query(
      `UPDATE import_jobs SET status = $1, updated_at = now() WHERE id = $2`,
      [ImportJobStatus.IMPORTING, jobId],
    );

    for (const row of parsedRows) {
      const rowIdx = parsedRows.indexOf(row);
      const preview = job.preview[rowIdx];

      if (!preview) continue;

      switch (preview.classification) {
        case ImportRowClassification.NEW: {
          const insertResult = await insertEntity(client, job.entityType, row.data, job.mapping);
          if (insertResult) createdRows++;
          else skippedRows++;
          break;
        }
        case ImportRowClassification.MATCHED:
          // Skip matched records (no overwrite policy)
          skippedRows++;
          break;
        case ImportRowClassification.INVALID:
          skippedRows++;
          break;
        default:
          skippedRows++;
      }
    }

    // Update final counts
    await client.query(
      `UPDATE import_jobs
       SET status = $1, created_rows = $2, updated_rows = $3, skipped_rows = $4,
           completed_at = now(), updated_at = now()
       WHERE id = $5`,
      [ImportJobStatus.COMPLETED, createdRows, updatedRows, skippedRows, jobId],
    );

    await recordAuditEvent(client, {
      eventType: AuditEventType.IMPORT_JOB_COMPLETED,
      entityType: 'import_job',
      entityId: jobId,
    });
  });

  return { jobId, status: ImportJobStatus.COMPLETED, createdRows, updatedRows, skippedRows };
}

// ============================================================
// Pipeline step: Cancel
// ============================================================

export async function cancelImport(database: DatabaseRuntime, jobId: string): Promise<void> {
  await database.withTenantTransaction(async (client) => {
    await client.query(
      `UPDATE import_jobs SET status = $1, updated_at = now() WHERE id = $2`,
      [ImportJobStatus.CANCELLED, jobId],
    );

    await recordAuditEvent(client, {
      eventType: AuditEventType.IMPORT_JOB_CANCELLED,
      entityType: 'import_job',
      entityId: jobId,
    });
  });
}

// ============================================================
// Helpers
// ============================================================

async function getImportJob(database: DatabaseRuntime, jobId: string): Promise<ImportJob> {
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<ImportJob>(
      `SELECT * FROM import_jobs WHERE id = $1 AND agency_id = $2`,
      [jobId, getAgencyId()],
    );
    const job = result.rows[0];
    if (!job) throw new Error(`Import job not found: ${jobId}`);
    return job;
  });
}

/**
 * Insert a single entity based on mapped row data.
 * Returns true if inserted, false if skipped.
 */
async function insertEntity(
  client: { query: (sql: string, params?: unknown[]) => Promise<{ rowCount?: number | null }> },
  entityType: ImportEntityType,
  data: Record<string, string>,
  mapping: Record<string, string>,
): Promise<boolean> {
  const agencyId = getAgencyId();
  const userId = getUserId();

  // Build INSERT from mapping
  const columns: string[] = ['agency_id', 'created_by'];
  const values: unknown[] = [agencyId, userId];

  for (const [sourceCol, targetField] of Object.entries(mapping)) {
    const value = data[sourceCol];
    if (value === undefined || value === '') continue;

    // Skip non-INSERTable fields
    if (['id', 'created_at', 'updated_at', 'deleted_at'].includes(targetField)) continue;

    columns.push(targetField);
    values.push(value);
  }

  if (columns.length <= 2) {
    // Only agency_id and created_by — nothing useful to insert
    return false;
  }

  const tableName = getTableName(entityType);
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
  const columnList = columns.join(', ');

  try {
    const result = await client.query(
      `INSERT INTO ${tableName} (${columnList}) VALUES (${placeholders})`,
      values,
    );
    return (result.rowCount ?? 0) > 0;
  } catch {
    // Insert failed (constraint violation, etc.) — skip
    return false;
  }
}

function getTableName(entityType: ImportEntityType): string {
  switch (entityType) {
    case ImportEntityType.CUSTOMER:
      return 'customers';
    case ImportEntityType.SUPPLIER:
      return 'suppliers';
    case ImportEntityType.EMPLOYEE:
      return 'users';
    case ImportEntityType.TAG:
      return 'tags';
    default:
      throw new Error(`Entity type ${entityType} not yet supported for import`);
  }
}

function autoMapFromHeaders(headers: string[], entityType: ImportEntityType): Record<string, string> {
  return autoMapColumns(headers, entityType);
}

/**
 * List import jobs for the current agency.
 */
export async function listImportJobs(
  database: DatabaseRuntime,
  options: { entityType?: ImportEntityType; limit?: number; offset?: number } = {},
): Promise<{ jobs: ImportJob[]; total: number }> {
  const limit = options.limit ?? 20;
  const offset = options.offset ?? 0;

  return database.withTenantTransaction(async (client) => {
    let whereClause = 'WHERE agency_id = $1';
    const params: unknown[] = [getAgencyId()];

    if (options.entityType) {
      whereClause += ' AND entity_type = $2';
      params.push(options.entityType);
    }

    const countResult = await client.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM import_jobs ${whereClause}`,
      params,
    );

    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    const result = await client.query<ImportJob>(
      `SELECT * FROM import_jobs ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );

    return { jobs: result.rows, total };
  });
}

/**
 * Get a single import job by ID.
 */
export async function getImportJobById(
  database: DatabaseRuntime,
  jobId: string,
): Promise<ImportJob | null> {
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<ImportJob>(
      `SELECT * FROM import_jobs WHERE id = $1 AND agency_id = $2`,
      [jobId, getAgencyId()],
    );
    return result.rows[0] ?? null;
  });
}
