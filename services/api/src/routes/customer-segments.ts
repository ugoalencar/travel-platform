/**
 * Segmentação Avançada de Clientes -- HTTP surface.
 * Registered as one unit from app.ts, same convention as
 * routes/commercial-cockpit.ts.
 */

import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { requireRole } from '../../../../packages/domain/tenant-context';
import { UserRole } from '../../../../packages/domain/types';
import type { DatabaseRuntime } from '../database';
import {
  archiveCustomerSegment,
  createCustomerSegment,
  getCustomerSegmentById,
  listCustomerSegments,
  updateCustomerSegment,
} from '../customer-segments';
import {
  parseSegmentPagination,
  previewSegment,
  runFilterDefinition,
  validateFilterDefinition,
} from '../customer-segmentation';
import { NotFoundError, ValidationError } from '../errors';

export interface CustomerSegmentRoutesOptions {
  database: DatabaseRuntime;
  protectedHooks: preHandlerHookHandler[];
}

export function registerCustomerSegmentRoutes(
  app: FastifyInstance,
  options: CustomerSegmentRoutesOptions,
): void {
  const { database, protectedHooks } = options;

  // ============================================================
  // PREVIEW -- run an unsaved filter_definition against the live
  // customers table, no segment persisted. Same execution path used by
  // "open segment" (both are always live, never a frozen snapshot).
  // ============================================================
  app.post<{ Body: { filterDefinition: unknown; page?: number; pageSize?: number } }>(
    '/customer-segments/preview',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const body = request.body ?? {};
      const filterDefinition = validateFilterDefinition(body.filterDefinition);
      const pagination = parseSegmentPagination(
        (request.query as Record<string, unknown>) ?? {},
      );
      return previewSegment(database, filterDefinition, pagination);
    },
  );

  // ============================================================
  // CRUD
  // ============================================================
  app.get<{ Querystring: { includeArchived?: string } }>(
    '/customer-segments',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const segments = await listCustomerSegments(database, {
        includeArchived: request.query.includeArchived === 'true',
      });
      return { segments };
    },
  );

  app.get<{ Params: { id: string } }>(
    '/customer-segments/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const segment = await getCustomerSegmentById(database, request.params.id);
      if (!segment) {
        throw new NotFoundError('Segment not found');
      }
      return { segment };
    },
  );

  // Live, recomputed result set for a SAVED segment -- never a persisted
  // member snapshot (spec: "A lista deve ser calculada ao abrir/executar").
  app.get<{ Params: { id: string }; Querystring: Record<string, string> }>(
    '/customer-segments/:id/results',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const segment = await getCustomerSegmentById(database, request.params.id);
      if (!segment) {
        throw new NotFoundError('Segment not found');
      }
      const filterDefinition = validateFilterDefinition(segment.filterDefinition);
      const pagination = parseSegmentPagination(request.query);
      return database.withTenantTransaction((client) =>
        runFilterDefinition(client, filterDefinition, pagination, request.query.sort),
      );
    },
  );

  app.post<{
    Body: {
      name: string;
      description?: string;
      scope: 'PERSONAL' | 'SHARED';
      filterDefinition: unknown;
      ownerEmployeeId?: string;
    };
  }>('/customer-segments', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.AGENT);
    const body = request.body;
    if (typeof body?.name !== 'string' || typeof body.scope !== 'string') {
      throw new ValidationError('Fields "name" and "scope" are required');
    }
    const segment = await createCustomerSegment(database, body.ownerEmployeeId, {
      name: body.name,
      scope: body.scope,
      filterDefinition: body.filterDefinition,
      ...(body.description !== undefined ? { description: body.description } : {}),
    });
    reply.code(201);
    return { segment };
  });

  app.patch<{
    Params: { id: string };
    Body: { name?: string; description?: string; scope?: 'PERSONAL' | 'SHARED'; filterDefinition?: unknown };
  }>('/customer-segments/:id', { preHandler: protectedHooks }, async (request) => {
    requireRole(UserRole.AGENT);
    const segment = await updateCustomerSegment(database, request.params.id, request.body ?? {});
    if (!segment) {
      throw new NotFoundError('Segment not found');
    }
    return { segment };
  });

  app.post<{ Params: { id: string } }>(
    '/customer-segments/:id/archive',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.AGENT);
      const segment = await archiveCustomerSegment(database, request.params.id);
      if (!segment) {
        throw new NotFoundError('Segment not found');
      }
      return { segment };
    },
  );
}
