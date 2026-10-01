/**
 * Settings > Users and permissions.
 *
 * Anti-escalation rules (server-side, independent of the UI):
 *  - nobody changes their own role, status or permission overrides;
 *  - a user can only manage users whose role rank is <= their own, and can
 *    only assign roles with rank <= their own (so only a MASTER creates or
 *    edits a MASTER, and the last MASTER can never be demoted);
 *  - overrides need permissions.manage; master_only permissions
 *    (permissions.manage itself, dashboard.configure) only by a grants_all
 *    role; nobody grants a permission they do not hold.
 */
import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { effectivePermissions, isPermission, requirePermission, type AccessContext } from '../access';
import { AUDIT_EVENTS, recordAuditEvent } from '../audit-log';
import type { LiteDatabase, TenantClient } from '../database';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../errors';
import { hashPassword } from '../password';
import { getTenantContext } from '../tenant-context';
import {
  optionalEnum,
  optionalString,
  optionalUuid,
  parseObjectBody,
  requiredString,
  requiredUuid,
} from '../validation';

const MIN_PASSWORD_LENGTH = 8;

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  seller_id: string | null;
  seller_name: string | null;
  created_at: string;
}

const SELECT_USER = `u.id, u.name, u.email, u.role, u.status, u.created_at,
  se.id AS seller_id, se.name AS seller_name
  FROM users u
  LEFT JOIN sellers se ON se.tenant_id = u.tenant_id AND se.user_id = u.id`;

interface RoleRow {
  key: string;
  name: string;
  rank: number;
  grants_all: boolean;
}

async function loadRole(client: TenantClient, key: string): Promise<RoleRow> {
  const result = await client.query<RoleRow>('SELECT key, name, rank, grants_all FROM roles WHERE key = $1', [key]);
  const role = result.rows[0];
  if (!role) throw new ValidationError('Field role must be an existing role');
  return role;
}

function assertAssignable(actor: AccessContext, role: RoleRow): void {
  if (role.rank > actor.roleRank) {
    throw new ForbiddenError('Cannot assign a role above your own');
  }
}

async function lockTarget(
  client: TenantClient,
  tenantId: string,
  actor: AccessContext & { userId: string },
  id: string,
): Promise<UserRow & { rank: number; grants_all: boolean }> {
  const result = await client.query<UserRow & { rank: number; grants_all: boolean }>(
    `SELECT u.id, u.name, u.email, u.role, u.status, u.created_at,
            se.id AS seller_id, se.name AS seller_name, r.rank, r.grants_all
       FROM users u
       JOIN roles r ON r.key = u.role
       LEFT JOIN sellers se ON se.tenant_id = u.tenant_id AND se.user_id = u.id
      WHERE u.tenant_id = $1 AND u.id = $2
      FOR UPDATE OF u`,
    [tenantId, id],
  );
  const target = result.rows[0];
  if (!target) throw new NotFoundError('User not found');
  if (target.rank > actor.roleRank) {
    throw new ForbiddenError('Cannot manage a user above your own role');
  }
  return target;
}

