/**
 * Commercial Cockpit -- HTTP surface for opportunities, tasks, interactions,
 * pipeline configuration, and commercial reports.
 *
 * Registered as one unit from app.ts, same convention as
 * routes/customer-documents.ts.
 */

import type { FastifyInstance } from 'fastify';
import type { preHandlerHookHandler } from 'fastify';
import { getUserId, requireRole } from '../../../../packages/domain/tenant-context';
import { UserRole } from '../../../../packages/domain/types';
import type { DatabaseRuntime } from '../database';
import {
  createInteraction,
  createOpportunity,
  createTask,
  getDashboardSummary,
  getOpportunityById,
  getPostSaleCandidates,
  getProposalsWaiting,
  getTaskById,
  listInteractions,
  listOpportunities,
  listTasks,
  parsePagination,
  searchCustomers,
  travelSearch,
  updateOpportunity,
  updateTask,
} from '../commercial-cockpit';
import {
  parseCreateInteractionInput,
  parseCreateOpportunityInput,
  parseCreateTaskInput,
  parseInteractionFilters,
  parseOpportunityFilters,
  parseTaskFilters,
  parseTravelSearchRange,
  parseUpdateOpportunityInput,
  parseUpdateTaskInput,
} from '../commercial-cockpit-parsers';
import {
  createPipeline,
  createStage,
  getPipelineById,
  grantPipelineAccess,
  listPipelineAccess,
  listPipelines,
  listStages,
  revokePipelineAccess,
  updatePipeline,
  updateStage,
} from '../pipeline-config';
import {
  parseCreatePipelineInput,
  parseCreateStageInput,
  parseGrantAccessInput,
  parseUpdatePipelineInput,
  parseUpdateStageInput,
} from '../pipeline-config-parsers';
import {
  getSalesByPeriod,
  getBookingsByStatus,
  getProposalConversion,
  getTopDestinations,
  getTripsByStatus,
} from '../reporting-queries';
import { NotFoundError, ValidationError } from '../errors';

export interface CommercialCockpitRoutesOptions {
  database: DatabaseRuntime;
  protectedHooks: preHandlerHookHandler[];
}

