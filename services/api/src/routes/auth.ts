/**
 * Local email+password auth HTTP surface (Pilot Delivery Gap Closure --
 * Agent 02/Identity). See local-auth.ts for the service layer and
 * infrastructure/migrations/061_local_password_auth.sql for the schema
 * rationale.
 *
 * Public (no auth): /auth/login, /auth/mfa/verify, /auth/forgot-password,
 * /auth/reset-password -- all rate-limited via classifyRateLimitRequest's
 * existing AUTH_LOGIN/AUTH_RECOVERY classes, plus LoginAbuseProtector for
 * account+pair-scoped brute-force detection on login specifically.
 *
 * Authenticated (protectedHooks): /auth/logout, /auth/sessions,
 * /auth/mfa/enroll*, /auth/mfa/disable, /users/:id/status.
 */

import type { FastifyInstance } from 'fastify';
import type { preHandlerHookHandler } from 'fastify';
import type { IncomingHttpHeaders } from 'node:http';
import { requireRole, UnauthorizedError } from '../../../../packages/domain/tenant-context';
import { UserRole } from '../../../../packages/domain/types';
import type { DatabaseRuntime, PlatformDatabaseRuntime } from '../database';
import { ValidationError } from '../errors';
import { InMemoryRateLimitStore, LoginAbuseProtector } from '../rate-limit';
import { createTotpProviderFromEnv } from '../local-auth';
import {
  confirmMfaEnrollment,
  disableMfa,
  forgotPassword,
  listMySessions,
  login,
  resetPassword,
  revokeSession,
  setUserStatus,
  startMfaEnrollment,
  verifyMfaAndCompleteLogin,
  resolveSessionByToken,
} from '../local-auth';

export interface AuthRoutesOptions {
  database: DatabaseRuntime;
  platformDatabase?: PlatformDatabaseRuntime;
  protectedHooks: preHandlerHookHandler[];
}

