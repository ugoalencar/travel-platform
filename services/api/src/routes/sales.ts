/**
 * Sales -- CRUD for sales with customer join, plus confirm/cancel/mark-paid.
 */

import type { FastifyInstance } from 'fastify';
import type { preHandlerHookHandler } from 'fastify';
import { requireRole } from '../../../../packages/domain/tenant-context';
import { SaleStatus, UserRole } from '../../../../packages/domain/types';
import type { DatabaseRuntime } from '../database';
import { NotFoundError, ValidationError } from '../errors';
import { parseUuidParam } from '../request-parsing';
import {
  cancelSale,
  confirmSale,
  createSale,
  getSaleWithCustomerById,
  listSalesWithCustomer,
  markSalePaid,
  updateSale,
} from '../sales';
import { createSaleItemInTransaction } from '../sale-items';
import { getCustomerSegmentById } from '../customer-segments';
import {
  parseCreateSaleInput,
  parseUpdateSaleInput,
} from '../commercial-input-parsing';

export interface SalesRoutesOptions {
  database: DatabaseRuntime;
  protectedHooks: preHandlerHookHandler[];
}

export function registerSalesRoutes(
  app: FastifyInstance,
  options: SalesRoutesOptions,
): void {
  const { database, protectedHooks } = options;

  app.get('/sales', { preHandler: protectedHooks }, async (request) => {
    requireRole(UserRole.VIEWER);
    const query = request.query as Record<string, string | undefined>;
    const dateFrom = parseSaleListDate(query.dateFrom, 'dateFrom');
    const dateTo = parseSaleListDate(query.dateTo, 'dateTo');
    if (dateFrom && dateTo && dateFrom > dateTo) {
      throw new ValidationError('Query "dateFrom" must not be after "dateTo"');
    }
    const status = query.status;
    if (status && !Object.values(SaleStatus).includes(status as SaleStatus)) {
      throw new ValidationError('Query "status" is invalid');
    }
    const employeeId = query.employeeId ? parseUuidParam(query.employeeId, 'employeeId') : undefined;
    const supplierId = query.supplierId ? parseUuidParam(query.supplierId, 'supplierId') : undefined;
    const segmentId = query.segmentId ? parseUuidParam(query.segmentId, 'segmentId') : undefined;
    const segment = segmentId ? await getCustomerSegmentById(database, segmentId) : null;
    if (segmentId && !segment) throw new NotFoundError('Customer segment not found');

    const all = await listSalesWithCustomer(database, {
      ...(dateFrom ? { dateFrom } : {}),
      ...(dateTo ? { dateTo } : {}),
      ...(status ? { status: status as SaleStatus } : {}),
      ...(employeeId ? { employeeId } : {}),
      ...(supplierId ? { supplierId } : {}),
      ...(segment ? { customerFilterDefinition: segment.filterDefinition } : {}),
    });
    const incomplete = query.incomplete === 'true';
    const sales = incomplete ? all.filter((sale) => (sale.missingRequiredFields ?? []).length > 0) : all;
    return { sales };
  });

  app.get<{ Params: { id: string } }>(
    '/sales/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const sale = await getSaleWithCustomerById(database, request.params.id);

      if (!sale) {
        throw new NotFoundError('Sale not found');
      }

      return { sale };
    }
  );

  app.post('/sales', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.AGENT);
    const data = parseCreateSaleInput(request.body);
    const sale = data.items?.length
      ? await database.withTenantTransaction(async (client) => {
          const sale = await createSale(database, data, client);
          for (const item of data.items ?? []) {
            await createSaleItemInTransaction(database, client, { ...item, saleId: sale.id }, { updateSaleTotal: false });
          }
          return sale;
        })
      : await createSale(database, data);

    reply.code(201);
    return { sale };
  });

  app.patch<{ Params: { id: string } }>(
    '/sales/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.AGENT);
      const data = parseUpdateSaleInput(request.body);
      const sale = await updateSale(database, request.params.id, data);

      if (!sale) {
        throw new NotFoundError('Sale not found');
      }

      return { sale };
    }
  );

  app.post<{ Params: { id: string } }>(
    '/sales/:id/confirm',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const sale = await confirmSale(database, request.params.id);
      if (!sale) throw new NotFoundError('Sale not found');
      return { sale };
    }
  );

  app.post<{ Params: { id: string } }>(
    '/sales/:id/cancel',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const sale = await cancelSale(database, request.params.id);
      if (!sale) throw new NotFoundError('Sale not found');
      return { sale };
    }
  );

  app.post<{ Params: { id: string } }>(
    '/sales/:id/mark-paid',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const sale = await markSalePaid(database, request.params.id);
      if (!sale) throw new NotFoundError('Sale not found');
      return { sale };
    }
  );
}

function parseSaleListDate(value: string | undefined, field: string): string | undefined {
  if (value === undefined || value === '') return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ValidationError(`Query "${field}" must use YYYY-MM-DD`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new ValidationError(`Query "${field}" must be a valid date`);
  }
  return value;
}
