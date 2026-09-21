/**
 * Agency Communications — HTTP routes
 *
 * CRUD endpoints for managing agency communications
 * (banners, notices, campaigns) with RBAC enforcement.
 */

import type { FastifyInstance } from 'fastify';
import type { preHandlerHookHandler } from 'fastify';
import { requireRole, getUserId } from '../../../../packages/domain/tenant-context';
import { UserRole } from '../../../../packages/domain/types';
import type { DatabaseRuntime } from '../database';
import { NotFoundError, ValidationError } from '../errors';
import {
  createCommunication,
  updateCommunication,
  getCommunicationById,
  listCommunications,
  publishCommunication,
  archiveCommunication,
  deleteCommunication,
  type CommunicationType,
  type CommunicationPlacement,
  type CommunicationStatus,
} from '../agency-communications';

export interface AgencyCommunicationsRoutesOptions {
  database: DatabaseRuntime;
  protectedHooks: preHandlerHookHandler[];
}

const VALID_COMMUNICATION_TYPES = ['OFFER', 'NOTICE', 'CAMPAIGN', 'INFORMATION'] as const;
const VALID_PLACEMENTS = ['CUSTOMER_APP_HOME', 'CUSTOMER_APP_OFFERS', 'AGENCY_DASHBOARD'] as const;
const VALID_STATUSES = ['DRAFT', 'SCHEDULED', 'ACTIVE', 'EXPIRED', 'ARCHIVED'] as const;

export function registerAgencyCommunicationsRoutes(
  app: FastifyInstance,
  options: AgencyCommunicationsRoutesOptions,
): void {
  const { database, protectedHooks } = options;

  // ============================================================
  // LIST
  // ============================================================
  app.get('/agency-communications', { preHandler: protectedHooks }, async (request) => {
    requireRole(UserRole.VIEWER);

    const query = request.query as Record<string, unknown>;
    const filters: {
      placement?: CommunicationPlacement;
      status?: CommunicationStatus;
      type?: CommunicationType;
    } = {};

    if (query.placement && VALID_PLACEMENTS.includes(query.placement as CommunicationPlacement)) {
      filters.placement = query.placement as CommunicationPlacement;
    }
    if (query.status && VALID_STATUSES.includes(query.status as CommunicationStatus)) {
      filters.status = query.status as CommunicationStatus;
    }
    if (query.type && VALID_COMMUNICATION_TYPES.includes(query.type as CommunicationType)) {
      filters.type = query.type as CommunicationType;
    }

    const communications = await listCommunications(database, filters);
    return { communications };
  });

  // ============================================================
  // GET BY ID
  // ============================================================
  app.get<{ Params: { id: string } }>(
    '/agency-communications/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const communication = await getCommunicationById(database, request.params.id);
      if (!communication) {
        throw new NotFoundError('Communication not found');
      }
      return { communication };
    }
  );

  // ============================================================
  // CREATE
  // ============================================================
  app.post('/agency-communications', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.MANAGER);
    const body = request.body as Record<string, unknown>;

    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new ValidationError('Request body must be an object');
    }

    if (!body.type || !VALID_COMMUNICATION_TYPES.includes(body.type as CommunicationType)) {
      throw new ValidationError(`Field "type" is required and must be one of: ${VALID_COMMUNICATION_TYPES.join(', ')}`);
    }
    if (!body.title || typeof body.title !== 'string' || body.title.trim().length === 0) {
      throw new ValidationError('Field "title" is required and must be a non-empty string');
    }

    const createdByUserId = getUserId();
    const bodyRecord = body as Record<string, string | undefined>;
    const communication = await createCommunication(database, {
      type: body.type as CommunicationType,
      title: body.title,
      ...(bodyRecord.body !== undefined ? { body: bodyRecord.body } : {}),
      ...(bodyRecord.imageUrl !== undefined ? { imageUrl: bodyRecord.imageUrl } : {}),
      ...(bodyRecord.ctaLabel !== undefined ? { ctaLabel: bodyRecord.ctaLabel } : {}),
      ...(bodyRecord.ctaUrl !== undefined ? { ctaUrl: bodyRecord.ctaUrl } : {}),
      ...(bodyRecord.placement !== undefined ? { placement: bodyRecord.placement as CommunicationPlacement } : {}),
      ...(bodyRecord.displayPriority !== undefined ? { displayPriority: Number(bodyRecord.displayPriority) } : {}),
      ...(bodyRecord.targetSegmentId !== undefined ? { targetSegmentId: bodyRecord.targetSegmentId } : {}),
      ...(bodyRecord.visibleFrom !== undefined ? { visibleFrom: new Date(bodyRecord.visibleFrom) } : {}),
      ...(bodyRecord.visibleUntil !== undefined ? { visibleUntil: new Date(bodyRecord.visibleUntil) } : {}),
    }, createdByUserId);

    reply.code(201);
    return { communication };
  });

  // ============================================================
  // UPDATE
  // ============================================================
  app.put<{ Params: { id: string } }>(
    '/agency-communications/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const body = request.body as Record<string, unknown>;

      if (typeof body !== 'object' || body === null || Array.isArray(body)) {
        throw new ValidationError('Request body must be an object');
      }

      const input: Record<string, unknown> = {};

      if (body.type !== undefined) input.type = body.type;
      if (body.title !== undefined) input.title = body.title;
      if (body.body !== undefined) input.body = body.body;
      if (body.imageUrl !== undefined) input.imageUrl = body.imageUrl;
      if (body.ctaLabel !== undefined) input.ctaLabel = body.ctaLabel;
      if (body.ctaUrl !== undefined) input.ctaUrl = body.ctaUrl;
      if (body.placement !== undefined) input.placement = body.placement;
      if (body.displayPriority !== undefined) input.displayPriority = body.displayPriority;
      if (body.targetSegmentId !== undefined) input.targetSegmentId = body.targetSegmentId;
      if (body.visibleFrom !== undefined) input.visibleFrom = new Date(body.visibleFrom as string);
      if (body.visibleUntil !== undefined) input.visibleUntil = new Date(body.visibleUntil as string);

      if (Object.keys(input).length === 0) {
        throw new ValidationError('At least one field must be provided');
      }

      const communication = await updateCommunication(database, request.params.id, input);
      return { communication };
    }
  );

  // ============================================================
  // PUBLISH
  // ============================================================
  app.patch<{ Params: { id: string } }>(
    '/agency-communications/:id/publish',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const communication = await publishCommunication(database, request.params.id);
      return { communication };
    }
  );

  // ============================================================
  // ARCHIVE
  // ============================================================
  app.patch<{ Params: { id: string } }>(
    '/agency-communications/:id/archive',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const communication = await archiveCommunication(database, request.params.id);
      return { communication };
    }
  );

  // ============================================================
  // DELETE
  // ============================================================
  app.delete<{ Params: { id: string } }>(
    '/agency-communications/:id',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.ADMIN);
      await deleteCommunication(database, request.params.id);
      reply.code(204);
    }
  );
}
