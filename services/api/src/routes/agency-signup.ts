/**
 * Public agency self-service signup HTTP surface (Navigable Pilot Flow
 * track). Mirrors routes/auth.ts's shape -- public, rate-limited via
 * classifyRateLimitRequest's AUTH_LOGIN class, plus LoginAbuseProtector.
 */

import type { FastifyInstance } from 'fastify';
import type { PlatformDatabaseRuntime } from '../database';
import { ValidationError } from '../errors';
import { InMemoryRateLimitStore, LoginAbuseProtector } from '../rate-limit';
import { signUpAgency } from '../agency-signup';

export interface AgencySignupRoutesOptions {
  platformDatabase?: PlatformDatabaseRuntime;
}

function requirePlatformDatabase(platformDatabase: PlatformDatabaseRuntime | undefined): PlatformDatabaseRuntime {
  if (!platformDatabase) {
    throw new Error(
      'Local auth is not configured on this server instance (BuildAppOptions.platformDatabase missing).',
    );
  }
  return platformDatabase;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError(`Field "${field}" is required`);
  }
  return value;
}

interface SignupBody {
  agencyName?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  country?: string;
  companyIdentifier?: string;
  password?: string;
}

export function registerAgencySignupRoutes(app: FastifyInstance, options: AgencySignupRoutesOptions): void {
  const loginAbuseProtector = new LoginAbuseProtector({ store: new InMemoryRateLimitStore() });

  app.post<{ Body: SignupBody }>('/agencies/signup', async (request, reply) => {
    const platformDatabase = requirePlatformDatabase(options.platformDatabase);
    const body = request.body ?? {};
    const agencyName = requireString(body.agencyName, 'agencyName');
    const contactName = requireString(body.contactName, 'contactName');
    const contactEmail = requireString(body.contactEmail, 'contactEmail');
    const password = requireString(body.password, 'password');
    const ip = request.ip;
    const accountId = `signup:${contactEmail.toLowerCase()}`;

    const decision = await loginAbuseProtector.check({ accountId, ip });
    if (decision.state === 'temporary_block') {
      reply.code(429);
      return { error: 'Muitas tentativas. Tente novamente mais tarde.', retryAfterSeconds: decision.retryAfterSeconds };
    }

    try {
      const result = await signUpAgency(platformDatabase, {
        agencyName,
        contactName,
        contactEmail,
        ...(body.contactPhone ? { contactPhone: body.contactPhone } : {}),
        ...(body.country ? { country: body.country } : {}),
        ...(body.companyIdentifier ? { companyIdentifier: body.companyIdentifier } : {}),
        password,
        ip,
      });
      await loginAbuseProtector.recordSuccess({ accountId, ip });

      if (result.state === 'MFA_REQUIRED') {
        // Cannot happen right after signup (no MFA enrolled yet), but the
        // type is shared with login() -- handled for completeness.
        return { state: result.state, mfaChallengeToken: result.sessionToken, expiresAt: result.expiresAt };
      }
      return {
        state: result.state,
        sessionToken: result.sessionToken,
        expiresAt: result.expiresAt,
        user: { id: result.userId, agencyId: result.agencyId, role: result.role, email: result.email },
      };
    } catch (error: unknown) {
      await loginAbuseProtector.recordFailure({ accountId, ip });
      throw error;
    }
  });
}
