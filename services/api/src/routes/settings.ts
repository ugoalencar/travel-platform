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
import { getMyAreaGrants, isAreaGrant, listAreaGrants, setAreaGrants } from '../area-grants';

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

  // Per-user area grants (agent_area_grants) -- orthogonal to role, see
  // 064_agent_area_grants.sql. GET is self-scoped (no ADMIN floor): any
  // authenticated user can read their own grants, which is what the
  // frontend sidebar needs to decide what an AGENT-with-grants should
  // additionally show. The per-member GET/PATCH below are ADMIN+ only.
  app.get('/settings/my-area-grants', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.VIEWER);
    const areas = await getMyAreaGrants(database);
    return { areas };
  });

  app.get<{ Params: { id: string } }>(
    '/settings/team/:id/area-grants',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.ADMIN);
      const areas = await listAreaGrants(database, request.params.id);
      return { areas };
    },
  );

  app.patch<{ Params: { id: string }; Body: { areas?: string[] } }>(
    '/settings/team/:id/area-grants',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.ADMIN);
      const rawAreas = request.body?.areas;
      if (!Array.isArray(rawAreas) || !rawAreas.every(isAreaGrant)) {
        throw new ValidationError('areas deve ser uma lista de SALES/FINANCIAL');
      }
      const areas = await setAreaGrants(database, request.params.id, rawAreas);
      return { areas };
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
