/**
 * Import Center API routes.
 *
 * POST   /api/import/upload          — Upload file, create import job
 * POST   /api/import/:jobId/parse    — Parse uploaded file
 * POST   /api/import/:jobId/validate — Apply mapping + validate + dry run
 * POST   /api/import/:jobId/confirm  — Confirm and execute import
 * POST   /api/import/:jobId/cancel   — Cancel import
 * GET    /api/import/jobs            — List import jobs
 * GET    /api/import/:jobId          — Get import job details
 *
 * All routes require staff authentication (getAgencyId() + getUserId()).
 * All operations are tenant-scoped.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { DatabaseRuntime } from '../database';
import type { ImportEntityType } from '../import/types';
import {
  createImportJob,
  parseImportFile,
  dryRunImport,
  executeImport,
  cancelImport,
  listImportJobs,
  getImportJobById,
} from '../import/service';
import { MAX_IMPORT_FILE_SIZE } from '../import/types';

/**
 * Register import routes.
 */
export function registerImportRoutes(
  app: FastifyInstance,
  options: { database: DatabaseRuntime; protectedHooks?: unknown },
  opts?: { prefix?: string },
): void {
  const database = options.database;
  const prefix = opts?.prefix ?? '/api/import';

  // ============================================================
  // POST /upload — Upload file and create import job
  // ============================================================
  app.post(`${prefix}/upload`, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
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
                });
              }
              chunks.push(chunkBuffer);
            }
            fileBuffer = Buffer.concat(chunks);
          }
        }

        if (!entityType || !fileBuffer || !originalFilename) {
          return reply.status(400).send({
            error: 'Campos obrigatórios: entityType (string), file (arquivo CSV/XLSX)',
          });
        }

        // Validate entity type
        const validEntityTypes = ['CUSTOMER', 'SUPPLIER', 'EMPLOYEE', 'TAG'];
        if (!validEntityTypes.includes(entityType)) {
          return reply.status(400).send({
            error: `entityType inválido: ${entityType}. Use: ${validEntityTypes.join(', ')}`,
          });
        }

        // For now, store file content in memory (pilot phase)
        // In production, this would upload to Supabase Storage
        const storageKey = `imports/${Date.now()}-${Math.random().toString(36).slice(2)}/${originalFilename}`;

        const result = await createImportJob(database, {
          entityType: entityType as ImportEntityType,
          ...(sourceSystem ? { sourceSystem } : {}),
          originalFilename,
          storageKey,
        });

        return reply.status(201).send(result);
      }

      // Handle JSON body (for testing / non-multipart)
      const body = request.body as {
        entityType?: string;
        sourceSystem?: string;
        originalFilename?: string;
        storageKey?: string;
      };

      if (!body.entityType || !body.originalFilename || !body.storageKey) {
        return reply.status(400).send({
          error: 'Campos obrigatórios: entityType, originalFilename, storageKey',
        });
      }

      const result = await createImportJob(database, {
        entityType: body.entityType as ImportEntityType,
        ...(body.sourceSystem ? { sourceSystem: body.sourceSystem } : {}),
        originalFilename: body.originalFilename,
        storageKey: body.storageKey,
      });

      return reply.status(201).send(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao criar import job';
      return reply.status(500).send({ error: message });
    }
  });

  // ============================================================
  // POST /:jobId/parse — Parse uploaded file
  // ============================================================
  app.post(`${prefix}/:jobId/parse`, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { jobId } = request.params as { jobId: string };

      // For pilot: file content is passed in body
      // In production: read from Supabase Storage using storageKey from job
      const body = request.body as { fileContent?: string; originalFilename?: string };

      if (!body.fileContent || !body.originalFilename) {
        return reply.status(400).send({
          error: 'Corpo da requisição deve conter fileContent (base64) e originalFilename',
        });
      }

      const fileBuffer = Buffer.from(body.fileContent, 'base64');
      const result = await parseImportFile(database, jobId, fileBuffer, body.originalFilename);

      return reply.send(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao processar arquivo';
      return reply.status(500).send({ error: message });
    }
  });

  // ============================================================
  // POST /:jobId/validate — Apply mapping + validate + dry run
  // ============================================================
  app.post(`${prefix}/:jobId/validate`, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { jobId } = request.params as { jobId: string };
      const body = request.body as {
        mapping?: Record<string, string>;
        parsedRows?: { rowNumber: number; data: Record<string, string> }[];
      };

      if (!body.mapping || !body.parsedRows) {
        return reply.status(400).send({
          error: 'Corpo da requisição deve conter mapping (object) e parsedRows (array)',
        });
      }

      const result = await dryRunImport(database, jobId, body.mapping, body.parsedRows);

      return reply.send(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro na validação';
      return reply.status(500).send({ error: message });
    }
  });

  // ============================================================
  // POST /:jobId/confirm — Confirm and execute import
  // ============================================================
  app.post(`${prefix}/:jobId/confirm`, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { jobId } = request.params as { jobId: string };
      const body = request.body as { parsedRows?: { rowNumber: number; data: Record<string, string> }[] };

      if (!body.parsedRows) {
        return reply.status(400).send({
          error: 'Corpo da requisição deve conter parsedRows (array)',
        });
      }

      const result = await executeImport(database, jobId, body.parsedRows);

      return reply.send(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao executar importação';
      return reply.status(500).send({ error: message });
    }
  });

  // ============================================================
  // POST /:jobId/cancel — Cancel import
  // ============================================================
  app.post(`${prefix}/:jobId/cancel`, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { jobId } = request.params as { jobId: string };
      await cancelImport(database, jobId);
      return reply.send({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao cancelar importação';
      return reply.status(500).send({ error: message });
    }
  });

  // ============================================================
  // GET /jobs — List import jobs
  // ============================================================
  app.get(`${prefix}/jobs`, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as {
        entityType?: string;
        limit?: string;
        offset?: string;
      };

      const result = await listImportJobs(database, {
        ...(query.entityType ? { entityType: query.entityType as ImportEntityType } : {}),
        ...(query.limit ? { limit: parseInt(query.limit, 10) } : {}),
        ...(query.offset ? { offset: parseInt(query.offset, 10) } : {}),
      });

      return reply.send(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao listar importações';
      return reply.status(500).send({ error: message });
    }
  });

  // ============================================================
  // GET /:jobId — Get import job details
  // ============================================================
  app.get(`${prefix}/:jobId`, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { jobId } = request.params as { jobId: string };
      const job = await getImportJobById(database, jobId);

      if (!job) {
        return reply.status(404).send({ error: 'Import job não encontrado' });
      }

      return reply.send(job);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao buscar importação';
      return reply.status(500).send({ error: message });
    }
  });
}
