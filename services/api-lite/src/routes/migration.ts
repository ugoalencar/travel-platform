/**
 * Migration readiness (Lite → Full): read-only report of pending items for
 * the current tenant, per docs/travel-lite/product-experience/
 * MIGRATION-READINESS.md. Gated by users.manage (MASTER by default);
 * performs SELECTs only — never mutates data.
 */
import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { requirePermission } from '../access';
import type { LiteDatabase } from '../database';
import { buildMigrationReadiness } from '../migration-readiness';
import { getTenantContext } from '../tenant-context';

export function registerMigrationRoutes(
  app: FastifyInstance,
  database: LiteDatabase,
  protectedHooks: preHandlerHookHandler[],
) {
  app.get('/migration/readiness', { preHandler: protectedHooks }, async () => {
    const context = getTenantContext();
    requirePermission(context, 'users.manage');
    return database.withTenantTransaction((client) => buildMigrationReadiness(client, context.tenantId));
  });
}