function parsePassword(body: Record<string, unknown>, required: boolean): string | null {
  const value = required
    ? requiredString(body, 'password', { max: 200, trim: false })
    : optionalString(body, 'password', { max: 200, trim: false });
  if (value !== null && value.length < MIN_PASSWORD_LENGTH) {
    throw new ValidationError(`Field password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  return value;
}

/** Links the login to a seller (or unlinks with null). One seller per login. */
async function setSellerLink(
  client: TenantClient,
  tenantId: string,
  userId: string,
  sellerId: string | null,
): Promise<void> {
  if (sellerId) {
    const seller = await client.query<{ user_id: string | null }>(
      'SELECT user_id FROM sellers WHERE tenant_id = $1 AND id = $2 FOR UPDATE',
      [tenantId, sellerId],
    );
    const row = seller.rows[0];
    if (!row) throw new ValidationError('Field seller_id must reference an existing record of this tenant');
    if (row.user_id && row.user_id !== userId) {
      throw new ConflictError('This seller is already linked to another user');
    }
  }
  await client.query(
    `UPDATE sellers SET user_id = NULL, updated_at = now()
      WHERE tenant_id = $1 AND user_id = $2 AND ($3::uuid IS NULL OR id <> $3)`,
    [tenantId, userId, sellerId],
  );
  if (sellerId) {
    await client.query(
      'UPDATE sellers SET user_id = $3, updated_at = now() WHERE tenant_id = $1 AND id = $2',
      [tenantId, sellerId, userId],
    );
  }
}

async function loadOverrides(
  client: TenantClient,
  tenantId: string,
  userId: string,
): Promise<Array<{ permission: string; effect: string }>> {
  const result = await client.query<{ permission: string; effect: string }>(
    `SELECT permission, effect FROM user_permissions
      WHERE tenant_id = $1 AND user_id = $2 ORDER BY permission`,
    [tenantId, userId],
  );
  return result.rows;
}

export function registerUserRoutes(
  app: FastifyInstance,
  database: LiteDatabase,
  protectedHooks: preHandlerHookHandler[],
) {
  app.get('/access/catalog', { preHandler: protectedHooks }, async () => {
    const context = getTenantContext();
    requirePermission(context, 'users.manage', 'permissions.manage');
    return database.withTenantTransaction(async (client) => {
      const roles = await client.query<RoleRow>('SELECT key, name, rank, grants_all FROM roles ORDER BY rank DESC');
      const permissions = await client.query<{ key: string; description: string; master_only: boolean }>(
        'SELECT key, description, master_only FROM permissions ORDER BY key',
      );
      const defaults = await client.query<{ role: string; permission: string }>(
        'SELECT role, permission FROM role_permissions ORDER BY role, permission',
      );
      return {
        roles: roles.rows.map((role) => ({
          ...role,
          assignable: role.rank <= context.roleRank,
          permissions: role.grants_all
            ? permissions.rows.map((p) => p.key)
            : defaults.rows.filter((d) => d.role === role.key).map((d) => d.permission),
        })),
        permissions: permissions.rows.map((p) => ({
          ...p,
          grantable: context.permissions.has('permissions.manage') &&
            context.permissions.has(p.key) && (!p.master_only || context.grantsAll),
        })),
      };
    });
  });

  app.get('/users', { preHandler: protectedHooks }, async () => {
    const context = getTenantContext();
    requirePermission(context, 'users.manage', 'permissions.manage');
    const users = await database.withTenantTransaction(async (client) => {
      const result = await client.query<UserRow>(
        `SELECT ${SELECT_USER} WHERE u.tenant_id = $1 ORDER BY u.name`,
        [context.tenantId],
      );
      const overrides = await client.query<{ user_id: string; permission: string; effect: string }>(
        'SELECT user_id, permission, effect FROM user_permissions WHERE tenant_id = $1 ORDER BY permission',
        [context.tenantId],
      );
      return result.rows.map((user) => ({
        ...user,
        is_self: user.id === context.userId,
        overrides: overrides.rows
          .filter((o) => o.user_id === user.id)
          .map(({ permission, effect }) => ({ permission, effect })),
      }));
    });
    return { items: users };
  });

  app.post('/users', { preHandler: protectedHooks }, async (request, reply) => {
    const context = getTenantContext();
    requirePermission(context, 'users.manage');
    const body = parseObjectBody(request.body);
    const name = requiredString(body, 'name', { max: 200 });
    const email = requiredString(body, 'email', { max: 254 }).toLowerCase();
    const password = parsePassword(body, true)!;
    const roleKey = requiredString(body, 'role', { max: 30 });
    const sellerId = optionalUuid(body, 'seller_id');

    const user = await database.withTenantTransaction(async (client) => {
      const role = await loadRole(client, roleKey);
      assertAssignable(context, role);
      const existing = await client.query('SELECT 1 FROM users WHERE tenant_id = $1 AND email = $2', [
        context.tenantId,
        email,
      ]);
      if ((existing.rowCount ?? 0) > 0) throw new ConflictError('A user with this e-mail already exists');
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO users (tenant_id, name, email, password_hash, role)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [context.tenantId, name, email, await hashPassword(password), role.key],
      );
      const id = inserted.rows[0]!.id;
      if (sellerId) await setSellerLink(client, context.tenantId, id, sellerId);
      await recordAuditEvent(client, {
        eventType: AUDIT_EVENTS.USER_CREATED,
        entityType: 'user',
        entityId: id,
        metadata: { role: role.key, seller_id: sellerId },
      });
      const created = await client.query<UserRow>(`SELECT ${SELECT_USER} WHERE u.tenant_id = $1 AND u.id = $2`, [
        context.tenantId,
        id,
      ]);
      return created.rows[0]!;
    });
    reply.code(201);
    return { user };
  });

  app.patch('/users/:id', { preHandler: protectedHooks }, async (request) => {
    const context = getTenantContext();
    requirePermission(context, 'users.manage');
    const id = requiredUuid({ id: (request.params as { id: string }).id }, 'id');
    const body = parseObjectBody(request.body);
    const isSelf = id === context.userId;
    if (isSelf && ('role' in body || 'status' in body)) {
      throw new ForbiddenError('You cannot change your own role or status');
    }

    const user = await database.withTenantTransaction(async (client) => {
      const target = await lockTarget(client, context.tenantId, context, id);
      const updates: string[] = [];
      const params: unknown[] = [context.tenantId, id];
      const set = (column: string, value: unknown) => {
        params.push(value);
        updates.push(`${column} = $${params.length}`);
      };

      if ('name' in body) set('name', requiredString(body, 'name', { max: 200 }));
      if ('email' in body) {
        const email = requiredString(body, 'email', { max: 254 }).toLowerCase();
        const clash = await client.query('SELECT 1 FROM users WHERE tenant_id = $1 AND email = $2 AND id <> $3', [
          context.tenantId,
          email,
          id,
        ]);
        if ((clash.rowCount ?? 0) > 0) throw new ConflictError('A user with this e-mail already exists');
        set('email', email);
      }
      const password = parsePassword(body, false);
      if (password) set('password_hash', await hashPassword(password));

      let newRole: RoleRow | null = null;
      if ('role' in body) {
        newRole = await loadRole(client, requiredString(body, 'role', { max: 30 }));
        assertAssignable(context, newRole);
        set('role', newRole.key);
      }
      const status = 'status' in body ? optionalEnum(body, 'status', ['ACTIVE', 'INACTIVE'] as const) : null;
      if ('status' in body) {
        if (!status) throw new ValidationError('Field status is required');
        set('status', status);
      }

      if (updates.length > 0) {
        updates.push('updated_at = now()');
        await client.query(`UPDATE users SET ${updates.join(', ')} WHERE tenant_id = $1 AND id = $2`, params);
      }
      if ('seller_id' in body) {
        const sellerId = optionalUuid(body, 'seller_id');
        await setSellerLink(client, context.tenantId, id, sellerId);
        await recordAuditEvent(client, {
          eventType: AUDIT_EVENTS.USER_SELLER_LINKED,
          entityType: 'user',
          entityId: id,
          metadata: { from_seller_id: target.seller_id, to_seller_id: sellerId },
        });
      }
      if (updates.length === 0 && !('seller_id' in body)) {
        throw new ValidationError('At least one field is required');
      }

      if (newRole && newRole.key !== target.role) {
        await recordAuditEvent(client, {
          eventType: AUDIT_EVENTS.USER_ROLE_CHANGED,
          entityType: 'user',
          entityId: id,
          metadata: { from: target.role, to: newRole.key },
        });
      }
      if (status && status !== target.status) {
        await recordAuditEvent(client, {
          eventType: AUDIT_EVENTS.USER_STATUS_CHANGED,
          entityType: 'user',
          entityId: id,
          metadata: { from: target.status, to: status },
        });
      }
      if ('name' in body || 'email' in body || password) {
        await recordAuditEvent(client, {
          eventType: AUDIT_EVENTS.USER_UPDATED,
          entityType: 'user',
          entityId: id,
          metadata: { password_changed: password !== null },
        });
      }
      const updated = await client.query<UserRow>(`SELECT ${SELECT_USER} WHERE u.tenant_id = $1 AND u.id = $2`, [
        context.tenantId,
        id,
      ]);
      return updated.rows[0]!;
    });
    return { user };
  });

  app.get('/users/:id/permissions', { preHandler: protectedHooks }, async (request) => {
    const context = getTenantContext();
    requirePermission(context, 'users.manage', 'permissions.manage');
    const id = requiredUuid({ id: (request.params as { id: string }).id }, 'id');
    return database.withTenantTransaction(async (client) => {
      const target = await client.query<{ role: string; grants_all: boolean }>(
        `SELECT u.role, r.grants_all FROM users u JOIN roles r ON r.key = u.role
          WHERE u.tenant_id = $1 AND u.id = $2`,
        [context.tenantId, id],
      );
      const row = target.rows[0];
      if (!row) throw new NotFoundError('User not found');
      const effective = await effectivePermissions(client, context.tenantId, id, row.role, row.grants_all);
      return {
        role: row.role,
        grants_all: row.grants_all,
        effective,
        overrides: await loadOverrides(client, context.tenantId, id),
      };
    });
  });

  /** Replaces the user's overrides with the given set. */
  app.put('/users/:id/permissions', { preHandler: protectedHooks }, async (request) => {
    const context = getTenantContext();
    requirePermission(context, 'permissions.manage');
    const id = requiredUuid({ id: (request.params as { id: string }).id }, 'id');
    if (id === context.userId) throw new ForbiddenError('You cannot change your own permissions');
    const body = parseObjectBody(request.body);
    if (!Array.isArray(body.overrides)) throw new ValidationError('Field overrides must be an array');
    const overrides = body.overrides.map((item: unknown) => {
      const entry = item as { permission?: unknown; effect?: unknown };
      if (!isPermission(entry?.permission) || (entry.effect !== 'GRANT' && entry.effect !== 'REVOKE')) {
        throw new ValidationError('Each override needs a known permission and effect GRANT or REVOKE');
      }
      return { permission: entry.permission, effect: entry.effect };
    });
    if (new Set(overrides.map((o) => o.permission)).size !== overrides.length) {
      throw new ValidationError('Each permission may appear only once');
    }

    const result = await database.withTenantTransaction(async (client) => {
      const target = await lockTarget(client, context.tenantId, context, id);
      if (target.grants_all) throw new ConflictError('This role already has every permission');
      const before = await loadOverrides(client, context.tenantId, id);

      // Only overrides that actually change need the actor to hold them.
      const masterOnly = await client.query<{ key: string }>('SELECT key FROM permissions WHERE master_only');
      const masterOnlyKeys = new Set(masterOnly.rows.map((r) => r.key));
      const key = (o: { permission: string; effect: string }) => `${o.permission}:${o.effect}`;
      const beforeKeys = new Set(before.map(key));
      const afterKeys = new Set(overrides.map(key));
      const changed = [
        ...overrides.filter((o) => !beforeKeys.has(key(o))),
        ...before.filter((o) => !afterKeys.has(key(o))),
      ];
      for (const change of changed) {
        if (masterOnlyKeys.has(change.permission) && !context.grantsAll) {
          throw new ForbiddenError(`Only a MASTER can change ${change.permission}`);
        }
        if (!context.permissions.has(change.permission)) {
          throw new ForbiddenError(`You cannot change a permission you do not hold (${change.permission})`);
        }
      }

      await client.query('DELETE FROM user_permissions WHERE tenant_id = $1 AND user_id = $2', [
        context.tenantId,
        id,
      ]);
      for (const override of overrides) {
        await client.query(
          `INSERT INTO user_permissions (tenant_id, user_id, permission, effect, granted_by)
           VALUES ($1, $2, $3, $4, $5)`,
          [context.tenantId, id, override.permission, override.effect, context.userId],
        );
      }
      if (changed.length > 0) {
        await recordAuditEvent(client, {
          eventType: AUDIT_EVENTS.USER_PERMISSIONS_CHANGED,
          entityType: 'user',
          entityId: id,
          metadata: {
            before: before.map(key).join(',') || null,
            after: overrides.map(key).join(',') || null,
          },
        });
      }
      return loadOverrides(client, context.tenantId, id);
    });
    return { overrides: result };
  });
}
