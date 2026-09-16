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
  createSource,
  deleteSearch,
  deleteSearchResult,
  deleteSource,
  extractOfferFromUrl,
  listExternalOfferCaptures,
  listSearchResults,
  listSearches,
  listSources,
  moveCaptureToReview,
  publishCapture,
  publishSearchResult,
  rejectCapture,
  runSearch,
  updateExternalOfferCapture,
  type CreateExternalOfferCaptureInput,
  type CreateSourceInput,
  type RunSearchInput,
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

  // ============================================================
  // PESCADOR v2 -- multi-source search
  // ============================================================

  app.get('/pescador/sources', { preHandler: protectedHooks }, async () => {
    await requireEntitlement(database, PlatformFeature.PESCADOR);
    requireRole(UserRole.AGENT);
    const sources = await listSources(database);
    return { sources };
  });

  app.post('/pescador/sources', { preHandler: protectedHooks }, async (request, reply) => {
    await requireEntitlement(database, PlatformFeature.PESCADOR);
    requireRole(UserRole.AGENT);
    const data = parseCreateSourceInput(request.body);
    const source = await createSource(database, data);
    reply.code(201);
    return { source };
  });

  app.delete<{ Params: { id: string } }>(
    '/pescador/sources/:id',
    { preHandler: protectedHooks },
    async (request, reply) => {
      await requireEntitlement(database, PlatformFeature.PESCADOR);
      requireRole(UserRole.AGENT);
      const deleted = await deleteSource(database, request.params.id);
      if (!deleted) {
        reply.code(404);
        return { error: 'Fonte não encontrada', code: 'NOT_FOUND' };
      }
      reply.code(204);
      return null;
    }
  );

  app.get('/pescador/searches', { preHandler: protectedHooks }, async () => {
    await requireEntitlement(database, PlatformFeature.PESCADOR);
    requireRole(UserRole.AGENT);
    const searches = await listSearches(database);
    return { searches };
  });

  app.post('/pescador/searches', { preHandler: protectedHooks }, async (request, reply) => {
    await requireEntitlement(database, PlatformFeature.PESCADOR);
    requireRole(UserRole.AGENT);
    const data = parseRunSearchInput(request.body);
    const result = await runSearch(database, data, getUserId());
    reply.code(201);
    return result;
  });

  app.delete<{ Params: { id: string } }>(
    '/pescador/searches/:id',
    { preHandler: protectedHooks },
    async (request, reply) => {
      await requireEntitlement(database, PlatformFeature.PESCADOR);
      requireRole(UserRole.AGENT);
      const deleted = await deleteSearch(database, request.params.id);
      if (!deleted) {
        reply.code(404);
        return { error: 'Pesquisa não encontrada', code: 'NOT_FOUND' };
      }
      reply.code(204);
      return null;
    }
  );

  app.get<{ Params: { id: string } }>(
    '/pescador/searches/:id/results',
    { preHandler: protectedHooks },
    async (request) => {
      await requireEntitlement(database, PlatformFeature.PESCADOR);
      requireRole(UserRole.AGENT);
      const results = await listSearchResults(database, request.params.id);
      return { results };
    }
  );

  app.delete<{ Params: { id: string } }>(
    '/pescador/results/:id',
    { preHandler: protectedHooks },
    async (request, reply) => {
      await requireEntitlement(database, PlatformFeature.PESCADOR);
      requireRole(UserRole.AGENT);
      const deleted = await deleteSearchResult(database, request.params.id);
      if (!deleted) {
        reply.code(404);
        return { error: 'Resultado não encontrado', code: 'NOT_FOUND' };
      }
      reply.code(204);
      return null;
    }
  );

  app.post<{ Params: { id: string } }>(
    '/pescador/results/:id/publish',
    { preHandler: protectedHooks },
    async (request, reply) => {
      await requireEntitlement(database, PlatformFeature.PESCADOR);
      requireRole(UserRole.MANAGER);
      const result = await publishSearchResult(database, request.params.id);
      reply.code(201);
      return result;
    }
  );
}

function parseCreateSourceInput(body: unknown): CreateSourceInput {
  const record = parseObjectBody(body);
  assertAllowedFields(record, ['id', 'agencyId', 'createdAt', 'updatedAt'], ['name', 'urlTemplate']);
  return {
    name: parseRequiredString(record.name, 'name'),
    urlTemplate: parseRequiredString(record.urlTemplate, 'urlTemplate'),
  };
}

function parseRunSearchInput(body: unknown): RunSearchInput {
  const record = parseObjectBody(body);
  assertAllowedFields(
    record,
    ['id', 'agencyId', 'createdAt', 'createdByUserId'],
    ['origin', 'destination', 'departureDate', 'returnDate', 'resultsLimit'],
  );
  const data: RunSearchInput = {
    destination: parseRequiredString(record.destination, 'destination'),
    departureDate: parseRequiredDate(record.departureDate, 'departureDate'),
    resultsLimit: parseNonNegativeNumber(record.resultsLimit, 'resultsLimit'),
  };
  if (record.origin !== undefined) {
    data.origin = parseRequiredString(record.origin, 'origin');
  }
  if (record.returnDate !== undefined) {
    data.returnDate = parseRequiredDate(record.returnDate, 'returnDate');
  }
  return data;
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
