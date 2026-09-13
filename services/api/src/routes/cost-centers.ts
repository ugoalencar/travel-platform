/**
 * Cost Centers -- CRUD for tenant-scoped cost centers.
 */

import type { FastifyInstance } from 'fastify';
import type { preHandlerHookHandler } from 'fastify';
import { requireRole } from '../../../../packages/domain/tenant-context';
import { UserRole } from '../../../../packages/domain/types';
import type { DatabaseRuntime } from '../database';
import {
  parseObjectBody,
  parseRequiredString,
} from '../request-parsing';
import {
  listCostCenters,
  createCostCenter,
  updateCostCenter,
  type CreateCostCenterInput,
  type UpdateCostCenterInput,
} from '../financial';

export interface CostCentersRoutesOptions {
  database: DatabaseRuntime;
  protectedHooks: preHandlerHookHandler[];
}

export function registerCostCentersRoutes(
  app: FastifyInstance,
  options: CostCentersRoutesOptions,
): void {
  const { database, protectedHooks } = options;

  app.get('/cost-centers', { preHandler: protectedHooks }, async (request) => {
    requireRole(UserRole.VIEWER);
    const query = request.query as Record<string, string>;
    const includeInactive = query.includeInactive === 'true';
    const costCenters = await listCostCenters(database, includeInactive);
    return { costCenters };
  });

  app.post('/cost-centers', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.MANAGER);
    const data = parseCreateCostCenterInput(request.body);
    const costCenter = await createCostCenter(database, data);
    reply.code(201);
    return { costCenter };
  });

  app.patch<{ Params: { id: string } }>('/cost-centers/:id', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.MANAGER);
    const data = parseUpdateCostCenterInput(request.body);
    const costCenter = await updateCostCenter(database, request.params.id, data);
    if (!costCenter) {
      reply.code(404);
      return { error: 'Cost center not found' };
    }
    return { costCenter };
  });
}

function parseCreateCostCenterInput(body: unknown): CreateCostCenterInput {
  const record = parseObjectBody(body);
  const name = parseRequiredString(record.name, 'name');
  let code: string | undefined;
  if (typeof record.code === 'string' && record.code.trim().length > 0) {
    code = record.code.trim();
  }
  let description: string | undefined;
  if (typeof record.description === 'string' && record.description.trim().length > 0) {
    description = record.description.trim();
  }
  return { name, code, description };
}

function parseUpdateCostCenterInput(body: unknown): UpdateCostCenterInput {
  const record = parseObjectBody(body);
  const data: UpdateCostCenterInput = {};
  if (typeof record.name === 'string') {
    data.name = parseRequiredString(record.name, 'name');
  }
  if (record.code !== undefined) {
    data.code = typeof record.code === 'string' && record.code.trim().length > 0
      ? record.code.trim()
      : undefined;
  }
  if (record.description !== undefined) {
    data.description = typeof record.description === 'string' && record.description.trim().length > 0
      ? record.description.trim()
      : undefined;
  }
  if (typeof record.active === 'boolean') {
    data.active = record.active;
  }
  return data;
}