export function registerCommercialCockpitRoutes(
  app: FastifyInstance,
  options: CommercialCockpitRoutesOptions,
): void {
  const { database, protectedHooks } = options;

  // ============================================================
  // COMMERCIAL COCKPIT
  // Kanban stage lives ONLY on commercial_opportunities.stage -- these
  // routes never touch proposals.status or sales.status.
  // ============================================================

  app.get<{ Querystring: Record<string, string> }>(
    '/commercial/opportunities',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const filters = parseOpportunityFilters(request.query);
      const pagination = parsePagination(request.query);
      const { opportunities, total } = await listOpportunities(
        database,
        filters,
        pagination
      );
      return { opportunities, total, limit: pagination.limit, offset: pagination.offset };
    }
  );

  app.get<{ Params: { id: string } }>(
    '/commercial/opportunities/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const opportunity = await getOpportunityById(database, request.params.id);
      if (!opportunity) {
        throw new NotFoundError('Opportunity not found');
      }
      return { opportunity };
    }
  );

  app.post('/commercial/opportunities', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.AGENT);
    const data = parseCreateOpportunityInput(request.body);
    const opportunity = await createOpportunity(database, data);
    reply.code(201);
    return { opportunity };
  });

  app.patch<{ Params: { id: string } }>(
    '/commercial/opportunities/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.AGENT);
      const data = parseUpdateOpportunityInput(request.body);
      const opportunity = await updateOpportunity(database, request.params.id, data);
      if (!opportunity) {
        throw new NotFoundError('Opportunity not found');
      }
      return { opportunity };
    }
  );

  app.get<{ Querystring: Record<string, string> }>(
    '/commercial/tasks',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const filters = parseTaskFilters(request.query);
      const pagination = parsePagination(request.query);
      const { tasks, total } = await listTasks(database, filters, pagination);
      return { tasks, total, limit: pagination.limit, offset: pagination.offset };
    }
  );

  app.get<{ Params: { id: string } }>(
    '/commercial/tasks/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const task = await getTaskById(database, request.params.id);
      if (!task) {
        throw new NotFoundError('Task not found');
      }
      return { task };
    }
  );

  app.post('/commercial/tasks', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.AGENT);
    const data = parseCreateTaskInput(request.body);
    const task = await createTask(database, getUserId(), data);
    reply.code(201);
    return { task };
  });

  app.patch<{ Params: { id: string } }>(
    '/commercial/tasks/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.AGENT);
      const data = parseUpdateTaskInput(request.body);
      const task = await updateTask(database, request.params.id, data);
      if (!task) {
        throw new NotFoundError('Task not found');
      }
      return { task };
    }
  );

  app.get<{ Querystring: Record<string, string> }>(
    '/commercial/interactions',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const filters = parseInteractionFilters(request.query);
      const pagination = parsePagination(request.query);
      const { interactions, total } = await listInteractions(database, filters, pagination);
      return { interactions, total, limit: pagination.limit, offset: pagination.offset };
    }
  );

  app.post('/commercial/interactions', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.AGENT);
    const data = parseCreateInteractionInput(request.body);
    const interaction = await createInteraction(database, getUserId(), data);
    reply.code(201);
    return { interaction };
  });

  app.get<{ Querystring: Record<string, string> }>(
    '/commercial/customers/search',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const q = request.query.q;
      if (typeof q !== 'string') {
        throw new ValidationError('Query parameter "q" is required');
      }
      const pagination = parsePagination(request.query);
      const customers = await searchCustomers(database, q, pagination);
      return { customers };
    }
  );

  app.get<{ Querystring: Record<string, string> }>(
    '/commercial/travel-search',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const range = parseTravelSearchRange(request.query);
      const destination =
        typeof request.query.destination === 'string' ? request.query.destination : undefined;
      const result = await travelSearch(database, range, destination);
      return result;
    }
  );

  app.get<{ Querystring: Record<string, string> }>(
    '/commercial/dashboard',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const pipelineId =
        typeof request.query.pipelineId === 'string' ? request.query.pipelineId : undefined;
      const summary = await getDashboardSummary(database, getUserId(), pipelineId);
      return summary;
    }
  );

  // Read-only agenda/dashboard-suggestion lists. Neither ever writes --
  // proposals stay unmanaged, and post-sale candidates only ever result
  // in a MANUAL CommercialTask creation via POST /commercial/tasks.
  app.get('/commercial/proposals-waiting', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.VIEWER);
    const proposals = await getProposalsWaiting(database);
    return { proposals };
  });

  app.get('/commercial/post-sale-candidates', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.VIEWER);
    const candidates = await getPostSaleCandidates(database);
    return { candidates };
  });

  // ============================================================
  // CONFIGURABLE MULTI-PIPELINE (migration 009_configurable_pipelines.sql)
  // Reading GET /commercial/pipelines is server-driven access control: it
  // only ever returns pipelines the caller may see (never all pipelines
  // filtered client-side). Every configuration write below requires
  // ADMIN (OWNER passes too, higher in ROLE_HIERARCHY) -- requirePipelineAdmin()
  // inside pipeline-config.ts is the actual enforcement, requireRole()
  // here is the route-level first gate matching the existing pattern.
  // ============================================================

  app.get('/commercial/pipelines', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.VIEWER);
    const pipelines = await listPipelines(database);
    return { pipelines };
  });

  app.post('/commercial/pipelines', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.ADMIN);
    const data = parseCreatePipelineInput(request.body);
    const pipeline = await createPipeline(database, data);
    reply.code(201);
    return { pipeline };
  });

  app.get<{ Params: { id: string } }>(
    '/commercial/pipelines/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const pipeline = await getPipelineById(database, request.params.id);
      if (!pipeline) {
        throw new NotFoundError('Pipeline not found');
      }
      return { pipeline };
    }
  );

  app.patch<{ Params: { id: string } }>(
    '/commercial/pipelines/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.ADMIN);
      const data = parseUpdatePipelineInput(request.body);
      const pipeline = await updatePipeline(database, request.params.id, data);
      if (!pipeline) {
        throw new NotFoundError('Pipeline not found');
      }
      return { pipeline };
    }
  );

  app.get<{ Params: { id: string } }>(
    '/commercial/pipelines/:id/stages',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const stages = await listStages(database, request.params.id);
      return { stages };
    }
  );

  app.post<{ Params: { id: string } }>(
    '/commercial/pipelines/:id/stages',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.ADMIN);
      const data = parseCreateStageInput(request.body);
      const stage = await createStage(database, request.params.id, data);
      reply.code(201);
      return { stage };
    }
  );

  app.patch<{ Params: { id: string; stageId: string } }>(
    '/commercial/pipelines/:id/stages/:stageId',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.ADMIN);
      const data = parseUpdateStageInput(request.body);
      const stage = await updateStage(
        database,
        request.params.id,
        request.params.stageId,
        data
      );
      if (!stage) {
        throw new NotFoundError('Stage not found');
      }
      return { stage };
    }
  );

  app.get<{ Params: { id: string } }>(
    '/commercial/pipelines/:id/access',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.ADMIN);
      const access = await listPipelineAccess(database, request.params.id);
      return { access };
    }
  );

  app.post<{ Params: { id: string } }>(
    '/commercial/pipelines/:id/access',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.ADMIN);
      const data = parseGrantAccessInput(request.body);
      const access = await grantPipelineAccess(database, request.params.id, data.userId);
      reply.code(201);
      return { access };
    }
  );

  app.delete<{ Params: { id: string; userId: string } }>(
    '/commercial/pipelines/:id/access/:userId',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.ADMIN);
      await revokePipelineAccess(database, request.params.id, request.params.userId);
      reply.code(204);
      return null;
    }
  );

  // ============================================================
  // REPORTING (GET /commercial/reports/*)
  // All endpoints are tenant-scoped via getAgencyId()
  // All aggregations happen server-side
  // ============================================================

  app.get<{ Querystring: { start_date?: string; end_date?: string } }>(
    '/commercial/reports/sales',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const startDate = request.query.start_date || '2026-01-01';
      const endDate = request.query.end_date || '2026-12-31';
      const sales = await database.withTenantTransaction(
        (client) => getSalesByPeriod(client, startDate, endDate),
      );
      return { sales };
    }
  );

  app.get('/commercial/reports/bookings', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.VIEWER);
    const bookings = await database.withTenantTransaction((client) =>
      getBookingsByStatus(client),
    );
    return { bookings };
  });

  app.get('/commercial/reports/proposals', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.VIEWER);
    const proposals = await database.withTenantTransaction((client) =>
      getProposalConversion(client),
    );
    return { proposals };
  });

  app.get<{ Querystring: { limit?: string } }>(
    '/commercial/reports/destinations',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const limit = Math.min(Math.max(parseInt(request.query.limit || '10', 10), 1), 100);
      const destinations = await database.withTenantTransaction((client) =>
        getTopDestinations(client, limit),
      );
      return { destinations };
    }
  );

  app.get('/commercial/reports/trips', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.VIEWER);
    const trips = await database.withTenantTransaction((client) =>
      getTripsByStatus(client),
    );
    return { trips };
  });
}