function requirePlatformDatabase(platformDatabase: PlatformDatabaseRuntime | undefined): PlatformDatabaseRuntime {
  if (!platformDatabase) {
    throw new Error(
      'Local auth is not configured on this server instance (BuildAppOptions.platformDatabase missing).',
    );
  }
  return platformDatabase;
}

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- same IncomingHttpHeaders quirk production-auth.ts's getAuthorizationHeader disables at file level */
function extractBearerToken(headers: IncomingHttpHeaders): string | null {
  const raw = headers['authorization'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

function clientIp(request: { ip: string }): string {
  return request.ip;
}

export function registerAuthRoutes(app: FastifyInstance, options: AuthRoutesOptions): void {
  const { database, protectedHooks } = options;
  const totpProvider = createTotpProviderFromEnv();
  const loginAbuseProtector = new LoginAbuseProtector({ store: new InMemoryRateLimitStore() });

  app.post<{ Body: { agencySlug?: string; email?: string; password?: string } }>(
    '/auth/login',
    async (request, reply) => {
      const platformDatabase = requirePlatformDatabase(options.platformDatabase);
      const body = request.body ?? {};
      const agencySlug = requireString(body.agencySlug, 'agencySlug');
      const email = requireString(body.email, 'email');
      const password = requireString(body.password, 'password');
      const ip = clientIp(request);
      const accountId = `${agencySlug}:${email.toLowerCase()}`;

      const decision = await loginAbuseProtector.check({ accountId, ip });
      if (decision.state === 'temporary_block') {
        reply.code(429);
        return { error: 'Muitas tentativas. Tente novamente mais tarde.', retryAfterSeconds: decision.retryAfterSeconds };
      }

      try {
        const result = await login(platformDatabase, { agencySlug, email, password, ip });
        await loginAbuseProtector.recordSuccess({ accountId, ip });

        if (result.state === 'MFA_REQUIRED') {
          return { state: result.state, mfaChallengeToken: result.sessionToken, expiresAt: result.expiresAt };
        }
        return {
          state: result.state,
          sessionToken: result.sessionToken,
          expiresAt: result.expiresAt,
          user: { id: result.userId, agencyId: result.agencyId, role: result.role, email: result.email },
          mfaEnrollmentRecommended: result.mfaEnrollmentRecommended,
        };
      } catch (error: unknown) {
        const abuseDecision = await loginAbuseProtector.recordFailure({ accountId, ip });
        if (error instanceof UnauthorizedError) {
          reply.code(401);
          return {
            error: 'Email ou senha inválidos',
            captchaRequired: abuseDecision.state === 'captcha_required',
          };
        }
        throw error;
      }
    },
  );

  app.post<{ Body: { sessionToken?: string; code?: string } }>('/auth/mfa/verify', async (request, reply) => {
    const platformDatabase = requirePlatformDatabase(options.platformDatabase);
    const body = request.body ?? {};
    const sessionToken = requireString(body.sessionToken, 'sessionToken');
    const code = requireString(body.code, 'code');

    try {
      const result = await verifyMfaAndCompleteLogin(platformDatabase, totpProvider, {
        sessionToken,
        code,
        ip: clientIp(request),
      });
      return {
        state: 'FULLY_AUTHENTICATED',
        sessionToken: result.sessionToken,
        expiresAt: result.expiresAt,
        user: { id: result.userId, agencyId: result.agencyId, role: result.role, email: result.email },
      };
    } catch (error: unknown) {
      if (error instanceof UnauthorizedError) {
        reply.code(401);
        return { error: error.message };
      }
      throw error;
    }
  });

  app.post('/auth/forgot-password', async (request, reply) => {
    const platformDatabase = requirePlatformDatabase(options.platformDatabase);
    const body = (request.body ?? {}) as { agencySlug?: string; email?: string };
    const agencySlug = requireString(body.agencySlug, 'agencySlug');
    const email = requireString(body.email, 'email');

    await forgotPassword(platformDatabase, agencySlug, email, clientIp(request));
    // Always the same response -- no user-enumeration signal.
    reply.code(200);
    return { message: 'Se este email existir, enviaremos instruções de redefinição.' };
  });

  app.post<{ Body: { token?: string; newPassword?: string } }>('/auth/reset-password', async (request, reply) => {
    const platformDatabase = requirePlatformDatabase(options.platformDatabase);
    const body = request.body ?? {};
    const token = requireString(body.token, 'token');
    const newPassword = requireString(body.newPassword, 'newPassword');

    try {
      await resetPassword(platformDatabase, token, newPassword);
      return { message: 'Senha redefinida com sucesso. Todas as sessões anteriores foram encerradas.' };
    } catch (error: unknown) {
      reply.code(400);
      return { error: error instanceof Error ? error.message : 'Não foi possível redefinir a senha' };
    }
  });

  app.post('/auth/logout', { preHandler: protectedHooks }, async (request, reply) => {
    const platformDatabase = requirePlatformDatabase(options.platformDatabase);
    const token = extractBearerToken(request.headers);
    if (token) {
      const session = await resolveSessionByToken(platformDatabase, token);
      if (session) {
        await revokeSession(database, session.sessionId, 'LOGOUT');
      }
    }
    reply.code(204);
    return null;
  });

  app.get('/auth/sessions', { preHandler: protectedHooks }, async (request) => {
    const platformDatabase = requirePlatformDatabase(options.platformDatabase);
    const token = extractBearerToken(request.headers);
    const current = token ? await resolveSessionByToken(platformDatabase, token) : null;
    const sessions = await listMySessions(database, current?.sessionId ?? '');
    return { sessions };
  });

  app.post<{ Params: { id: string } }>(
    '/auth/sessions/:id/revoke',
    { preHandler: protectedHooks },
    async (request) => {
      const revoked = await revokeSession(database, request.params.id, 'USER_REVOKED');
      if (!revoked) {
        throw new ValidationError('Sessão não encontrada ou já revogada');
      }
      return { revoked: true };
    },
  );

  app.post('/auth/mfa/enroll', { preHandler: protectedHooks }, async (request, reply) => {
    const enrollment = await startMfaEnrollment(database, totpProvider, request.auth?.email ?? '');
    reply.code(201);
    return enrollment;
  });

  app.post<{ Body: { secretId?: string; code?: string } }>(
    '/auth/mfa/enroll/confirm',
    { preHandler: protectedHooks },
    async (request) => {
      const body = request.body ?? {};
      const secretId = requireString(body.secretId, 'secretId');
      const code = requireString(body.code, 'code');
      await confirmMfaEnrollment(database, totpProvider, secretId, code);
      return { enrolled: true };
    },
  );

  app.post('/auth/mfa/disable', { preHandler: protectedHooks }, async () => {
    await disableMfa(database, 'USER_REQUESTED');
    return { disabled: true };
  });

  // Minimal staff user-status management -- no route existed anywhere to
  // disable/suspend a user before this (users are only ever created via
  // invitations). ADMIN+ floor, same as other destructive account
  // operations elsewhere in this codebase.
  app.patch<{ Params: { id: string }; Body: { status?: string; reason?: string } }>(
    '/users/:id/status',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.ADMIN);
      const status = request.body?.status;
      if (status !== 'ACTIVE' && status !== 'INACTIVE' && status !== 'SUSPENDED') {
        throw new ValidationError('Field "status" must be ACTIVE, INACTIVE, or SUSPENDED');
      }
      await setUserStatus(database, request.params.id, status, request.body?.reason ?? 'ADMIN_ACTION');
      return { status };
    },
  );
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError(`Field "${field}" is required`);
  }
  return value;
}
