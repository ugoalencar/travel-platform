/**
 * Settings -- HTTP surface for agency profile, team, and notification settings.
 *
 * Registered as one unit from app.ts, same convention as
 * routes/customer-documents.ts.
 */

import type { FastifyInstance } from 'fastify';
import type { preHandlerHookHandler } from 'fastify';
import { requireRole } from '../../../../packages/domain/tenant-context';
import { UserRole } from '../../../../packages/domain/types';
import type { DatabaseRuntime } from '../database';
import { ValidationError } from '../errors';
import {
  getAgencyProfile,
  getTeamMembers,
  getNotificationSettings,
  updateNotificationSettings,
  updateTeamMemberRole,
} from '../settings-queries';

export interface SettingsRoutesOptions {
  database: DatabaseRuntime;
  protectedHooks: preHandlerHookHandler[];
}

export function registerSettingsRoutes(
  app: FastifyInstance,
  options: SettingsRoutesOptions,
): void {
  const { database, protectedHooks } = options;

  app.get('/settings/agency', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.VIEWER);
    const result = await database.withTenantTransaction((client) =>
      getAgencyProfile(client),
    );
    return result;
  });

  app.get('/settings/team', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.VIEWER);
    const team = await database.withTenantTransaction((client) => getTeamMembers(client));
    return { team };
  });

  app.patch<{ Params: { id: string }; Body: { role?: string } }>(
    '/settings/team/:id/role',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.ADMIN);
      const role = request.body?.role;
      if (typeof role !== 'string' || !Object.values(UserRole).includes(role as UserRole)) {
        throw new ValidationError('role inválida');
      }
      const member = await database.withTenantTransaction((client) =>
        updateTeamMemberRole(client, request.params.id, role as UserRole),
      );
      return { member };
    },
  );

  app.get('/settings/notifications', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.VIEWER);
    const settings = await database.withTenantTransaction((client) =>
      getNotificationSettings(client),
    );
    return { settings };
  });

  app.patch('/settings/notifications', { preHandler: protectedHooks }, async (request) => {
    requireRole(UserRole.VIEWER);
    const body = request.body as Partial<{
      emailNotifications: boolean;
      proposalUpdates: boolean;
      bookingUpdates: boolean;
      paymentUpdates: boolean;
    }>;
    const settings = await database.withTenantTransaction((client) =>
      updateNotificationSettings(client, body),
    );
    return { settings };
  });
}
