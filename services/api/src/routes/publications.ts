/**
 * Publications -- HTTP surface for social publishing CRUD, snapshots, and status transitions.
 *
 * Registered as one unit from app.ts, same convention as
 * routes/customer-documents.ts.
 */

import type { FastifyInstance } from 'fastify';
import type { preHandlerHookHandler } from 'fastify';
import { requireRole } from '../../../../packages/domain/tenant-context';
import { PlatformFeature, PublicationStatus, UserRole } from '../../../../packages/domain/types';
import type { DatabaseRuntime } from '../database';
import { ValidationError } from '../errors';
import {
  createPublication,
  generatePublicationSnapshot,
  getPublicationById,
  listPublications,
  publishViaConnector,
  transitionPublicationStatus,
  type CreatePublicationInput,
} from '../publications';
import { requireEntitlement } from '../entitlements';
import { parseObjectBody, parseRequiredDate, parseRequiredString } from '../request-parsing';
import type { InternalMockConnector } from '../connectors/mock-connector';

export interface PublicationsRoutesOptions {
  database: DatabaseRuntime;
  protectedHooks: preHandlerHookHandler[];
  mockConnector: InternalMockConnector;
}

export function registerPublicationsRoutes(
  app: FastifyInstance,
  options: PublicationsRoutesOptions,
): void {
  const { database, protectedHooks, mockConnector } = options;

  app.get('/publications', { preHandler: protectedHooks }, async () => {
    await requireEntitlement(database, PlatformFeature.SOCIAL_PUBLISHING);
    requireRole(UserRole.VIEWER);
    const publications = await listPublications(database);
    return { publications };
  });

  app.get<{ Params: { id: string } }>(
    '/publications/:id',
    { preHandler: protectedHooks },
    async (request) => {
      await requireEntitlement(database, PlatformFeature.SOCIAL_PUBLISHING);
      requireRole(UserRole.VIEWER);
      const publication = await getPublicationById(database, request.params.id);
      return { publication };
    }
  );

  app.post('/publications', { preHandler: protectedHooks }, async (request, reply) => {
    await requireEntitlement(database, PlatformFeature.SOCIAL_PUBLISHING);
    requireRole(UserRole.AGENT);
    const data = parseCreatePublicationInput(request.body);
    const publication = await createPublication(database, data);
    reply.code(201);
    return { publication };
  });

  app.post<{ Params: { id: string }; Body: { snapshot: Record<string, unknown> } }>(
    '/publications/:id/snapshot',
    { preHandler: protectedHooks },
    async (request) => {
      await requireEntitlement(database, PlatformFeature.SOCIAL_PUBLISHING);
      requireRole(UserRole.AGENT);
      if (typeof request.body?.snapshot !== 'object' || request.body.snapshot === null) {
        throw new ValidationError('Field "snapshot" is required and must be an object');
      }
      const publication = await generatePublicationSnapshot(
        database,
        request.params.id,
        request.body.snapshot
      );
      return { publication };
    }
  );

  app.post<{ Params: { id: string } }>(
    '/publications/:id/publish',
    { preHandler: protectedHooks },
    async (request) => {
      await requireEntitlement(database, PlatformFeature.SOCIAL_PUBLISHING);
      requireRole(UserRole.MANAGER);
      const publication = await publishViaConnector(
        database,
        mockConnector,
        request.params.id
      );
      return { publication };
    }
  );

  app.post<{ Params: { id: string }; Body: { status: string } }>(
    '/publications/:id/status',
    { preHandler: protectedHooks },
    async (request) => {
      await requireEntitlement(database, PlatformFeature.SOCIAL_PUBLISHING);
      requireRole(UserRole.AGENT);
      const status = parsePublicationStatus(request.body?.status);
      const publication = await transitionPublicationStatus(
        database,
        request.params.id,
        status
      );
      return { publication };
    }
  );
}

const VALID_PUBLICATION_STATUSES = Object.values(PublicationStatus);

function parsePublicationStatus(value: unknown): PublicationStatus {
  if (typeof value !== 'string' || !(VALID_PUBLICATION_STATUSES as string[]).includes(value)) {
    throw new ValidationError(
      `Field "status" must be one of: ${VALID_PUBLICATION_STATUSES.join(', ')}`,
    );
  }
  return value as PublicationStatus;
}

function parseCreatePublicationInput(body: unknown): CreatePublicationInput {
  const record = parseObjectBody(body);
  const campaignId = parseRequiredString(record.campaignId, 'campaignId');
  const offerId = parseRequiredString(record.offerId, 'offerId');
  const channel = parseRequiredString(record.channel, 'channel');

  const data: CreatePublicationInput = { campaignId, offerId, channel };

  if (record.creativeTemplateId !== undefined) data.creativeTemplateId = parseRequiredString(record.creativeTemplateId, 'creativeTemplateId');
  if (record.scheduledAt !== undefined) data.scheduledAt = parseRequiredDate(record.scheduledAt, 'scheduledAt');

  return data;
}
