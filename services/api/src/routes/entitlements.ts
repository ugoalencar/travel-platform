/**
 * Entitlements -- HTTP surface for platform feature entitlement listing.
 *
 * Registered as one unit from app.ts, same convention as
 * routes/customer-documents.ts.
 */

import type { FastifyInstance } from 'fastify';
import type { preHandlerHookHandler } from 'fastify';
import { requireRole } from '../../../../packages/domain/tenant-context';
import { UserRole } from '../../../../packages/domain/types';
import type { DatabaseRuntime } from '../database';
import { listEntitlements } from '../entitlements';

export interface EntitlementsRoutesOptions {
  database: DatabaseRuntime;
  protectedHooks: preHandlerHookHandler[];
}

export function registerEntitlementsRoutes(
  app: FastifyInstance,
  options: EntitlementsRoutesOptions,
): void {
  const { database, protectedHooks } = options;

  app.get('/entitlements', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.VIEWER);
    const entitlements = await listEntitlements(database);
    return { entitlements };
  });
}
