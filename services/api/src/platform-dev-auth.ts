import type { PlatformAuthProvider, PlatformAuthenticatedPrincipal } from './platform-auth';
import { PlatformUserRole } from '../../../packages/domain/types';
import type { ServerEnvironment } from './dev-auth';

const devAuthFlag = 'true';

/**
 * Dual-gate for platform dev auth, identical in shape to staff/customer
 * dev auth (dev-auth.ts isDevAuthEnabled): the bypass only activates when
 * ALLOW_DEV_AUTH is the literal "true" AND NODE_ENV is not production.
 * Either condition alone is never enough.
 */
export function isPlatformDevAuthEnabled(environment: ServerEnvironment = process.env): boolean {
  return environment.ALLOW_DEV_AUTH === devAuthFlag && environment.NODE_ENV !== 'production';
}

function isPlatformUserRole(value: string): value is PlatformUserRole {
  return Object.values(PlatformUserRole).includes(value as PlatformUserRole);
}

function readHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const value = headers[name];
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

/**
 * Header-based platform dev auth. Fail-closed by default: unless the
 * dual-gate is open, every request resolves to null (unauthenticated) --
 * forged x-dev-platform-* headers are ignored entirely. When the gate is
 * open (local/dev only), the role header is still validated against the
 * PlatformUserRole enum; an unknown role is rejected rather than cast.
 */
export class PlatformDevAuthProvider implements PlatformAuthProvider {
  private readonly environment: ServerEnvironment;

  constructor(environment: ServerEnvironment = process.env) {
    this.environment = environment;
  }

  authenticate(request: {
    headers: Record<string, string | string[] | undefined>;
  }): Promise<PlatformAuthenticatedPrincipal | null> {
    if (!isPlatformDevAuthEnabled(this.environment)) {
      return Promise.resolve(null);
    }

    const platformUserId = readHeader(request.headers, 'x-dev-platform-user-id');
    const role = readHeader(request.headers, 'x-dev-platform-user-role');

    if (
      typeof platformUserId !== 'string' ||
      platformUserId.trim().length === 0 ||
      typeof role !== 'string' ||
      !isPlatformUserRole(role)
    ) {
      return Promise.resolve(null);
    }

    const result: PlatformAuthenticatedPrincipal = {
      platformUserId,
      role,
      email: 'dev-platform-admin@example.com',
    };
    return Promise.resolve(result);
  }
}

/**
 * Deny-all provider for production (and for any buildApp() caller that
 * does not inject a provider explicitly). Never reads headers; always
 * resolves null. This is the fail-closed default so a missing injection
 * can never silently fall back to header trust.
 */
export function createProductionPlatformAuthProvider(): PlatformAuthProvider {
  return {
    authenticate() {
      return Promise.resolve(null);
    },
  };
}

/**
 * Environment-selected provider used by server.ts: the self-gated dev
 * provider outside production, the deny-all production provider in
 * production. Explicitly injected so buildApp()'s default is never relied
 * on for the real server process.
 */
export function createServerPlatformAuthProvider(
  environment: ServerEnvironment = process.env,
): PlatformAuthProvider {
  if (environment.NODE_ENV === 'production') {
    return createProductionPlatformAuthProvider();
  }
  return new PlatformDevAuthProvider(environment);
}
