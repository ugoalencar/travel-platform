/**
 * Settings Expanded -- agency profile updates, branding, onboarding,
 * departments, invitations (staff and public), and permission restrictions.
 */

import type { FastifyInstance } from 'fastify';
import type { preHandlerHookHandler } from 'fastify';
import { getTenantContext, requireRole } from '../../../../packages/domain/tenant-context';
import { UserRole } from '../../../../packages/domain/types';
import type { DatabaseRuntime } from '../database';
import { ValidationError } from '../errors';
import {
  updateAgencyProfile,
  updateAgencyBranding,
  listDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  updateOnboardingStep,
  completeOnboarding,
  isValidOnboardingStep,
} from '../settings-queries';
import { recordAuditEvent, AuditEventType } from '../audit-log';
import {
  createInvitation,
  listInvitations,
  revokeInvitation,
  resolvePublicInvitationToken,
  acceptInvitation,
} from '../invitations';
import {
  createPermissionRestriction,
  listPermissionRestrictions,
  deletePermissionRestriction,
} from '../permission-restrictions';

export interface SettingsExpandedRoutesOptions {
  database: DatabaseRuntime;
  protectedHooks: preHandlerHookHandler[];
}

export function registerSettingsExpandedRoutes(
  app: FastifyInstance,
  options: SettingsExpandedRoutesOptions,
): void {
  const { database, protectedHooks } = options;

  // ============================================================
  // AGENCY PROFILE
  // ============================================================
  app.patch('/settings/agency', { preHandler: protectedHooks }, async (request) => {
    requireRole(UserRole.ADMIN);
    const body = request.body as Partial<{
      name: string;
      email: string | null;
      phone: string | null;
    }>;
    const profile = await database.withTenantTransaction(async (client) => {
      const updated = await updateAgencyProfile(client, body);
      await recordAuditEvent(client, {
        eventType: AuditEventType.AGENCY_SETTINGS_UPDATED,
        entityType: 'agency',
        entityId: updated.id,
        metadata: { fieldsChanged: Object.keys(body).join(',') },
      });
      return updated;
    });
    return { profile };
  });

  // ============================================================
  // AGENCY BRANDING
  // ============================================================
  app.patch('/settings/branding', { preHandler: protectedHooks }, async (request) => {
    requireRole(UserRole.ADMIN);
    const body = request.body as Partial<{
      displayName: string | null;
      logoUrl: string | null;
      primaryColor: string | null;
    }>;
    const profile = await database.withTenantTransaction(async (client) => {
      const updated = await updateAgencyBranding(client, body);
      await recordAuditEvent(client, {
        eventType: AuditEventType.AGENCY_BRANDING_UPDATED,
        entityType: 'agency',
        entityId: updated.id,
        metadata: { fieldsChanged: Object.keys(body).join(',') },
      });
      return updated;
    });
    return { profile };
  });

  // ============================================================
  // ONBOARDING WIZARD
  // ============================================================
  app.patch('/settings/onboarding-step', { preHandler: protectedHooks }, async (request) => {
    requireRole(UserRole.ADMIN);
    const body = request.body as { step?: unknown };
    if (!isValidOnboardingStep(body.step)) {
      throw new ValidationError('step must be one of: profile, branding, team, done');
    }
    const profile = await database.withTenantTransaction(async (client) => {
      const updated = await updateOnboardingStep(client, body.step as 'profile' | 'branding' | 'team' | 'done');
      await recordAuditEvent(client, {
        eventType: AuditEventType.ONBOARDING_STEP_UPDATED,
        entityType: 'agency',
        entityId: updated.id,
        metadata: { step: body.step },
      });
      return updated;
    });
    return { profile };
  });

  app.post('/settings/onboarding/complete', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.ADMIN);
    const profile = await database.withTenantTransaction(async (client) => {
      const updated = await completeOnboarding(client);
      await recordAuditEvent(client, {
        eventType: AuditEventType.ONBOARDING_COMPLETED,
        entityType: 'agency',
        entityId: updated.id,
      });
      return updated;
    });
    return { profile };
  });

  // ============================================================
  // DEPARTMENTS
  // ============================================================
  app.get('/settings/departments', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.VIEWER);
    const departments = await database.withTenantTransaction((client) =>
      listDepartments(client),
    );
    return { departments };
  });

  app.post('/settings/departments', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.MANAGER);
    const body = request.body as { name: string; description?: string | null };
    const department = await database.withTenantTransaction(async (client) => {
      const created = await createDepartment(client, body);
      await recordAuditEvent(client, {
        eventType: AuditEventType.DEPARTMENT_CREATED,
        entityType: 'department',
        entityId: created.id,
      });
      return created;
    });
    reply.code(201);
    return { department };
  });

  app.patch(
    '/settings/departments/:id',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.MANAGER);
      const { id } = request.params as { id: string };
      const body = request.body as { name?: string; description?: string | null };
      const department = await database.withTenantTransaction(async (client) => {
        const updated = await updateDepartment(client, id, body);
        if (updated) {
          await recordAuditEvent(client, {
            eventType: AuditEventType.DEPARTMENT_UPDATED,
            entityType: 'department',
            entityId: id,
          });
        }
        return updated;
      });
      if (!department) {
        reply.code(404);
        return { error: 'Department not found' };
      }
      return { department };
    },
  );

  app.delete(
    '/settings/departments/:id',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.MANAGER);
      const { id } = request.params as { id: string };
      const deleted = await database.withTenantTransaction(async (client) => {
        const ok = await deleteDepartment(client, id);
        if (ok) {
          await recordAuditEvent(client, {
            eventType: AuditEventType.DEPARTMENT_DELETED,
            entityType: 'department',
            entityId: id,
          });
        }
        return ok;
      });
      if (!deleted) {
        reply.code(404);
        return { error: 'Department not found' };
      }
      reply.code(204);
      return null;
    },
  );

  // ============================================================
  // INVITATIONS (staff-side)
  // ============================================================
  app.get('/settings/invitations', { preHandler: protectedHooks }, async () => {
    const invitations = await listInvitations(database);
    return { invitations };
  });

  app.post('/settings/invitations', { preHandler: protectedHooks }, async (request, reply) => {
    const body = request.body as { email: string; role: UserRole; ttlDays?: number };
    const context = getTenantContext();
    const { invitation, token } = await createInvitation(database, context.userRole, body);
    reply.code(201);
    return { invitation, token };
  });

  app.post(
    '/settings/invitations/:id/revoke',
    { preHandler: protectedHooks },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const revoked = await revokeInvitation(database, id);
      if (!revoked) {
        reply.code(404);
        return { error: 'Invitation not found or not pending' };
      }
      return { invitation: revoked };
    },
  );

  // ============================================================
  // INVITATIONS (public accept flow)
  // ============================================================
  app.get('/invitations/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    const info = await resolvePublicInvitationToken(database, token);
    if (!info) {
      reply.code(404);
      return { error: 'Convite invalido ou expirado' };
    }
    return { email: info.email, role: info.role };
  });

  app.post('/invitations/:token/accept', async (request, reply) => {
    const { token } = request.params as { token: string };
    const body = request.body as { name: string };
    const info = await resolvePublicInvitationToken(database, token);
    if (!info) {
      reply.code(404);
      return { error: 'Convite invalido ou expirado' };
    }
    const result = await acceptInvitation(database, info, token, body);
    reply.code(201);
    return { userId: result.userId, email: result.email, role: result.role };
  });

  // ============================================================
  // PERMISSION RESTRICTIONS
  // ============================================================
  app.get('/settings/permission-restrictions', { preHandler: protectedHooks }, async () => {
    const restrictions = await listPermissionRestrictions(database);
    return { restrictions };
  });

  app.post(
    '/settings/permission-restrictions',
    { preHandler: protectedHooks },
    async (request, reply) => {
      const body = request.body as { role: UserRole; resource: string; action: string };
      const restriction = await createPermissionRestriction(database, body);
      reply.code(201);
      return { restriction };
    },
  );

  app.delete(
    '/settings/permission-restrictions/:id',
    { preHandler: protectedHooks },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const deleted = await deletePermissionRestriction(database, id);
      if (!deleted) {
        reply.code(404);
        return { error: 'Permission restriction not found' };
      }
      reply.code(204);
      return null;
    },
  );
}
