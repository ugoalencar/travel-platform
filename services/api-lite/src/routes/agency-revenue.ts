import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { requirePermission } from '../access';
import {
  calculateRevenueForSale,
  cancelRevenueEntry,
  createRuleVersion,
  getSaleRevenue,
  listRuleVersions,
  parseRuleInput,
  receiveRevenueEntry,
  reactivateRevenueEntry,
} from '../agency-revenue';
import type { LiteDatabase } from '../database';
import { ValidationError } from '../errors';
import { getTenantContext } from '../tenant-context';

export function registerAgencyRevenueRoutes(
  app: FastifyInstance,
  database: LiteDatabase,
  protectedHooks: preHandlerHookHandler[],
) {
  app.get('/agency-revenue/rules', { preHandler: protectedHooks }, async () => {
    requirePermission(getTenantContext(), 'revenue.read_all');
    return { rules: await listRuleVersions(database) };
  });

  app.post('/agency-revenue/rules', { preHandler: protectedHooks }, async (request, reply) => {
    requirePermission(getTenantContext(), 'revenue.rules_manage');
    const created = await createRuleVersion(database, parseRuleInput(request.body));
    reply.code(201);
    return { rule: created };
  });

  app.get('/sales/:id/agency-revenue', { preHandler: protectedHooks }, async (request) => {
    requirePermission(getTenantContext(), 'revenue.read_all');
    return getSaleRevenue(database, (request.params as { id: string }).id);
  });

  app.post('/sales/:id/agency-revenue/calculate', { preHandler: protectedHooks }, async (request) => {
    requirePermission(getTenantContext(), 'revenue.rules_manage', 'revenue.receive');
    return calculateRevenueForSale(database, (request.params as { id: string }).id);
  });

  app.post('/agency-revenue/entries/:id/receive', { preHandler: protectedHooks }, async (request) => {
    requirePermission(getTenantContext(), 'revenue.receive');
    const body = request.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ValidationError('Request body must be an object');
    const record = body as Record<string, unknown>;
    if (Object.keys(record).some((key) => !['amount', 'reference'].includes(key))) throw new ValidationError('Unknown field in request body');
    if (typeof record.amount !== 'number') throw new ValidationError('Field "amount" must be a number');
    if (record.reference !== undefined && (typeof record.reference !== 'string' || record.reference.length > 200)) {
      throw new ValidationError('Field "reference" is invalid');
    }
    return receiveRevenueEntry(database, (request.params as { id: string }).id, {
      amount: record.amount,
      reference: typeof record.reference === 'string' ? record.reference : null,
    });
  });

  app.post('/agency-revenue/entries/:id/cancel', { preHandler: protectedHooks }, async (request) => {
    requirePermission(getTenantContext(), 'revenue.receive');
    return cancelRevenueEntry(database, (request.params as { id: string }).id);
  });
  app.post('/agency-revenue/entries/:id/reactivate', { preHandler: protectedHooks }, async (request) => {
    requirePermission(getTenantContext(), 'revenue.receive');
    const body = request.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ValidationError('Request body must be an object');
    const record = body as Record<string, unknown>;
    if (Object.keys(record).some((key) => key !== 'reason') || typeof record.reason !== 'string') {
      throw new ValidationError('A reason is required');
    }
    return reactivateRevenueEntry(database, (request.params as { id: string }).id, record.reason);
  });
}
