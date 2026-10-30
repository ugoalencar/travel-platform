import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { requireRole } from '../../../../packages/domain/tenant-context';
import { UserRole } from '../../../../packages/domain/types';
import type { DatabaseRuntime } from '../database';
import { CATALOG } from '../permissions/permission-catalog';
import {
  getMyPermissions,
  listUserPermissionOverrides,
  parseOverrideInput,
  setUserPermissionOverrides,
} from '../user-permission-overrides';

export function registerPermissionOverrideRoutes(
  app: FastifyInstance,
  options: { database: DatabaseRuntime; protectedHooks: preHandlerHookHandler[] },
): void {
  const { database, protectedHooks } = options;

  app.get('/settings/permission-catalog', { preHandler: protectedHooks }, () => {
    requireRole(UserRole.ADMIN);
    return {
      catalog: CATALOG.map(({ resource, action, minRole, delegable, grantableToRoles, mutation, enforced }) => ({
        enforced,
        resource,
        action,
        minRole,
        delegable,
        grantableToRoles,
        mutation,
      })),
    };
  });

  app.get('/settings/my-permissions', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.VIEWER);
    return { permissions: await getMyPermissions(database) };
  });

  app.get<{ Params: { id: string } }>(
    '/settings/team/:id/permission-overrides',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.ADMIN);
      return { overrides: await listUserPermissionOverrides(database, request.params.id) };
    },
  );

  app.put<{ Params: { id: string } }>(
    '/settings/team/:id/permission-overrides',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.ADMIN);
      const overrides = parseOverrideInput(request.body);
      return { overrides: await setUserPermissionOverrides(database, request.params.id, overrides) };
    },
  );
}
