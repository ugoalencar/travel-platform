/**
 * Proposals -- HTTP surface for proposal CRUD and lifecycle transitions.
 *
 * Registered as one unit from app.ts, same convention as
 * routes/customer-documents.ts.
 */

import type { FastifyInstance } from 'fastify';
import type { preHandlerHookHandler } from 'fastify';
import { getAgencyId, requireRole } from '../../../../packages/domain/tenant-context';
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
  createProposalSection,
  deleteProposalItem,
  deleteProposalSection,
  duplicateProposal,
  listProposalItems,
  listProposalSections,
  parseCreateProposalItemInput,
  parseCreateProposalSectionInput,
  parseUpdateProposalItemInput,
  parseUpdateProposalSectionInput,
  updateProposalItem,
  updateProposalSection,
} from '../proposal-content';
import {
  createMediaAsset,
  generateMediaAssetSecureFileKey,
  linkMediaAsset,
  listEntityMedia,
  unlinkMediaAsset,
} from '../media-library';
import { MediaAssetUsageContext, MediaAssetUsageKind } from '../../../../packages/domain/types';
import { saveFile } from '../file-storage';
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
  // Media Library links -- Proposal no longer owns its media (see
  // docs/product/MEDIA_LIBRARY.md). Images live in the central
  // media_assets table; these routes only manage which assets are
  // linked to this proposal. "Enviar nova imagem" below is a
  // convenience that uploads straight into the library and links it
  // in one step; "Selecionar da biblioteca" (POST .../media/link)
  // links an asset that already exists, uploaded once, reused by any
  // Offer/Proposal/Communication.
  // ============================================================

  app.get<{ Params: { id: string } }>(
    '/proposals/:id/media',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const media = await listEntityMedia(database, MediaAssetUsageContext.PROPOSAL, request.params.id);
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
      const titleField = file.fields.title;
      const title =
        titleField && !Array.isArray(titleField) && titleField.type === 'field'
          ? String(titleField.value)
          : file.filename;
      const isCoverField = file.fields.isCover;
      const isCover =
        isCoverField && !Array.isArray(isCoverField) && isCoverField.type === 'field'
          ? String(isCoverField.value) === 'true'
          : false;

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

      const secureFileKey = generateMediaAssetSecureFileKey(getAgencyId(), file.filename);
      await saveFile(secureFileKey, buffer);

      const asset = await createMediaAsset(database, {
        title,
        fileName: file.filename,
        fileMimeType: file.mimetype,
        fileSizeBytes: buffer.length,
        secureFileKey,
      });
      const link = await linkMediaAsset(database, {
        mediaAssetId: asset.id,
        entityType: MediaAssetUsageContext.PROPOSAL,
        entityId: request.params.id,
        usage: isCover ? MediaAssetUsageKind.COVER : MediaAssetUsageKind.GALLERY,
      });

      reply.code(201);
      return { media: { ...link, title: asset.title, mimeType: asset.mimeType, fileSizeBytes: asset.fileSizeBytes } };
    }
  );

  app.post<{ Params: { id: string } }>(
    '/proposals/:id/media/link',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.AGENT);
      const body = request.body as { mediaAssetId?: string; usage?: string } | undefined;
      if (!body?.mediaAssetId || typeof body.mediaAssetId !== 'string') {
        throw new ValidationError('Field "mediaAssetId" is required');
      }
      const usage = body.usage === 'COVER' ? MediaAssetUsageKind.COVER : MediaAssetUsageKind.GALLERY;
      const link = await linkMediaAsset(database, {
        mediaAssetId: body.mediaAssetId,
        entityType: MediaAssetUsageContext.PROPOSAL,
        entityId: request.params.id,
        usage,
      });
      reply.code(201);
      return { link };
    }
  );

  app.delete<{ Params: { linkId: string } }>(
    '/proposal-media-links/:linkId',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.AGENT);
      const deleted = await unlinkMediaAsset(database, request.params.linkId);
      if (!deleted) throw new NotFoundError('Media link not found');
      reply.code(204);
      return null;
    }
  );
}
