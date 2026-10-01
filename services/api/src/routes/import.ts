/**
 * Import Center API routes.
 *
 * POST   /api/import/upload          — Upload file, create import job        (ADMIN+)
 * POST   /api/import/:jobId/parse    — Parse uploaded file                   (ADMIN+)
 * POST   /api/import/:jobId/validate — Apply mapping + validate + dry run    (ADMIN+)
 * POST   /api/import/:jobId/confirm  — Confirm and execute import            (ADMIN+)
 * POST   /api/import/:jobId/cancel   — Cancel import                         (ADMIN+)
 * GET    /api/import/jobs            — List import jobs                      (MANAGER+)
 * GET    /api/import/:jobId          — Get import job details                (MANAGER+)
 *
 * Every route runs behind `protectedHooks` (authenticate → establishTenant →
 * rate limit) and then enforces a minimum role. All operations are
 * tenant-scoped. Errors propagate to the global handler (errors.ts): user
 * errors are typed (ValidationError/NotFoundError/ConflictError), anything
 * else becomes a generic 500 and is never echoed to the client.
 */

import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { requireRole } from '../../../../packages/domain/tenant-context';
import { UserRole } from '../../../../packages/domain/types';
import type { DatabaseRuntime } from '../database';
import {
  createImportJob,
  parseImportFile,
  dryRunImport,
  executeImport,
  cancelImport,
  listImportJobs,
  getImportJobById,
} from '../import/service';
import { assertMappingInUnion } from '../import/allowlist';
import { ImportEntityType, MAX_IMPORT_FILE_SIZE, MAX_IMPORT_ROWS } from '../import/types';
import type { ParsedRow } from '../import/parser';
import { NotFoundError, ValidationError } from '../errors';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;
const UNSAFE_FILENAME_PATTERN = /[/\\\u0000-\u001f]/;
const ALLOWED_FILE_EXTENSIONS = new Set(['csv', 'tsv']);

const MAX_SOURCE_SYSTEM_LENGTH = 100;
const MAX_FILENAME_LENGTH = 255;
const MAX_STORAGE_KEY_LENGTH = 500;
const MAX_MAPPING_KEYS = 200;
const MAX_MAPPING_STRING_LENGTH = 200;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/**
 * Entity types `executeImport` can write today. Narrower than the field
 * allowlist (which also lists WISH/OFFER/PROPOSAL), so keep it explicit.
 */
const SUPPORTED_ENTITY_TYPES: readonly ImportEntityType[] = [
  ImportEntityType.CUSTOMER,
  ImportEntityType.SUPPLIER,
  ImportEntityType.EMPLOYEE,
  ImportEntityType.TAG,
];

interface UploadInput {
  entityType: ImportEntityType;
  sourceSystem?: string;
  originalFilename: string;
  storageKey: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJobId(params: unknown): string {
  const jobId = isPlainObject(params) ? params['jobId'] : undefined;
  if (typeof jobId !== 'string' || !UUID_PATTERN.test(jobId)) {
    throw new ValidationError('Identificador da importação inválido');
  }
  return jobId;
}

function parseEntityType(value: unknown): ImportEntityType {
  if (typeof value !== 'string' || !(SUPPORTED_ENTITY_TYPES as readonly string[]).includes(value)) {
    throw new ValidationError(`entityType inválido. Use: ${SUPPORTED_ENTITY_TYPES.join(', ')}`);
  }
  return value as ImportEntityType;
}

function parseSourceSystem(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || value.length > MAX_SOURCE_SYSTEM_LENGTH) {
    throw new ValidationError(`sourceSystem deve ser texto de até ${MAX_SOURCE_SYSTEM_LENGTH} caracteres`);
  }
  return value;
}

function parseFilename(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_FILENAME_LENGTH) {
    throw new ValidationError(`originalFilename é obrigatório (até ${MAX_FILENAME_LENGTH} caracteres)`);
  }
  if (UNSAFE_FILENAME_PATTERN.test(value)) {
    throw new ValidationError('originalFilename não pode conter separadores de caminho');
  }
  const extension = value.includes('.') ? value.split('.').pop()?.toLowerCase() : undefined;
  if (!extension || !ALLOWED_FILE_EXTENSIONS.has(extension)) {
    throw new ValidationError('Formato de arquivo não suportado. Use CSV ou TSV.');
  }
  return value;
}

function parseStorageKey(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_STORAGE_KEY_LENGTH) {
    throw new ValidationError('storageKey é obrigatório');
  }
  return value;
}

function parseUploadFields(fields: {
  entityType: unknown;
  sourceSystem: unknown;
  originalFilename: unknown;
  storageKey: unknown;
}): UploadInput {
  const sourceSystem = parseSourceSystem(fields.sourceSystem);
  return {
    entityType: parseEntityType(fields.entityType),
    ...(sourceSystem ? { sourceSystem } : {}),
    originalFilename: parseFilename(fields.originalFilename),
    storageKey: parseStorageKey(fields.storageKey),
  };
}

