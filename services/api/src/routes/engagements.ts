/**
 * Engagements -- HTTP surface for social engagement metrics.
 *
 * Registered as one unit from app.ts, same convention as
 * routes/customer-documents.ts.
 */

import type { FastifyInstance } from 'fastify';
import type { preHandlerHookHandler } from 'fastify';
import { requireRole } from '../../../../packages/domain/tenant-context';
import { PlatformFeature, UserRole } from '../../../../packages/domain/types';
import type { DatabaseRuntime } from '../database';
import { listEngagements } from '../engagements';
import { requireEntitlement } from '../entitlements';

export interface EngagementsRoutesOptions {
  database: DatabaseRuntime;
  protectedHooks: preHandlerHookHandler[];
}

export function registerEngagementsRoutes(
  app: FastifyInstance,
  options: EngagementsRoutesOptions,
): void {
  const { database, protectedHooks } = options;

  app.get('/engagements', { preHandler: protectedHooks }, async () => {
    await requireEntitlement(database, PlatformFeature.SOCIAL_AUTOMATION);
    requireRole(UserRole.VIEWER);
    const engagements = await listEngagements(database);
    return { engagements };
  });
}
