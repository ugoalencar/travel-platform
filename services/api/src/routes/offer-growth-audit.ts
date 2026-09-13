/**
 * Offer Growth Audit Log -- HTTP surface for offer/growth audit trail.
 *
 * Registered as one unit from app.ts, same convention as
 * routes/customer-documents.ts.
 */

import type { FastifyInstance } from 'fastify';
import type { preHandlerHookHandler } from 'fastify';
import { requireRole } from '../../../../packages/domain/tenant-context';
import { UserRole } from '../../../../packages/domain/types';
import type { DatabaseRuntime } from '../database';
import { listAuditLog } from '../offer-growth-audit';

export interface OfferGrowthAuditRoutesOptions {
  database: DatabaseRuntime;
  protectedHooks: preHandlerHookHandler[];
}

export function registerOfferGrowthAuditRoutes(
  app: FastifyInstance,
  options: OfferGrowthAuditRoutesOptions,
): void {
  const { database, protectedHooks } = options;

  app.get('/offer-growth/audit-log', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.MANAGER);
    const entries = await listAuditLog(database);
    return { entries };
  });
}