function parseParseBody(body: unknown): { fileBuffer: Buffer; originalFilename: string } {
  const record = isPlainObject(body) ? body : {};
  const { fileContent } = record;
  if (typeof fileContent !== 'string' || fileContent.length === 0) {
    throw new ValidationError('Corpo da requisição deve conter fileContent (base64) e originalFilename');
  }
  if (fileContent.length % 4 !== 0 || !BASE64_PATTERN.test(fileContent)) {
    throw new ValidationError('fileContent deve ser base64 válido');
  }
  const padding = fileContent.endsWith('==') ? 2 : fileContent.endsWith('=') ? 1 : 0;
  if ((fileContent.length / 4) * 3 - padding > MAX_IMPORT_FILE_SIZE) {
    throw new ValidationError(`Arquivo excede o limite de ${MAX_IMPORT_FILE_SIZE / 1024 / 1024}MB`);
  }
  return {
    fileBuffer: Buffer.from(fileContent, 'base64'),
    originalFilename: parseFilename(record['originalFilename']),
  };
}

function parseMapping(value: unknown): Record<string, string> {
  if (!isPlainObject(value)) {
    throw new ValidationError('mapping deve ser um objeto');
  }
  const entries = Object.entries(value);
  if (entries.length > MAX_MAPPING_KEYS) {
    throw new ValidationError(`mapping excede o limite de ${MAX_MAPPING_KEYS} colunas`);
  }
  const mapping: Record<string, string> = {};
  for (const [column, target] of entries) {
    if (
      typeof target !== 'string' ||
      column.length > MAX_MAPPING_STRING_LENGTH ||
      target.length > MAX_MAPPING_STRING_LENGTH
    ) {
      throw new ValidationError('mapping deve associar colunas a campos de destino em texto');
    }
    mapping[column] = target;
  }
  return mapping;
}

function parseRows(value: unknown): ParsedRow[] {
  if (!Array.isArray(value)) {
    throw new ValidationError('parsedRows deve ser uma lista');
  }
  if (value.length > MAX_IMPORT_ROWS) {
    throw new ValidationError(`parsedRows excede o limite de ${MAX_IMPORT_ROWS} linhas`);
  }
  return value.map((row: unknown): ParsedRow => {
    if (!isPlainObject(row)) {
      throw new ValidationError('Cada item de parsedRows deve ser um objeto');
    }
    const { rowNumber, data } = row;
    if (typeof rowNumber !== 'number' || !Number.isInteger(rowNumber) || rowNumber < 1) {
      throw new ValidationError('rowNumber deve ser um inteiro positivo');
    }
    if (!isPlainObject(data)) {
      throw new ValidationError('data deve ser um objeto de texto');
    }
    const cells: Record<string, string> = {};
    for (const [column, cell] of Object.entries(data)) {
      if (typeof cell !== 'string') {
        throw new ValidationError('data deve conter apenas valores de texto');
      }
      cells[column] = cell;
    }
    return { rowNumber, data: cells };
  });
}

function parseValidateBody(body: unknown): { mapping: Record<string, string>; parsedRows: ParsedRow[] } {
  const record = isPlainObject(body) ? body : {};
  return { mapping: parseMapping(record['mapping']), parsedRows: parseRows(record['parsedRows']) };
}

function parseConfirmBody(body: unknown): ParsedRow[] {
  return parseRows(isPlainObject(body) ? body['parsedRows'] : undefined);
}

function parseNonNegativeInteger(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new ValidationError(`${field} deve ser um inteiro não negativo`);
  }
  return Number.parseInt(value, 10);
}

function parseListQuery(query: unknown): { entityType?: ImportEntityType; limit: number; offset: number } {
  const record = isPlainObject(query) ? query : {};
  const limit = parseNonNegativeInteger(record['limit'], 'limit') ?? DEFAULT_PAGE_SIZE;
  if (limit < 1 || limit > MAX_PAGE_SIZE) {
    throw new ValidationError(`limit deve estar entre 1 e ${MAX_PAGE_SIZE}`);
  }
  const offset = parseNonNegativeInteger(record['offset'], 'offset') ?? 0;
  const rawEntityType = record['entityType'];
  return {
    ...(rawEntityType === undefined || rawEntityType === ''
      ? {}
      : { entityType: parseEntityType(rawEntityType) }),
    limit,
    offset,
  };
}

/**
 * Register import routes.
 */
