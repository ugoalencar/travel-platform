/**
 * Sale items ("Turbine sua Viagem" line items) (Agent 08 -- Upsell).
 *
 * Read floor mirrors GET /sales (VIEWER+, tenant-wide list, no narrower
 * client-owned subset to withhold). Create/cancel mirror the write floors
 * used elsewhere on Sale: creating a line item changes the Sale's
 * authoritative total (AGENT+, same floor as PATCH /sales/:id which also
 * changes `amount`); cancelling reverses that total (MANAGER+, same floor
 * as POST /sales/:id/cancel).
 *
 * Registered as one unit from app.ts, same convention as routes/sales.ts.
 */

import type { FastifyInstance } from 'fastify';
import type { preHandlerHookHandler } from 'fastify';
import { requireRole } from '../../../../packages/domain/tenant-context';
import { UserRole } from '../../../../packages/domain/types';
import type { DatabaseRuntime } from '../database';
import { NotFoundError } from '../errors';
import {
  cancelSaleItem,
  createSaleItem,
  listSaleItems,
  parseCreateSaleItemInput,
} from '../sale-items';

export interface SaleItemsRoutesOptions {
  database: DatabaseRuntime;
  protectedHooks: preHandlerHookHandler[];
}

export function registerSaleItemsRoutes(
  app: FastifyInstance,
  options: SaleItemsRoutesOptions,
): void {
  const { database, protectedHooks } = options;

  app.get<{ Params: { saleId: string } }>(
    '/sales/:saleId/items',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const items = await listSaleItems(database, request.params.saleId);
      return { saleItems: items };
    }
  );

  app.post<{ Params: { saleId: string } }>(
    '/sales/:saleId/items',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.AGENT);
      const data = parseCreateSaleItemInput(request.params.saleId, request.body);
      const saleItem = await createSaleItem(database, data);

      reply.code(201);
      return { saleItem };
    }
  );

  app.post<{ Params: { id: string } }>(
    '/sale-items/:id/cancel',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const saleItem = await cancelSaleItem(database, request.params.id);
      if (!saleItem) throw new NotFoundError('Sale item not found');
      return { saleItem };
    }
  );
}
