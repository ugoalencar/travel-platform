/**
 * Local email+password auth HTTP surface for Platform Admin
 * (Frontend Auth & Session track, decided 2026-09-14). Mirrors
 * routes/auth.ts's staff surface; login is global (no agencySlug --
 * platform_users.email is globally unique, not tenant-scoped).
 */

import type { FastifyInstance } from 'fastify';
import type { preHandlerHookHandler } from 'fastify';
import type { IncomingHttpHeaders } from 'node:http';
import type { PlatformDatabaseRuntime } from '../database';
import { ValidationError } from '../errors';
import { UnauthorizedError } from '../../../../packages/domain/tenant-context';
import { InMemoryRateLimitStore, LoginAbuseProtector } from '../rate-limit';
import {
  platformLogin,
  platformLogout,
  verifyPlatformMfaAndCompleteLogin,
} from '../platform-local-auth';

export interface PlatformAuthRoutesOptions {
  platformDatabase?: PlatformDatabaseRuntime;
  platformProtectedHooks: preHandlerHookHandler[];
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

export function registerPlatformAuthRoutes(app: FastifyInstance, options: PlatformAuthRoutesOptions): void {
  const { platformProtectedHooks } = options;
  const loginAbuseProtector = new LoginAbuseProtector({ store: new InMemoryRateLimitStore() });

  app.post<{ Body: { email?: string; password?: string } }>('/platform-auth/login', async (request, reply) => {
    const platformDatabase = requirePlatformDatabase(options.platformDatabase);
    const body = request.body ?? {};
    const email = requireString(body.email, 'email');
    const password = requireString(body.password, 'password');
    const ip = request.ip;
    const accountId = `platform:${email.toLowerCase()}`;

    const decision = await loginAbuseProtector.check({ accountId, ip });
    if (decision.state === 'temporary_block') {
      reply.code(429);
      return { error: 'Muitas tentativas. Tente novamente mais tarde.', retryAfterSeconds: decision.retryAfterSeconds };
    }

    try {
      const result = await platformLogin(platformDatabase, { email, password, ip });
      await loginAbuseProtector.recordSuccess({ accountId, ip });

      if (result.state === 'MFA_REQUIRED') {
        return { state: result.state, mfaChallengeToken: result.sessionToken, expiresAt: result.expiresAt };
      }
      return {
        state: result.state,
        sessionToken: result.sessionToken,
        expiresAt: result.expiresAt,
        user: { id: result.platformUserId, email: result.email, role: result.role },
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
  });

  app.post<{ Body: { sessionToken?: string; code?: string } }>('/platform-auth/mfa/verify', async (request, reply) => {
    const platformDatabase = requirePlatformDatabase(options.platformDatabase);
    const body = request.body ?? {};
    const sessionToken = requireString(body.sessionToken, 'sessionToken');
    const code = requireString(body.code, 'code');

    try {
      const result = await verifyPlatformMfaAndCompleteLogin(platformDatabase, { sessionToken, code });
      return {
        state: 'FULLY_AUTHENTICATED',
        sessionToken: result.sessionToken,
        expiresAt: result.expiresAt,
        user: { id: result.platformUserId, email: result.email, role: result.role },
      };
    } catch (error: unknown) {
      if (error instanceof UnauthorizedError) {
        reply.code(401);
        return { error: error.message };
      }
      throw error;
    }
  });

  app.post('/platform-auth/logout', { preHandler: platformProtectedHooks }, async (request, reply) => {
    const platformDatabase = requirePlatformDatabase(options.platformDatabase);
    const token = extractBearerToken(request.headers);
    if (token) {
      await platformLogout(platformDatabase, token);
    }
    reply.code(204);
    return null;
  });
}
