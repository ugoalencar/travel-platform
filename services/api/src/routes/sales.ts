/**
 * Sales -- CRUD for sales with customer join, plus confirm/cancel/mark-paid.
 */

import type { FastifyInstance } from 'fastify';
import type { preHandlerHookHandler } from 'fastify';
import { requireRole } from '../../../../packages/domain/tenant-context';
import { UserRole } from '../../../../packages/domain/types';
import type { DatabaseRuntime } from '../database';
import { NotFoundError } from '../errors';
import {
  cancelSale,
  confirmSale,
  createSale,
  getSaleWithCustomerById,
  listSalesWithCustomer,
  markSalePaid,
  updateSale,
} from '../sales';
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

  app.get('/sales', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.VIEWER);
    const sales = await listSalesWithCustomer(database);
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
    const sale = await createSale(database, data);

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
