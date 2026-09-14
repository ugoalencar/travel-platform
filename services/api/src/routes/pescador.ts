/**
 * Pescador -- external offer capture, extraction, review, approve, reject, publish.
 */

import type { FastifyInstance } from 'fastify';
import type { preHandlerHookHandler } from 'fastify';
import { getUserId, requireRole } from '../../../../packages/domain/tenant-context';
import { PlatformFeature, UserRole } from '../../../../packages/domain/types';
import type { DatabaseRuntime } from '../database';
import { requireEntitlement } from '../entitlements';
import {
  assertAllowedFields,
  parseNonNegativeNumber,
  parseObjectBody,
  parseRequiredDate,
  parseRequiredString,
} from '../request-parsing';
import {
  approveCapture,
  createExternalOfferCapture,
  extractOfferFromUrl,
  listExternalOfferCaptures,
  moveCaptureToReview,
  publishCapture,
  rejectCapture,
  updateExternalOfferCapture,
  type CreateExternalOfferCaptureInput,
  type UpdateExternalOfferCaptureInput,
} from '../pescador';

export interface PescadorRoutesOptions {
  database: DatabaseRuntime;
  protectedHooks: preHandlerHookHandler[];
}

export function registerPescadorRoutes(
  app: FastifyInstance,
  options: PescadorRoutesOptions,
): void {
  const { database, protectedHooks } = options;

  app.get('/pescador/captures', { preHandler: protectedHooks }, async () => {
    await requireEntitlement(database, PlatformFeature.PESCADOR);
    requireRole(UserRole.AGENT);
    const captures = await listExternalOfferCaptures(database);
    return { captures };
  });

  app.post('/pescador/captures', { preHandler: protectedHooks }, async (request, reply) => {
    await requireEntitlement(database, PlatformFeature.PESCADOR);
    requireRole(UserRole.AGENT);
    const data = parseCreateExternalOfferCaptureInput(request.body);
    const capture = await createExternalOfferCapture(database, data);
    reply.code(201);
    return { capture };
  });

  app.patch<{ Params: { id: string } }>(
    '/pescador/captures/:id',
    { preHandler: protectedHooks },
    async (request) => {
      await requireEntitlement(database, PlatformFeature.PESCADOR);
      requireRole(UserRole.AGENT);
      const patch = parseUpdateExternalOfferCaptureInput(request.body);
      const capture = await updateExternalOfferCapture(database, request.params.id, patch);
      return { capture };
    }
  );

  app.post('/pescador/extract', { preHandler: protectedHooks }, async (request) => {
    await requireEntitlement(database, PlatformFeature.PESCADOR);
    requireRole(UserRole.AGENT);
    const record = parseObjectBody(request.body);
    const url = parseRequiredString(record.url, 'url');
    const draft = await extractOfferFromUrl(url);
    return { draft };
  });

  app.post<{ Params: { id: string } }>(
    '/pescador/captures/:id/review',
    { preHandler: protectedHooks },
    async (request) => {
      await requireEntitlement(database, PlatformFeature.PESCADOR);
      requireRole(UserRole.MANAGER);
      const capture = await moveCaptureToReview(database, request.params.id, getUserId());
      return { capture };
    }
  );

  app.post<{ Params: { id: string } }>(
    '/pescador/captures/:id/approve',
    { preHandler: protectedHooks },
    async (request) => {
      await requireEntitlement(database, PlatformFeature.PESCADOR);
      requireRole(UserRole.MANAGER);
      const capture = await approveCapture(database, request.params.id, getUserId());
      return { capture };
    }
  );

  app.post<{ Params: { id: string } }>(
    '/pescador/captures/:id/reject',
    { preHandler: protectedHooks },
    async (request) => {
      await requireEntitlement(database, PlatformFeature.PESCADOR);
      requireRole(UserRole.MANAGER);
      const capture = await rejectCapture(database, request.params.id, getUserId());
      return { capture };
    }
  );

  app.post<{ Params: { id: string } }>(
    '/pescador/captures/:id/publish',
    { preHandler: protectedHooks },
    async (request, reply) => {
      await requireEntitlement(database, PlatformFeature.PESCADOR);
      requireRole(UserRole.ADMIN);
      const result = await publishCapture(database, request.params.id, getUserId());
      reply.code(201);
      return result;
    }
  );
}

// ============================================================
// Parsers
// ============================================================

function parseCreateExternalOfferCaptureInput(body: unknown): CreateExternalOfferCaptureInput {
  const record = parseObjectBody(body);
  const allowed = [
    'sourceUrl',
    'sourceName',
    'rawContent',
    'normalizedTitle',
    'normalizedDescription',
    'foundPrice',
    'currency',
    'validUntil',
  ] as const;
  assertAllowedFields(
    record,
    [
      'agencyId',
      'tenantId',
      'id',
      'status',
      'reviewedAt',
      'reviewedByUserId',
      'publishedOfferId',
      'createdAt',
      'updatedAt',
    ],
    allowed
  );

  const data: CreateExternalOfferCaptureInput = {
    sourceUrl: parseRequiredString(record.sourceUrl, 'sourceUrl'),
    sourceName: parseRequiredString(record.sourceName, 'sourceName'),
    rawContent: parseRequiredString(record.rawContent, 'rawContent'),
  };

  if (record.normalizedTitle !== undefined) {
    data.normalizedTitle = parseRequiredString(record.normalizedTitle, 'normalizedTitle');
  }
  if (record.normalizedDescription !== undefined) {
    data.normalizedDescription = parseRequiredString(
      record.normalizedDescription,
      'normalizedDescription'
    );
  }
  if (record.foundPrice !== undefined) {
    data.foundPrice = parseNonNegativeNumber(record.foundPrice, 'foundPrice');
  }
  if (record.currency !== undefined) {
    data.currency = parseRequiredString(record.currency, 'currency');
  }
  if (record.validUntil !== undefined) {
    data.validUntil = parseRequiredDate(record.validUntil, 'validUntil');
  }

  return data;
}

function parseUpdateExternalOfferCaptureInput(body: unknown): UpdateExternalOfferCaptureInput {
  const record = parseObjectBody(body);
  const allowed = ['normalizedTitle', 'normalizedDescription', 'foundPrice', 'currency', 'validUntil'] as const;
  assertAllowedFields(
    record,
    [
      'agencyId',
      'tenantId',
      'id',
      'sourceUrl',
      'sourceName',
      'rawContent',
      'status',
      'reviewedAt',
      'reviewedByUserId',
      'publishedOfferId',
      'createdAt',
      'updatedAt',
    ],
    allowed
  );

  const data: UpdateExternalOfferCaptureInput = {};
  if (record.normalizedTitle !== undefined) {
    data.normalizedTitle = parseRequiredString(record.normalizedTitle, 'normalizedTitle');
  }
  if (record.normalizedDescription !== undefined) {
    data.normalizedDescription = parseRequiredString(record.normalizedDescription, 'normalizedDescription');
  }
  if (record.foundPrice !== undefined) {
    data.foundPrice = parseNonNegativeNumber(record.foundPrice, 'foundPrice');
  }
  if (record.currency !== undefined) {
    data.currency = parseRequiredString(record.currency, 'currency');
  }
  if (record.validUntil !== undefined) {
    data.validUntil = record.validUntil === null ? null : parseRequiredDate(record.validUntil, 'validUntil');
  }
  return data;
}
