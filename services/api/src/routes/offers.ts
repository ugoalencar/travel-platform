/**
 * Offers -- HTTP surface for offer CRUD.
 *
 * Registered as one unit from app.ts, same convention as
 * routes/customer-documents.ts.
 */

import type { FastifyInstance } from 'fastify';
import type { preHandlerHookHandler } from 'fastify';
import { requireRole } from '../../../../packages/domain/tenant-context';
import { UserRole } from '../../../../packages/domain/types';
import type { DatabaseRuntime } from '../database';
import { NotFoundError } from '../errors';
import { createOffer, getOfferById, listOffers, updateOffer } from '../offers';
import {
  parseCreateOfferInput,
  parseUpdateOfferInput,
} from '../commercial-input-parsing';

export interface OffersRoutesOptions {
  database: DatabaseRuntime;
  protectedHooks: preHandlerHookHandler[];
}

export function registerOffersRoutes(
  app: FastifyInstance,
  options: OffersRoutesOptions,
): void {
  const { database, protectedHooks } = options;

  app.get('/offers', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.VIEWER);
    const offers = await listOffers(database);
    return { offers };
  });

  app.get<{ Params: { id: string } }>(
    '/offers/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const offer = await getOfferById(database, request.params.id);

      if (!offer) {
        throw new NotFoundError('Offer not found');
      }

      return { offer };
    }
  );

  app.post('/offers', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.MANAGER);
    const data = parseCreateOfferInput(request.body);
    const offer = await createOffer(database, data);

    reply.code(201);
    return { offer };
  });

  app.patch<{ Params: { id: string } }>(
    '/offers/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const data = parseUpdateOfferInput(request.body);
      const offer = await updateOffer(database, request.params.id, data);

      if (!offer) {
        throw new NotFoundError('Offer not found');
      }

      return { offer };
    }
  );
}
