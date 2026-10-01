import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { loadAccess } from '../access';
import { AUDIT_EVENTS, recordAuditEvent } from '../audit-log';
import { createSession, revokeSession } from '../auth';
import type { LiteDatabase } from '../database';
import { UnauthorizedError } from '../errors';
import { verifyPassword } from '../password';
import { getTenantContext } from '../tenant-context';
import { parseObjectBody, requiredString } from '../validation';

// Valid scrypt-format hash of a random secret: used to equalize response
// timing when the tenant or the user does not exist (no user-enumeration
// oracle through response time). Never matches any real password.
const DUMMY_HASH =
  'scrypt$16384$8$1$00000000000000000000000000000000$' +
  '00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  password_hash: string;
}

export function registerAuthRoutes(app: FastifyInstance, database: LiteDatabase, protectedHooks: preHandlerHookHandler[]) {
  app.post('/auth/login', async (request, reply) => {
    const body = parseObjectBody(request.body);
    const slug = requiredString(body, 'slug', { max: 100 }).toLowerCase();
    const email = requiredString(body, 'email', { max: 254 }).toLowerCase();
    const password = requiredString(body, 'password', { max: 200, trim: false });

    const tenantResult = await database.pool.query<{ id: string; status: string }>(
      'SELECT id, status FROM tenants WHERE slug = $1',
      [slug],
    );
    const tenant = tenantResult.rows[0];

    if (!tenant || tenant.status !== 'ACTIVE') {
      await verifyPassword(password, DUMMY_HASH);
      throw new UnauthorizedError('Invalid credentials');
    }

    const user = await database.runAsTenant(tenant.id, null, async (client) => {
      const result = await client.query<UserRow>(
        `SELECT id, name, email, role, status, password_hash
           FROM users
          WHERE tenant_id = $1 AND email = $2`,
        [tenant.id, email],
      );
      return result.rows[0] ?? null;
    });

    const passwordOk = user
      ? await verifyPassword(password, user.password_hash)
      : await verifyPassword(password, DUMMY_HASH);

    if (!user || !passwordOk || user.status !== 'ACTIVE') {
      await database.runAsTenant(tenant.id, null, async (client) => {
        await recordAuditEvent(client, {
          eventType: AUDIT_EVENTS.LOGIN_FAILED,
          entityType: 'user',
          metadata: { email, reason: !user ? 'unknown_user' : !passwordOk ? 'bad_password' : 'inactive' },
        });
      });
      throw new UnauthorizedError('Invalid credentials');
    }

    const session = await createSession(database, tenant.id, user.id);
    const access = await database.runAsTenant(tenant.id, user.id, async (client) => {
      await recordAuditEvent(client, {
        eventType: AUDIT_EVENTS.LOGIN_SUCCESS,
        entityType: 'user',
        entityId: user.id,
      });
      return loadAccess(client, tenant.id, user.id, user.role);
    });

    reply.code(200);
    return {
      sessionToken: session.token,
      expiresAt: session.expiresAt.toISOString(),
      user: {
        id: user.id,
        tenantId: tenant.id,
        name: user.name,
        email: user.email,
        role: user.role,
        sellerId: access?.sellerId ?? null,
        permissions: [...(access?.permissions ?? [])].sort(),
      },
    };
  });

  app.post('/auth/logout', { preHandler: protectedHooks }, async (request) => {
    const principal = request.liteAuth;
    if (!principal) throw new UnauthorizedError();
    await revokeSession(database, principal);
    await database.runAsTenant(principal.tenantId, principal.userId, async (client) => {
      await recordAuditEvent(client, {
        eventType: AUDIT_EVENTS.LOGOUT,
        entityType: 'user',
        entityId: principal.userId,
      });
    });
    return { ok: true };
  });

  app.get('/auth/me', { preHandler: protectedHooks }, async (request) => {
    const principal = request.liteAuth;
    if (!principal) throw new UnauthorizedError();
    const context = getTenantContext();
    const result = await database.withTenantTransaction((client) =>
      client.query<{ id: string; name: string; email: string; role: string }>(
        `SELECT id, name, email, role FROM users WHERE tenant_id = $1 AND id = $2`,
        [context.tenantId, context.userId],
      ),
    );
    const user = result.rows[0];
    if (!user) throw new UnauthorizedError();
    return {
      user: {
        id: user.id,
        tenantId: context.tenantId,
        name: user.name,
        email: user.email,
        role: user.role,
        sellerId: context.sellerId,
        permissions: [...context.permissions].sort(),
      },
    };
  });
}