export function registerImportRoutes(
  app: FastifyInstance,
  options: { database: DatabaseRuntime; protectedHooks: preHandlerHookHandler[] },
  opts?: { prefix?: string },
): void {
  const { database, protectedHooks } = options;
  const prefix = opts?.prefix ?? '/api/import';

  // ============================================================
  // POST /upload — Upload file and create import job
  // ============================================================
  app.post(`${prefix}/upload`, { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.ADMIN);
    const contentType = request.headers['content-type'] ?? '';

    // Handle multipart file upload
    if (contentType.includes('multipart/form-data')) {
      const parts = request.parts();
      let entityType: string | undefined;
      let sourceSystem: string | undefined;
      let fileBuffer: Buffer | undefined;
      let originalFilename: string | undefined;

      for await (const part of parts) {
        if (part.type === 'field') {
          if (part.fieldname === 'entityType') entityType = part.value as string;
          if (part.fieldname === 'sourceSystem') sourceSystem = part.value as string;
        } else if (part.type === 'file') {
          originalFilename = part.filename;
          const chunks: Buffer[] = [];
          let totalSize = 0;

          for await (const chunk of part.file) {
            const chunkBuffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
            totalSize += chunkBuffer.length;
            if (totalSize > MAX_IMPORT_FILE_SIZE) {
              return reply.status(413).send({
                error: `Arquivo excede o limite de ${MAX_IMPORT_FILE_SIZE / 1024 / 1024}MB`,
                code: 'BODY_TOO_LARGE',
              });
            }
            chunks.push(chunkBuffer);
          }
          fileBuffer = Buffer.concat(chunks);
        }
      }

      if (!fileBuffer) {
        throw new ValidationError('Campos obrigatórios: entityType (string), file (arquivo CSV)');
      }

      // For now, store file content in memory (pilot phase)
      // In production, this would upload to Supabase Storage
      const filename = parseFilename(originalFilename);
      const input = parseUploadFields({
        entityType,
        sourceSystem,
        originalFilename: filename,
        storageKey: `imports/${Date.now()}-${Math.random().toString(36).slice(2)}/${filename}`,
      });

      reply.code(201);
      return createImportJob(database, input);
    }

    // Handle JSON body (for testing / non-multipart)
    const body = isPlainObject(request.body) ? request.body : {};
    const input = parseUploadFields({
      entityType: body['entityType'],
      sourceSystem: body['sourceSystem'],
      originalFilename: body['originalFilename'],
      storageKey: body['storageKey'],
    });

    reply.code(201);
    return createImportJob(database, input);
  });

  // ============================================================
  // POST /:jobId/parse — Parse uploaded file
  // ============================================================
  app.post(`${prefix}/:jobId/parse`, { preHandler: protectedHooks }, async (request) => {
    requireRole(UserRole.ADMIN);
    const jobId = parseJobId(request.params);

    // For pilot: file content is passed in body
    // In production: read from Supabase Storage using storageKey from job
    const { fileBuffer, originalFilename } = parseParseBody(request.body);
    return parseImportFile(database, jobId, fileBuffer, originalFilename);
  });

  // ============================================================
  // POST /:jobId/validate — Apply mapping + validate + dry run
  // ============================================================
  app.post(`${prefix}/:jobId/validate`, { preHandler: protectedHooks }, async (request) => {
    requireRole(UserRole.ADMIN);
    const jobId = parseJobId(request.params);
    const { mapping, parsedRows } = parseValidateBody(request.body);

    // F-03: reject non-allowlisted target fields against the union of
    // all entity allowlists BEFORE any tenant/DB code runs (no
    // transaction is opened for a poisoned mapping).
    assertMappingInUnion(mapping);

    return dryRunImport(database, jobId, mapping, parsedRows);
  });

  // ============================================================
  // POST /:jobId/confirm — Confirm and execute import
  // ============================================================
  app.post(`${prefix}/:jobId/confirm`, { preHandler: protectedHooks }, async (request) => {
    requireRole(UserRole.ADMIN);
    const jobId = parseJobId(request.params);
    const parsedRows = parseConfirmBody(request.body);
    return executeImport(database, jobId, parsedRows);
  });

  // ============================================================
  // POST /:jobId/cancel — Cancel import
  // ============================================================
  app.post(`${prefix}/:jobId/cancel`, { preHandler: protectedHooks }, async (request) => {
    requireRole(UserRole.ADMIN);
    const jobId = parseJobId(request.params);
    await cancelImport(database, jobId);
    return { success: true };
  });

  // ============================================================
  // GET /jobs — List import jobs
  // ============================================================
  app.get(`${prefix}/jobs`, { preHandler: protectedHooks }, async (request) => {
    requireRole(UserRole.MANAGER);
    return listImportJobs(database, parseListQuery(request.query));
  });

  // ============================================================
  // GET /:jobId — Get import job details
  // ============================================================
  app.get(`${prefix}/:jobId`, { preHandler: protectedHooks }, async (request) => {
    requireRole(UserRole.MANAGER);
    const jobId = parseJobId(request.params);
    const job = await getImportJobById(database, jobId);

    if (!job) {
      throw new NotFoundError('Importação não encontrada');
    }

    return job;
  });
}
