/**
 * Local email+password auth HTTP surface for Customer Portal accounts
 * (Frontend Auth & Session track, decided 2026-09-14). Mirrors
 * routes/auth.ts's staff surface exactly; no MFA (not required for
 * customers by any spec in this pack, and customer_accounts has no MFA
 * columns).
 */

import type { FastifyInstance } from 'fastify';
import type { preHandlerHookHandler } from 'fastify';
import type { IncomingHttpHeaders } from 'node:http';
import type { PlatformDatabaseRuntime } from '../database';
import { ValidationError } from '../errors';
import { InMemoryRateLimitStore, LoginAbuseProtector } from '../rate-limit';
import {
  customerForgotPassword,
  customerLogin,
  customerLogout,
  customerResetPassword,
} from '../customer-local-auth';

export interface CustomerAuthRoutesOptions {
  platformDatabase?: PlatformDatabaseRuntime;
  customerHooks: preHandlerHookHandler[];
}

function requirePlatformDatabase(platformDatabase: PlatformDatabaseRuntime | undefined): PlatformDatabaseRuntime {
  if (!platformDatabase) {
    throw new Error(
      'Local auth is not configured on this server instance (BuildAppOptions.platformDatabase missing).',
    );
  }
  return platformDatabase;
}

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- same IncomingHttpHeaders quirk session-auth.ts's extractBearerToken disables */
function extractBearerToken(headers: IncomingHttpHeaders): string | null {
  const value = Array.isArray(headers['authorization']) ? headers['authorization'][0] : headers['authorization'];
  if (!value) return null;
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError(`Field "${field}" is required`);
  }
  return value;
}

export function registerCustomerAuthRoutes(app: FastifyInstance, options: CustomerAuthRoutesOptions): void {
  const { customerHooks } = options;
  const loginAbuseProtector = new LoginAbuseProtector({ store: new InMemoryRateLimitStore() });

  app.post<{ Body: { agencySlug?: string; email?: string; password?: string } }>(
    '/customer-auth/login',
    async (request, reply) => {
      const platformDatabase = requirePlatformDatabase(options.platformDatabase);
      const body = request.body ?? {};
      const agencySlug = requireString(body.agencySlug, 'agencySlug');
      const email = requireString(body.email, 'email');
      const password = requireString(body.password, 'password');
      const ip = request.ip;
      const accountId = `customer:${agencySlug}:${email.toLowerCase()}`;

      const decision = await loginAbuseProtector.check({ accountId, ip });
      if (decision.state === 'temporary_block') {
        reply.code(429);
        return { error: 'Muitas tentativas. Tente novamente mais tarde.', retryAfterSeconds: decision.retryAfterSeconds };
      }

      try {
        const result = await customerLogin(platformDatabase, { agencySlug, email, password, ip });
        await loginAbuseProtector.recordSuccess({ accountId, ip });
        return {
          state: 'FULLY_AUTHENTICATED',
          sessionToken: result.sessionToken,
          expiresAt: result.expiresAt,
          customer: { id: result.customerId, agencyId: result.agencyId, email: result.email },
        };
      } catch {
        const abuseDecision = await loginAbuseProtector.recordFailure({ accountId, ip });
        reply.code(401);
        return {
          error: 'Email ou senha inválidos',
          captchaRequired: abuseDecision.state === 'captcha_required',
        };
      }
    },
  );

  app.post('/customer-auth/forgot-password', async (request, reply) => {
    const platformDatabase = requirePlatformDatabase(options.platformDatabase);
    const body = (request.body ?? {}) as { agencySlug?: string; email?: string };
    const agencySlug = requireString(body.agencySlug, 'agencySlug');
    const email = requireString(body.email, 'email');
    await customerForgotPassword(platformDatabase, agencySlug, email, request.ip);
    reply.code(200);
    return { message: 'Se este email existir, enviaremos instruções de redefinição.' };
  });

  app.post<{ Body: { token?: string; newPassword?: string } }>(
    '/customer-auth/reset-password',
    async (request, reply) => {
      const platformDatabase = requirePlatformDatabase(options.platformDatabase);
      const body = request.body ?? {};
      const token = requireString(body.token, 'token');
      const newPassword = requireString(body.newPassword, 'newPassword');
      try {
        await customerResetPassword(platformDatabase, token, newPassword);
        return { message: 'Senha redefinida com sucesso.' };
      } catch (error: unknown) {
        reply.code(400);
        return { error: error instanceof Error ? error.message : 'Não foi possível redefinir a senha' };
      }
    },
  );

  app.post('/customer-auth/logout', { preHandler: customerHooks }, async (request, reply) => {
    const platformDatabase = requirePlatformDatabase(options.platformDatabase);
    const token = extractBearerToken(request.headers);
    if (token) {
      await customerLogout(platformDatabase, token);
    }
    reply.code(204);
    return null;
  });
}
