/**
 * Proposals -- HTTP surface for proposal CRUD and lifecycle transitions.
 *
 * Registered as one unit from app.ts, same convention as
 * routes/customer-documents.ts.
 */

import type { FastifyInstance } from 'fastify';
import type { preHandlerHookHandler } from 'fastify';
import { requireRole } from '../../../../packages/domain/tenant-context';
import { UserRole } from '../../../../packages/domain/types';
import type { DatabaseRuntime } from '../database';
import {
  acceptProposal,
  cancelProposal,
  createProposal,
  declineProposal,
  getProposalWithCustomerById,
  listProposalsWithCustomer,
  sendProposal,
  updateProposal,
} from '../proposals';
import {
  parseCreateProposalInput,
  parseUpdateProposalInput,
} from '../commercial-input-parsing';
import { NotFoundError, ValidationError } from '../errors';
import {
  createProposalItem,
  createProposalMedia,
  createProposalSection,
  deleteProposalItem,
  deleteProposalMedia,
  deleteProposalSection,
  duplicateProposal,
  generateProposalMediaSecureFileKey,
  getProposalMediaById,
  listProposalItems,
  listProposalMedia,
  listProposalSections,
  parseCreateProposalItemInput,
  parseCreateProposalSectionInput,
  parseUpdateProposalItemInput,
  parseUpdateProposalSectionInput,
  updateProposalItem,
  updateProposalSection,
} from '../proposal-content';
import { saveFile, readFile as readStoredFile } from '../file-storage';
import { validateFileSize, isBlockedFileName, MAX_ATTACHMENT_BYTES } from '../document-attachments';

export interface ProposalsRoutesOptions {
  database: DatabaseRuntime;
  protectedHooks: preHandlerHookHandler[];
}

