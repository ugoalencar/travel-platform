import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { requireRole } from '../../../../packages/domain/tenant-context';
import { UserRole } from '../../../../packages/domain/types';
import {
  getDashboardSettings,
  getViewerDashboard,
  parseDashboardInput,
  saveDashboardSettings,
} from '../dashboard-widgets';
import type { DatabaseRuntime } from '../database';

export function registerDashboardWidgetRoutes(
  app: FastifyInstance,
  options: { database: DatabaseRuntime; protectedHooks: preHandlerHookHandler[] },
): void {
  const { database, protectedHooks } = options;

  // Layout already filtered by what THIS viewer may see; each widget carries its own data.
  app.get('/dashboard/widgets', { preHandler: protectedHooks }, () => getViewerDashboard(database));

  app.get('/settings/dashboard', { preHandler: protectedHooks }, () => getDashboardSettings(database));

  app.put('/settings/dashboard', { preHandler: protectedHooks }, (request) => {
    // Authorize before looking at the body: a non-administrator learns nothing about validation.
    requireRole(UserRole.ADMIN);
    return saveDashboardSettings(database, parseDashboardInput(request.body));
  });
}
