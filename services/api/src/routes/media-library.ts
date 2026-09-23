/**
 * Media Library -- HTTP surface for the central, agency-owned asset
 * library. See docs/product/MEDIA_LIBRARY.md.
 *
 * Registered as one unit from app.ts, same convention as
 * routes/proposals.ts.
 */

import type { FastifyInstance } from 'fastify';
import type { preHandlerHookHandler } from 'fastify';
import { getAgencyId, requireRole } from '../../../../packages/domain/tenant-context';
import { UserRole, MediaAssetStatus } from '../../../../packages/domain/types';
import type { DatabaseRuntime } from '../database';
import {
  archiveMediaAsset,
  createMediaAsset,
  deleteMediaAsset,
  generateMediaAssetSecureFileKey,
  getMediaAssetById,
  getMediaAssetUsage,
  listMediaAssets,
  updateMediaAsset,
} from '../media-library';
import { saveFile, readFile as readStoredFile } from '../storage';
import { validateFileSize, isBlockedFileName, MAX_ATTACHMENT_BYTES } from '../document-attachments';
import { NotFoundError, ValidationError } from '../errors';

export interface MediaLibraryRoutesOptions {
  database: DatabaseRuntime;
  protectedHooks: preHandlerHookHandler[];
}

function readField(fields: Record<string, unknown>, name: string): string | undefined {
  const field = fields[name];
  if (!field || Array.isArray(field)) return undefined;
  const typed = field as { type: string; value: unknown };
  return typed.type === 'field' ? String(typed.value) : undefined;
}

export function registerMediaLibraryRoutes(app: FastifyInstance, options: MediaLibraryRoutesOptions): void {
  const { database, protectedHooks } = options;

  app.get<{ Querystring: { search?: string; tag?: string; status?: string } }>(
    '/media-assets',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const { search, tag, status } = request.query;
      const assets = await listMediaAssets(database, {
        ...(search ? { search } : {}),
        ...(tag ? { tag } : {}),
        ...(status === 'ARCHIVED' ? { status: MediaAssetStatus.ARCHIVED } : {}),
      });
      return { assets };
    }
  );

  app.post('/media-assets', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.MANAGER);

    const file = await request.file();
    if (!file) {
      throw new ValidationError('A file is required');
    }
    const title = readField(file.fields, 'title') ?? file.filename;
    const description = readField(file.fields, 'description');
    const altText = readField(file.fields, 'altText');
    const tagsRaw = readField(file.fields, 'tags');
    const tags = tagsRaw
      ? tagsRaw.split(',').map((t) => t.trim()).filter((t) => t.length > 0)
      : [];

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
      ...(description ? { description } : {}),
      ...(altText ? { altText } : {}),
      tags,
    });

    reply.code(201);
    return { asset };
  });

  app.get<{ Params: { id: string } }>('/media-assets/:id', { preHandler: protectedHooks }, async (request) => {
    requireRole(UserRole.VIEWER);
    const asset = await getMediaAssetById(database, request.params.id);
    if (!asset) throw new NotFoundError('Media asset not found');
    return { asset };
  });

  app.patch<{ Params: { id: string } }>(
    '/media-assets/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const body = request.body as
        | { title?: string; description?: string; altText?: string; tags?: string[] }
        | undefined;
      if (!body || typeof body !== 'object') {
        throw new ValidationError('Request body must be an object');
      }
      const asset = await updateMediaAsset(database, request.params.id, body);
      if (!asset) throw new NotFoundError('Media asset not found');
      return { asset };
    }
  );

  app.post<{ Params: { id: string } }>(
    '/media-assets/:id/archive',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const asset = await archiveMediaAsset(database, request.params.id);
      if (!asset) throw new NotFoundError('Media asset not found');
      return { asset };
    }
  );

  app.delete<{ Params: { id: string } }>(
    '/media-assets/:id',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.MANAGER);
      const deleted = await deleteMediaAsset(database, request.params.id);
      if (!deleted) throw new NotFoundError('Media asset not found');
      reply.code(204);
      return null;
    }
  );

  app.get<{ Params: { id: string } }>(
    '/media-assets/:id/usage',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const usage = await getMediaAssetUsage(database, request.params.id);
      return { usage };
    }
  );

  app.get<{ Params: { id: string } }>(
    '/media-assets/:id/download',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.VIEWER);
      const asset = await getMediaAssetById(database, request.params.id);
      if (!asset) throw new NotFoundError('Media asset not found');
      const content = await readStoredFile(asset.secureFileKey);
      reply.header('Content-Disposition', `inline; filename="${encodeURIComponent(asset.title)}"`);
      reply.type(asset.mimeType);
      return reply.send(content);
    }
  );
}
