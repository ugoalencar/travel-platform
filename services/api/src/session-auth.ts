/**
 * Session-token AuthProvider (Pilot Delivery Gap Closure -- Agent 02/Identity).
 *
 * Validates the `Authorization: Bearer <sessionToken>` header issued by
 * POST /auth/login (or /auth/mfa/verify) against auth_sessions, via
 * local-auth.ts's resolveSessionByToken. A separate, additive provider
 * from dev-auth.ts's header-based bypass -- composeAuthProviders() tries
 * each in order so local sessions work identically whether or not
 * ALLOW_DEV_AUTH is set.
 */

import type { IncomingHttpHeaders } from 'node:http';
import type { AuthProvider, AuthenticatedPrincipal } from './auth';
import type { CustomerAuthProvider } from './customer-auth';
import type { PlatformAuthProvider } from './platform-auth';
import type { PlatformDatabaseRuntime } from './database';
import { resolveSessionByToken } from './local-auth';

export function createSessionAuthProvider(platformDatabase: PlatformDatabaseRuntime): AuthProvider {
  return {
    async authenticate(request: { headers: IncomingHttpHeaders }): Promise<AuthenticatedPrincipal | null> {
      const token = extractBearerToken(request.headers);
      if (!token) {
        return null;
      }

      const session = await resolveSessionByToken(platformDatabase, token);
      if (!session) {
        return null;
      }

      return {
        userId: session.userId,
        agencyId: session.agencyId,
        role: session.role,
        email: session.email,
      };
    },
  };
}

/**
 * Tries each provider in order, returning the first non-null result.
 * Lets local session auth work whether or not ALLOW_DEV_AUTH is set,
 * without either provider needing to know about the other.
 */
export function composeAuthProviders(...providers: AuthProvider[]): AuthProvider {
  return {
    async authenticate(request) {
      for (const provider of providers) {
        const principal = await provider.authenticate(request);
        if (principal) {
          return principal;
        }
      }
      return null;
    },
  };
}

/** Same compose pattern as composeAuthProviders(), for CustomerAuthProvider's
 * differently-named method. */
export function composeCustomerAuthProviders(
  ...providers: CustomerAuthProvider[]
): CustomerAuthProvider {
  return {
    async authenticateCustomer(request) {
      for (const provider of providers) {
        const principal = await provider.authenticateCustomer(request);
        if (principal) {
          return principal;
        }
      }
      return null;
    },
  };
}

/** Same compose pattern as composeAuthProviders(), for PlatformAuthProvider. */
export function composePlatformAuthProviders(
  ...providers: PlatformAuthProvider[]
): PlatformAuthProvider {
  return {
    async authenticate(request) {
      for (const provider of providers) {
        const principal = await provider.authenticate(request);
        if (principal) {
          return principal;
        }
      }
      return null;
    },
  };
}

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- same IncomingHttpHeaders quirk production-auth.ts's getAuthorizationHeader disables at file level */
function extractBearerToken(headers: IncomingHttpHeaders): string | null {
  const authorization = headers['authorization'];
  const value = Array.isArray(authorization) ? authorization[0] : authorization;
  if (!value) return null;
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}
