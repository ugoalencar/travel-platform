/**
 * Session-token PlatformAuthProvider (Frontend Auth & Session track,
 * decided 2026-09-14). Mirrors session-auth.ts's staff provider exactly,
 * against platform_sessions instead.
 */

import type { IncomingHttpHeaders } from 'node:http';
import type { PlatformAuthProvider, PlatformAuthenticatedPrincipal } from './platform-auth';
import type { PlatformDatabaseRuntime } from './database';
import { resolvePlatformSessionByToken } from './platform-local-auth';

export function createPlatformSessionAuthProvider(
  platformDatabase: PlatformDatabaseRuntime,
): PlatformAuthProvider {
  return {
    async authenticate(request: {
      headers: IncomingHttpHeaders;
    }): Promise<PlatformAuthenticatedPrincipal | null> {
      const token = extractBearerToken(request.headers);
      if (!token) return null;

      const session = await resolvePlatformSessionByToken(platformDatabase, token);
      if (!session) return null;

      return { platformUserId: session.platformUserId, role: session.role, email: session.email };
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
