import { randomBytes, createHash } from 'node:crypto';
import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { loadAccess } from '../access';
import { AUDIT_EVENTS, recordAuditEvent } from '../audit-log';
import { createSession, revokeSession } from '../auth';
import type { LiteDatabase } from '../database';
import type { TenantClient } from '../database';
import { sendPasswordResetEmail } from '../email';
import { NotFoundError, UnauthorizedError, ValidationError } from '../errors';
import { hashPassword, verifyPassword } from '../password';
import { loginClientIp, sendRateLimited, type LiteLoginAbuseProtector } from '../rate-limit';
import { getTenantContext } from '../tenant-context';
import { parseObjectBody, requiredString } from '../validation';

const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000; // 30 min
const PASSWORD_RESET_LOOKUP_GUC = 'app.password_reset_lookup_hash';
// Always the same message, whichever branch was taken server-side -- no
// user-enumeration signal through status code, body or (deliberately) by
// racing the network call to send the real e-mail inside this handler,
// same timing/response shape as services/api/src/local-auth.ts's
// forgotPassword.
const GENERIC_FORGOT_PASSWORD_RESPONSE = {
  message: 'Se os dados estiverem corretos, enviaremos instruções para o e-mail cadastrado.',
};

function generateOpaqueToken(): string {
  return randomBytes(32).toString('hex');
}

function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function resetUrlFor(token: string, env: NodeJS.ProcessEnv = process.env): string {
  const base = (env.TRAVEL_LITE_APP_URL ?? 'http://localhost:5180').replace(/\/$/, '');
  return `${base}/reset-password?token=${token}`;
}

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

const MIN_PASSWORD_LENGTH = 8;

async function passwordChangeRequired(client: TenantClient, tenantId: string, userId: string): Promise<boolean> {
  const result = await client.query<{ reset_at: string | null; changed_at: string | null }>(
    `SELECT
       max(created_at) FILTER (WHERE event_type = $3) AS reset_at,
       max(created_at) FILTER (WHERE event_type = $4) AS changed_at
      FROM audit_logs
      WHERE tenant_id = $1
        AND entity_type = 'user'
        AND entity_id = $2
        AND event_type IN ($3, $4)`,
    [tenantId, userId, AUDIT_EVENTS.USER_PASSWORD_RESET, AUDIT_EVENTS.USER_REQUIRED_PASSWORD_CHANGED],
  );
  const row = result.rows[0];
  if (!row?.reset_at) return false;
  if (!row.changed_at) return true;
  return new Date(row.reset_at).getTime() > new Date(row.changed_at).getTime();
}

