/**
 * Session-token CustomerAuthProvider (Frontend Auth & Session track,
 * decided 2026-09-14). Mirrors session-auth.ts's staff provider exactly,
 * against customer_accounts sessions instead.
 */

import type { IncomingHttpHeaders } from 'node:http';
import type { CustomerAuthProvider, AuthenticatedCustomerPrincipal } from './customer-auth';
import type { PlatformDatabaseRuntime } from './database';
import { resolveCustomerSessionByToken } from './customer-local-auth';

export function createCustomerSessionAuthProvider(
  platformDatabase: PlatformDatabaseRuntime,
): CustomerAuthProvider {
  return {
    async authenticateCustomer(request: {
      headers: IncomingHttpHeaders;
    }): Promise<AuthenticatedCustomerPrincipal | null> {
      const token = extractBearerToken(request.headers);
      if (!token) return null;

      const session = await resolveCustomerSessionByToken(platformDatabase, token);
      if (!session) return null;

      return { agencyId: session.agencyId, customerId: session.customerId };
    },
  };
}

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- same IncomingHttpHeaders quirk session-auth.ts's extractBearerToken disables */
function extractBearerToken(headers: IncomingHttpHeaders): string | null {
  const authorization = headers['authorization'];
  const value = Array.isArray(authorization) ? authorization[0] : authorization;
  if (!value) return null;
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}
