import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { requireRole } from '../../../../packages/domain/tenant-context';
import { UserRole } from '../../../../packages/domain/types';
import type { DatabaseRuntime } from '../database';
import { confirmSalesImport, dryRunSalesImport, parseSalesImportInput } from '../sales-import';

/**
 * Sales import (IMP-01). MANAGER+. Two steps on purpose: the dry run returns the
 * plan and a content hash; the confirm must present that hash, so what is
 * written is exactly what was reviewed. Re-sending the same content writes nothing.
 */
export function registerSalesImportRoutes(
  app: FastifyInstance,
  options: { database: DatabaseRuntime; protectedHooks: preHandlerHookHandler[] },
): void {
  const { database, protectedHooks } = options;

  app.post('/imports/sales/dry-run', { preHandler: protectedHooks }, (request) => {
    requireRole(UserRole.MANAGER);
    return dryRunSalesImport(database, parseSalesImportInput(request.body, false));
  });

  app.post('/imports/sales/confirm', { preHandler: protectedHooks }, (request) => {
    requireRole(UserRole.MANAGER);
    return confirmSalesImport(database, parseSalesImportInput(request.body, true));
  });
}
