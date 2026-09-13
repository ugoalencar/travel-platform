/**
 * Travel Product Catalog -- HTTP surface (Agent 07 -- Catalog).
 *
 * TravelProduct is a distinct, categorized product-definition layer
 * (separate from Offer, the current sales opportunity). See
 * docs/travel_platform_mega_pack/architecture/PRODUCTS_UPSELL_INSURANCE.md.
 *
 * Registered as one unit from app.ts, same convention as routes/offers.ts.
 */

import type { FastifyInstance } from 'fastify';
import type { preHandlerHookHandler } from 'fastify';
import { requireRole } from '../../../../packages/domain/tenant-context';
import { UserRole, TravelProductCategory } from '../../../../packages/domain/types';
import type { DatabaseRuntime } from '../database';
import { NotFoundError, ValidationError } from '../errors';
import {
  attachAssetToProduct,
  createTravelProduct,
  deleteTravelProduct,
  getTravelProductById,
  listProductAssets,
  listTravelProducts,
  updateTravelProduct,
} from '../travel-products';
import {
  parseCreateTravelProductInput,
  parseUpdateTravelProductInput,
} from '../travel-product-input-parsing';

export interface TravelProductsRoutesOptions {
  database: DatabaseRuntime;
  protectedHooks: preHandlerHookHandler[];
}

export function registerTravelProductsRoutes(
  app: FastifyInstance,
  options: TravelProductsRoutesOptions,
): void {
  const { database, protectedHooks } = options;

  app.get<{ Querystring: { category?: string } }>(
    '/travel-products',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const category = request.query.category;
      if (
        category !== undefined &&
        !Object.values(TravelProductCategory).includes(category as TravelProductCategory)
      ) {
        throw new ValidationError(`Query param "category" must be a valid TravelProductCategory`);
      }
      const products = await listTravelProducts(database, {
        category: category as TravelProductCategory | undefined,
      });
      return { products };
    }
  );

  app.get<{ Params: { id: string } }>(
    '/travel-products/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const product = await getTravelProductById(database, request.params.id);
      if (!product) {
        throw new NotFoundError('Travel product not found');
      }
      return { product };
    }
  );

  app.post('/travel-products', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.MANAGER);
    const data = parseCreateTravelProductInput(request.body);
    const product = await createTravelProduct(database, data);
    reply.code(201);
    return { product };
  });

  app.patch<{ Params: { id: string } }>(
    '/travel-products/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const data = parseUpdateTravelProductInput(request.body);
      const product = await updateTravelProduct(database, request.params.id, data);
      if (!product) {
        throw new NotFoundError('Travel product not found');
      }
      return { product };
    }
  );

  app.delete<{ Params: { id: string } }>(
    '/travel-products/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const product = await deleteTravelProduct(database, request.params.id);
      if (!product) {
        throw new NotFoundError('Travel product not found');
      }
      return { product };
    }
  );

  app.get<{ Params: { id: string } }>(
    '/travel-products/:id/assets',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const product = await getTravelProductById(database, request.params.id);
      if (!product) {
        throw new NotFoundError('Travel product not found');
      }
      const assets = await listProductAssets(database, request.params.id);
      return { assets };
    }
  );

  app.post<{ Params: { id: string }; Body: { assetId?: string; sortOrder?: number } }>(
    '/travel-products/:id/assets',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.MANAGER);
      const assetId = request.body?.assetId;
      if (!assetId || typeof assetId !== 'string') {
        throw new ValidationError('Field "assetId" is required');
      }
      const link = await attachAssetToProduct(
        database,
        request.params.id,
        assetId,
        request.body?.sortOrder ?? 0
      );
      reply.code(201);
      return { link };
    }
  );
}
