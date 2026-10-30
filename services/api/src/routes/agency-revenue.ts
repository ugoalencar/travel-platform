import { getSettlementPolicy,saveSettlementPolicy,parseSettlementPolicy,listRevenueBatches,closeRevenueBatch,receiveRevenueBatch } from '../agency-revenue-batches';
import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { requireRole } from '../../../../packages/domain/tenant-context';
import { UserRole } from '../../../../packages/domain/types';
import {
  calculateRevenueForSale,
  cancelRevenueEntry,
  createRuleVersion,
  getSaleRevenue,
  listRuleVersions,
  listRevenueEntries,
  parseRuleInput,
  receiveRevenueEntry,
  reactivateRevenueEntry,
} from '../agency-revenue';
import type { DatabaseRuntime } from '../database';
import { ValidationError } from '../errors';

export function registerAgencyRevenueRoutes(
  app: FastifyInstance,
  options: { database: DatabaseRuntime; protectedHooks: preHandlerHookHandler[] },
): void {
  const { database, protectedHooks } = options;
  app.get('/agency-revenue/settlement-policy', {preHandler:protectedHooks}, () => getSettlementPolicy(database));
  app.put('/agency-revenue/settlement-policy', {preHandler:protectedHooks}, request => {
    requireRole(UserRole.ADMIN);
    return saveSettlementPolicy(database,parseSettlementPolicy(request.body));
  });
  app.get('/agency-revenue/batches', {preHandler:protectedHooks}, async () => ({batches:await listRevenueBatches(database)}));
  app.post('/agency-revenue/batches/close', {preHandler:protectedHooks}, request => {
    requireRole(UserRole.ADMIN);
    const body=request.body as Record<string,unknown>|null;
    if(!body||Object.keys(body).some(k=>k!=='month')||typeof body.month!=='string') throw new ValidationError('Month is required');
    return closeRevenueBatch(database,body.month);
  });
  app.post<{Params:{id:string}}>('/agency-revenue/batches/:id/receive', {preHandler:protectedHooks}, request => {
    requireRole(UserRole.ADMIN);
    const body=request.body as Record<string,unknown>|null;
    if(!body||Object.keys(body).some(k=>k!=='reference')||(body.reference!==undefined&&typeof body.reference!=='string')) throw new ValidationError('Invalid receipt');
    return receiveRevenueBatch(database,request.params.id,typeof body.reference==='string'?body.reference:null);
  });

  app.get('/agency-revenue/rules', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.MANAGER);
    return { rules: await listRuleVersions(database) };
  });

  app.get('/agency-revenue/entries', { preHandler: protectedHooks }, async (request) => {
    requireRole(UserRole.MANAGER);
    const query = request.query as Record<string, unknown>;
    const allowed = new Set(['saleId', 'status', 'supplierId', 'categoryId']);
    if (Object.keys(query).some((key) => !allowed.has(key))) throw new ValidationError('Unknown revenue entry filter');
    const optional = (value: unknown, field: string): string | undefined => {
      if (value === undefined) return undefined;
      if (typeof value !== 'string' || value.trim().length < 1 || value.length > 100) throw new ValidationError(`Invalid ${field}`);
      return value.trim();
    };
    const status = optional(query.status, 'status');
    if (status !== undefined && !['PENDING_RULE','FORECAST','ENTITLED','AVAILABLE','RECEIVED','CANCELLED'].includes(status)) {
      throw new ValidationError('Invalid revenue entry status');
    }
    const filters = {
      ...(optional(query.saleId,'saleId') ? { saleId: optional(query.saleId,'saleId')! } : {}),
      ...(status ? { status: status as 'PENDING_RULE'|'FORECAST'|'ENTITLED'|'AVAILABLE'|'RECEIVED'|'CANCELLED' } : {}),
      ...(optional(query.supplierId,'supplierId') ? { supplierId: optional(query.supplierId,'supplierId')! } : {}),
      ...(optional(query.categoryId,'categoryId') ? { categoryId: optional(query.categoryId,'categoryId')! } : {}),
    };
    return { entries: await listRevenueEntries(database, filters), limit: 500 };
  });

  app.post('/agency-revenue/rules', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.ADMIN);
    const created = await createRuleVersion(database, parseRuleInput(request.body));
    reply.code(201);
    return { rule: created };
  });

  app.get<{ Params: { id: string } }>('/sales/:id/agency-revenue', { preHandler: protectedHooks }, async (request) => {
    requireRole(UserRole.MANAGER);
    return getSaleRevenue(database, request.params.id);
  });

  app.post<{ Params: { id: string } }>('/sales/:id/agency-revenue/calculate', { preHandler: protectedHooks }, async (request) => {
    requireRole(UserRole.MANAGER);
    return calculateRevenueForSale(database, request.params.id);
  });

  app.post<{ Params: { id: string } }>('/agency-revenue/entries/:id/receive', { preHandler: protectedHooks }, async (request) => {
    requireRole(UserRole.ADMIN);
    const body = request.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ValidationError('Request body must be an object');
    const record = body as Record<string, unknown>;
    if (Object.keys(record).some((key) => !['amount', 'reference'].includes(key))) throw new ValidationError('Unknown field in request body');
    if (typeof record.amount !== 'number') throw new ValidationError('Field "amount" must be a number');
    if (record.reference !== undefined && (typeof record.reference !== 'string' || record.reference.length > 200)) {
      throw new ValidationError('Field "reference" is invalid');
    }
    return receiveRevenueEntry(database, request.params.id, {
      amount: record.amount,
      reference: typeof record.reference === 'string' ? record.reference : null,
    });
  });

  app.post<{ Params: { id: string } }>('/agency-revenue/entries/:id/cancel', { preHandler: protectedHooks }, async (request) => {
    requireRole(UserRole.ADMIN);
    return cancelRevenueEntry(database, request.params.id);
  });
  app.post<{ Params: { id: string } }>('/agency-revenue/entries/:id/reactivate', { preHandler: protectedHooks }, async (request) => {
    requireRole(UserRole.ADMIN);
    const body = request.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ValidationError('Request body must be an object');
    const record = body as Record<string, unknown>;
    if (Object.keys(record).some((key) => key !== 'reason') || typeof record.reason !== 'string') {
      throw new ValidationError('A reason is required');
    }
    return reactivateRevenueEntry(database, request.params.id, record.reason);
  });
}