export function registerProposalsRoutes(
  app: FastifyInstance,
  options: ProposalsRoutesOptions,
): void {
  const { database, protectedHooks } = options;

  app.get('/proposals', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.VIEWER);
    const proposals = await listProposalsWithCustomer(database);
    return { proposals };
  });

  app.get<{ Params: { id: string } }>(
    '/proposals/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const proposal = await getProposalWithCustomerById(database, request.params.id);

      if (!proposal) {
        throw new NotFoundError('Proposal not found');
      }

      return { proposal };
    }
  );

  app.post('/proposals', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.MANAGER);
    const { customerId, data } = parseCreateProposalInput(request.body);
    const proposal = await createProposal(database, customerId, data);

    reply.code(201);
    return { proposal };
  });

  app.patch<{ Params: { id: string } }>(
    '/proposals/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const data = parseUpdateProposalInput(request.body);
      const proposal = await updateProposal(database, request.params.id, data);

      if (!proposal) {
        throw new NotFoundError('Proposal not found');
      }

      return { proposal };
    }
  );

  app.post<{ Params: { id: string } }>(
    '/proposals/:id/send',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const proposal = await sendProposal(database, request.params.id);
      if (!proposal) throw new NotFoundError('Proposal not found');
      return { proposal };
    }
  );

  app.post<{ Params: { id: string } }>(
    '/proposals/:id/cancel',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const proposal = await cancelProposal(database, request.params.id);
      if (!proposal) throw new NotFoundError('Proposal not found');
      return { proposal };
    }
  );

  app.post<{ Params: { id: string } }>(
    '/proposals/:id/accept',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const proposal = await acceptProposal(database, request.params.id);
      if (!proposal) throw new NotFoundError('Proposal not found');
      return { proposal };
    }
  );

  app.post<{ Params: { id: string } }>(
    '/proposals/:id/decline',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const proposal = await declineProposal(database, request.params.id);
      if (!proposal) throw new NotFoundError('Proposal not found');
      return { proposal };
    }
  );

  // Fase 13 -- clones the proposal plus its sections/items/media (new
  // ids, always DRAFT, tenant preserved, tracking never copied).
  app.post<{ Params: { id: string } }>(
    '/proposals/:id/duplicate',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.MANAGER);
      const proposal = await duplicateProposal(database, request.params.id);
      reply.code(201);
      return { proposal };
    }
  );

  // ============================================================
  // Proposal Visual 2.0 -- content (sections/items/media)
  // ============================================================

  app.get<{ Params: { id: string } }>(
    '/proposals/:id/sections',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const sections = await listProposalSections(database, request.params.id);
      return { sections };
    }
  );

  app.post<{ Params: { id: string } }>(
    '/proposals/:id/sections',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.MANAGER);
      const data = parseCreateProposalSectionInput(request.body);
      const section = await createProposalSection(database, request.params.id, data);
      reply.code(201);
      return { section };
    }
  );

  app.patch<{ Params: { sectionId: string } }>(
    '/proposal-sections/:sectionId',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const data = parseUpdateProposalSectionInput(request.body);
      const section = await updateProposalSection(database, request.params.sectionId, data);
      if (!section) throw new NotFoundError('Proposal section not found');
      return { section };
    }
  );

  app.delete<{ Params: { sectionId: string } }>(
    '/proposal-sections/:sectionId',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.MANAGER);
      const deleted = await deleteProposalSection(database, request.params.sectionId);
      if (!deleted) throw new NotFoundError('Proposal section not found');
      reply.code(204);
      return null;
    }
  );

  app.get<{ Params: { sectionId: string } }>(
    '/proposal-sections/:sectionId/items',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const items = await listProposalItems(database, request.params.sectionId);
      return { items };
    }
  );

  app.post<{ Params: { sectionId: string } }>(
    '/proposal-sections/:sectionId/items',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.MANAGER);
      const data = parseCreateProposalItemInput(request.body);
      const item = await createProposalItem(database, request.params.sectionId, data);
      reply.code(201);
      return { item };
    }
  );

  app.patch<{ Params: { itemId: string } }>(
    '/proposal-items/:itemId',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const data = parseUpdateProposalItemInput(request.body);
      const item = await updateProposalItem(database, request.params.itemId, data);
      if (!item) throw new NotFoundError('Proposal item not found');
      return { item };
    }
  );

  app.delete<{ Params: { itemId: string } }>(
    '/proposal-items/:itemId',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.MANAGER);
      const deleted = await deleteProposalItem(database, request.params.itemId);
      if (!deleted) throw new NotFoundError('Proposal item not found');
      reply.code(204);
      return null;
    }
  );

  // ============================================================
  // Proposal Visual 2.0 -- media (cover + gallery), same
  // multipart-upload/secure_file_key pattern as trips.ts's photo route.
  // ============================================================

  app.get<{ Params: { id: string } }>(
    '/proposals/:id/media',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const media = await listProposalMedia(database, request.params.id);
      return { media };
    }
  );

  app.post<{ Params: { id: string } }>(
    '/proposals/:id/media',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.MANAGER);

      const file = await request.file();
      if (!file) {
        throw new ValidationError('A file is required');
      }
      const captionField = file.fields.caption;
      const caption =
        captionField && !Array.isArray(captionField) && captionField.type === 'field'
          ? String(captionField.value)
          : undefined;
      const isCoverField = file.fields.isCover;
      const isCover =
        isCoverField && !Array.isArray(isCoverField) && isCoverField.type === 'field'
          ? String(isCoverField.value) === 'true'
          : undefined;

      let buffer: Buffer;
      try {
        buffer = await file.toBuffer();
      } catch (error: unknown) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'FST_REQ_FILE_TOO_LARGE') {
          throw new ValidationError(`File size must be between 1 byte and ${MAX_ATTACHMENT_BYTES} bytes`);
        }
        throw error;
      }
      if (isBlockedFileName(file.filename)) {
        throw new ValidationError('File type is not permitted');
      }
      if (!validateFileSize(buffer.length)) {
        throw new ValidationError(`File size must be between 1 byte and ${MAX_ATTACHMENT_BYTES} bytes`);
      }

      const secureFileKey = generateProposalMediaSecureFileKey(request.params.id, file.filename);
      await saveFile(secureFileKey, buffer);

      const media = await createProposalMedia(database, request.params.id, {
        fileName: file.filename,
        fileMimeType: file.mimetype,
        fileSizeBytes: buffer.length,
        secureFileKey,
        ...(caption ? { caption } : {}),
        ...(isCover !== undefined ? { isCover } : {}),
      });

      reply.code(201);
      return { media };
    }
  );

  app.delete<{ Params: { mediaId: string } }>(
    '/proposal-media/:mediaId',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.MANAGER);
      const deleted = await deleteProposalMedia(database, request.params.mediaId);
      if (!deleted) throw new NotFoundError('Proposal media not found');
      reply.code(204);
      return null;
    }
  );

  app.get<{ Params: { mediaId: string } }>(
    '/proposal-media/:mediaId/download',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.VIEWER);
      const media = await getProposalMediaById(database, request.params.mediaId);
      if (!media) throw new NotFoundError('Proposal media not found');
      const content = await readStoredFile(media.secureFileKey);
      reply.header('Content-Disposition', `inline; filename="${encodeURIComponent(media.fileName)}"`);
      reply.type(media.fileMimeType);
      return reply.send(content);
    }
  );
}
