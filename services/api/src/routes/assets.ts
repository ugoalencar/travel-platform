/**
 * Assets -- HTTP surface for creative studio asset management.
 *
 * Registered as one unit from app.ts, same convention as
 * routes/customer-documents.ts.
 */

import type { FastifyInstance } from 'fastify';
import type { preHandlerHookHandler } from 'fastify';
import { requireRole } from '../../../../packages/domain/tenant-context';
import {
  AssetType,
  AssetSourceType,
  PlatformFeature,
  UserRole,
} from '../../../../packages/domain/types';
import type { DatabaseRuntime } from '../database';
import { ValidationError } from '../errors';
import { createAsset, listAssets, type CreateAssetInput } from '../assets';
import { requireEntitlement } from '../entitlements';
import { parseObjectBody, parseRequiredString } from '../request-parsing';

export interface AssetsRoutesOptions {
  database: DatabaseRuntime;
  protectedHooks: preHandlerHookHandler[];
}

export function registerAssetsRoutes(
  app: FastifyInstance,
  options: AssetsRoutesOptions,
): void {
  const { database, protectedHooks } = options;

  app.get('/assets', { preHandler: protectedHooks }, async () => {
    await requireEntitlement(database, PlatformFeature.CREATIVE_STUDIO);
    requireRole(UserRole.VIEWER);
    const assets = await listAssets(database);
    return { assets };
  });

  app.post('/assets', { preHandler: protectedHooks }, async (request, reply) => {
    await requireEntitlement(database, PlatformFeature.CREATIVE_STUDIO);
    requireRole(UserRole.AGENT);
    const data = parseCreateAssetInput(request.body);
    const asset = await createAsset(database, data);
    reply.code(201);
    return { asset };
  });
}

function parseCreateAssetInput(body: unknown): CreateAssetInput {
  const record = parseObjectBody(body);
  const type = parseRequiredString(record.type, 'type');
  const source = parseRequiredString(record.source, 'source');

  if (!(Object.values(AssetType) as string[]).includes(type)) {
    throw new ValidationError(
      `Field "type" must be one of: ${Object.values(AssetType).join(', ')}`,
    );
  }
  if (!(Object.values(AssetSourceType) as string[]).includes(source)) {
    throw new ValidationError(
      `Field "source" must be one of: ${Object.values(AssetSourceType).join(', ')}`,
    );
  }

  const data: CreateAssetInput = {
    type: type as AssetType,
    source: source as AssetSourceType,
  };

  if (record.storageUrl !== undefined) data.storageUrl = parseRequiredString(record.storageUrl, 'storageUrl');
  if (record.localReference !== undefined) data.localReference = parseRequiredString(record.localReference, 'localReference');
  if (record.sourceConnector !== undefined) data.sourceConnector = parseRequiredString(record.sourceConnector, 'sourceConnector');
  if (record.sourceSupplier !== undefined) data.sourceSupplier = parseRequiredString(record.sourceSupplier, 'sourceSupplier');
  if (record.sourceOriginalUrl !== undefined) data.sourceOriginalUrl = parseRequiredString(record.sourceOriginalUrl, 'sourceOriginalUrl');
  if (record.sourceLicense !== undefined) data.sourceLicense = parseRequiredString(record.sourceLicense, 'sourceLicense');
  if (record.sourceAuthor !== undefined) data.sourceAuthor = parseRequiredString(record.sourceAuthor, 'sourceAuthor');
  if (record.sourceDedupeHash !== undefined) data.sourceDedupeHash = parseRequiredString(record.sourceDedupeHash, 'sourceDedupeHash');
  if (record.sourceUsageRestrictions !== undefined) data.sourceUsageRestrictions = parseRequiredString(record.sourceUsageRestrictions, 'sourceUsageRestrictions');
  if (record.sourceCaptureId !== undefined) data.sourceCaptureId = parseRequiredString(record.sourceCaptureId, 'sourceCaptureId');
  if (record.metaTags !== undefined) {
    if (!Array.isArray(record.metaTags)) throw new ValidationError('Field "metaTags" must be an array');
    data.metaTags = record.metaTags as string[];
  }

  return data;
}