function parseNewPassword(body: Record<string, unknown>): string {
  const password = requiredString(body, 'newPassword', { max: 200, trim: false });
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new ValidationError(`Field newPassword must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  return password;
}

export function registerAuthRoutes(
  app: FastifyInstance,
  database: LiteDatabase,
  protectedHooks: preHandlerHookHandler[],
  loginAbuseProtector?: LiteLoginAbuseProtector,
) {
  app.post('/auth/login', async (request, reply) => {
    const body = parseObjectBody(request.body);
    const slug = requiredString(body, 'slug', { max: 100 }).toLowerCase();
    const email = requiredString(body, 'email', { max: 254 }).toLowerCase();
    const password = requiredString(body, 'password', { max: 200, trim: false });
    const abuseInput = { accountId: `${slug}:${email}`, ip: loginClientIp(request) };
    const initialDecision = loginAbuseProtector?.check(abuseInput);

    if (initialDecision && initialDecision.state !== 'allow') {
      sendRateLimited(reply, initialDecision.retryAfterSeconds);
      return reply;
    }

    const tenantResult = await database.pool.query<{ id: string; status: string }>(
      'SELECT id, status FROM tenants WHERE slug = $1',
      [slug],
    );
    const tenant = tenantResult.rows[0];

    if (!tenant || tenant.status !== 'ACTIVE') {
      await verifyPassword(password, DUMMY_HASH);
      const decision = loginAbuseProtector?.recordFailure(abuseInput);
      if (decision && decision.state !== 'allow') {
        sendRateLimited(reply, decision.retryAfterSeconds);
        return reply;
      }
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
      const decision = loginAbuseProtector?.recordFailure(abuseInput);
      if (decision && decision.state !== 'allow') {
        sendRateLimited(reply, decision.retryAfterSeconds);
        return reply;
      }
      throw new UnauthorizedError('Invalid credentials');
    }

    loginAbuseProtector?.recordSuccess(abuseInput);
    const mustChangePassword = await database.runAsTenant(tenant.id, user.id, (client) =>
      passwordChangeRequired(client, tenant.id, user.id),
    );
    if (mustChangePassword) {
      reply.code(200);
      return {
        passwordChangeRequired: true,
        challenge: 'PASSWORD_CHANGE_REQUIRED',
        user: {
          id: user.id,
          tenantId: tenant.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      };
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

  app.post('/auth/forgot-password', async (request, reply) => {
    const body = parseObjectBody(request.body);
    const slug = requiredString(body, 'slug', { max: 100 }).toLowerCase();
    const email = requiredString(body, 'email', { max: 254 }).toLowerCase();
    const abuseInput = { accountId: `forgot:${slug}:${email}`, ip: loginClientIp(request) };
    const initialDecision = loginAbuseProtector?.check(abuseInput);
    if (initialDecision && initialDecision.state !== 'allow') {
      sendRateLimited(reply, initialDecision.retryAfterSeconds);
      return reply;
    }

    const tenantResult = await database.pool.query<{ id: string; status: string; name: string }>(
      'SELECT id, status, name FROM tenants WHERE slug = $1',
      [slug],
    );
    const tenant = tenantResult.rows[0];
    loginAbuseProtector?.recordSuccess(abuseInput);

    if (!tenant || tenant.status !== 'ACTIVE') {
      reply.code(200);
      return GENERIC_FORGOT_PASSWORD_RESPONSE;
    }

    await database.runAsTenant(tenant.id, null, async (client) => {
      const result = await client.query<UserRow>(
        `SELECT id, name, email, role, status, password_hash
           FROM users
          WHERE tenant_id = $1 AND email = $2`,
        [tenant.id, email],
      );
      const user = result.rows[0];
      if (!user || user.status !== 'ACTIVE') return;

      const rawToken = generateOpaqueToken();
      const tokenHash = hashOpaqueToken(rawToken);
      const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);

      // Same transaction/connection as the SELECT above: the RLS policies on
      // password_reset_tokens key off tenant_id only (no user_id GUC), so
      // there is no need for a second runAsTenant/connection here.
      await client.query(
        `INSERT INTO password_reset_tokens (tenant_id, user_id, token_hash, expires_at, requested_ip)
         VALUES ($1, $2, $3, $4, $5)`,
        [tenant.id, user.id, tokenHash, expiresAt, loginClientIp(request)],
      );
      await recordAuditEvent(client, {
        eventType: AUDIT_EVENTS.PASSWORD_RESET_REQUESTED,
        entityType: 'user',
        entityId: user.id,
      });

      // A delivery failure must never leak through the HTTP response (it
      // stays generic regardless): log it loudly instead and move on. In
      // production/staging with no provider configured this throws
      // (LiteEmailNotConfiguredError), which is exactly what should show
      // up in logs/alerts rather than in the response to an anonymous caller.
      try {
        await sendPasswordResetEmail({
          to: user.email,
          resetUrl: resetUrlFor(rawToken),
          ...(tenant.name ? { tenantName: tenant.name } : {}),
        });
      } catch (error) {
        request.log.error({ err: error }, 'password reset email delivery failed');
      }
    });

    reply.code(200);
    return GENERIC_FORGOT_PASSWORD_RESPONSE;
  });

  app.post('/auth/reset-password', async (request, reply) => {
    const body = parseObjectBody(request.body);
    const token = requiredString(body, 'token', { max: 200, trim: false });
    const newPassword = parseNewPassword(body);
    const tokenHash = hashOpaqueToken(token);

    const tokenInfo = await database.withPublicLookupTransaction(
      PASSWORD_RESET_LOOKUP_GUC,
      tokenHash,
      async (client) => {
        const result = await client.query<{
          id: string;
          tenant_id: string;
          user_id: string;
          expires_at: string;
          used_at: string | null;
        }>(
          `SELECT id, tenant_id, user_id, expires_at, used_at
             FROM password_reset_tokens
            WHERE token_hash = $1`,
          [tokenHash],
        );
        return result.rows[0] ?? null;
      },
    );

    if (!tokenInfo || tokenInfo.used_at || new Date(tokenInfo.expires_at) < new Date()) {
      throw new NotFoundError('Link de redefinição inválido ou expirado');
    }

    await database.runAsTenant(tokenInfo.tenant_id, tokenInfo.user_id, async (client) => {
      await client.query(`UPDATE password_reset_tokens SET used_at = now() WHERE id = $1`, [tokenInfo.id]);
      await client.query(
        `UPDATE users SET password_hash = $3, updated_at = now()
          WHERE tenant_id = $1 AND id = $2`,
        [tokenInfo.tenant_id, tokenInfo.user_id, await hashPassword(newPassword)],
      );
      await client.query(
        `UPDATE auth_sessions SET revoked_at = now()
          WHERE tenant_id = $1 AND user_id = $2 AND revoked_at IS NULL`,
        [tokenInfo.tenant_id, tokenInfo.user_id],
      );
      await recordAuditEvent(client, {
        eventType: AUDIT_EVENTS.PASSWORD_RESET_COMPLETED,
        entityType: 'user',
        entityId: tokenInfo.user_id,
      });
    });

    reply.code(200);
    return { message: 'Senha redefinida com sucesso. Todas as sessões anteriores foram encerradas.' };
  });

  app.post('/auth/change-required-password', async (request, reply) => {
    const body = parseObjectBody(request.body);
    const slug = requiredString(body, 'slug', { max: 100 }).toLowerCase();
    const email = requiredString(body, 'email', { max: 254 }).toLowerCase();
    const currentPassword = requiredString(body, 'currentPassword', { max: 200, trim: false });
    const newPassword = parseNewPassword(body);
    const abuseInput = { accountId: `change-required:${slug}:${email}`, ip: loginClientIp(request) };
    const initialDecision = loginAbuseProtector?.check(abuseInput);

    if (initialDecision && initialDecision.state !== 'allow') {
      sendRateLimited(reply, initialDecision.retryAfterSeconds);
      return reply;
    }

    const tenantResult = await database.pool.query<{ id: string; status: string }>(
      'SELECT id, status FROM tenants WHERE slug = $1',
      [slug],
    );
    const tenant = tenantResult.rows[0];

    if (!tenant || tenant.status !== 'ACTIVE') {
      await verifyPassword(currentPassword, DUMMY_HASH);
      const decision = loginAbuseProtector?.recordFailure(abuseInput);
      if (decision && decision.state !== 'allow') {
        sendRateLimited(reply, decision.retryAfterSeconds);
        return reply;
      }
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
      ? await verifyPassword(currentPassword, user.password_hash)
      : await verifyPassword(currentPassword, DUMMY_HASH);

    if (!user || !passwordOk || user.status !== 'ACTIVE') {
      const decision = loginAbuseProtector?.recordFailure(abuseInput);
      if (decision && decision.state !== 'allow') {
        sendRateLimited(reply, decision.retryAfterSeconds);
        return reply;
      }
      throw new UnauthorizedError('Invalid credentials');
    }

    loginAbuseProtector?.recordSuccess(abuseInput);
    await database.runAsTenant(tenant.id, user.id, async (client) => {
      if (!(await passwordChangeRequired(client, tenant.id, user.id))) {
        throw new ValidationError('Password change is not required');
      }
      await client.query(
        `UPDATE users SET password_hash = $3, updated_at = now()
          WHERE tenant_id = $1 AND id = $2`,
        [tenant.id, user.id, await hashPassword(newPassword)],
      );
      await client.query(
        `UPDATE auth_sessions SET revoked_at = now()
          WHERE tenant_id = $1 AND user_id = $2 AND revoked_at IS NULL`,
        [tenant.id, user.id],
      );
      await recordAuditEvent(client, {
        eventType: AUDIT_EVENTS.USER_REQUIRED_PASSWORD_CHANGED,
        entityType: 'user',
        entityId: user.id,
        metadata: { reason: 'required_after_admin_reset' },
      });
    });
    return { ok: true };
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
