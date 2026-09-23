import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../services/api/src/app';
import type { DatabaseRuntime } from '../../services/api/src/database';
import {
  createProductionPlatformAuthProvider,
  createServerPlatformAuthProvider,
  isPlatformDevAuthEnabled,
  PlatformDevAuthProvider,
} from '../../services/api/src/platform-dev-auth';
import { PlatformUserRole } from '../../packages/domain/types';

const forgedHeaders = {
  'x-dev-platform-user-id': 'attacker-1',
  'x-dev-platform-user-role': PlatformUserRole.PLATFORM_OWNER,
};

function buildTestApp(platformAuthProvider?: Parameters<typeof buildApp>[0]['platformAuthProvider']) {
  return buildApp({
    authProvider: { authenticate: () => Promise.resolve(null) },
    validateUserAgencyAccess: () => Promise.resolve(false),
    database: {
      withTenantTransaction: () => {
        throw new Error('staff tenant database runtime must not be used by platform routes');
      },
      withPlatformTransaction() {
        return Promise.resolve([]);
      },
    } as unknown as DatabaseRuntime,
    ...(platformAuthProvider ? { platformAuthProvider } : {}),
    // Explicit CORS policy so production-NODE_ENV tests do not depend on
    // process.env (resolveCorsPolicy throws when CORS_ALLOWED_ORIGINS is
    // unset under NODE_ENV=production).
    corsPolicy: {
      isProduction: true,
      allowedOrigins: ['https://app.example.test'],
      allowLocalhostAnyPort: false,
    },
    rateLimit: {
      // Keep the rate-limit runtime out of production mode even when the
      // surrounding test stubs NODE_ENV=production for the auth provider.
      environment: { NODE_ENV: 'test' },
      classLimits: { SYSTEM_INTERNAL: { windowMs: 60_000, max: 50 } },
    },
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isPlatformDevAuthEnabled dual-gate', () => {
  it('is off unless ALLOW_DEV_AUTH is exactly "true" outside production', () => {
    expect(isPlatformDevAuthEnabled({ NODE_ENV: 'development' })).toBe(false);
    expect(isPlatformDevAuthEnabled({ NODE_ENV: 'test', ALLOW_DEV_AUTH: 'true' })).toBe(true);
    expect(isPlatformDevAuthEnabled({ NODE_ENV: 'development', ALLOW_DEV_AUTH: 'true' })).toBe(true);
    expect(isPlatformDevAuthEnabled({ NODE_ENV: 'development', ALLOW_DEV_AUTH: 'false' })).toBe(false);
  });

  it('is always off in production, even with ALLOW_DEV_AUTH=true', () => {
    expect(isPlatformDevAuthEnabled({ NODE_ENV: 'production', ALLOW_DEV_AUTH: 'true' })).toBe(false);
    expect(isPlatformDevAuthEnabled({ NODE_ENV: 'production' })).toBe(false);
  });
});

describe('PlatformDevAuthProvider', () => {
  it('ignores forged headers when the dual-gate is closed', async () => {
    const provider = new PlatformDevAuthProvider({ NODE_ENV: 'development' });
    const principal = await provider.authenticate({ headers: forgedHeaders });
    expect(principal).toBeNull();
  });

  it('ignores forged headers in production even with ALLOW_DEV_AUTH=true', async () => {
    const provider = new PlatformDevAuthProvider({
      NODE_ENV: 'production',
      ALLOW_DEV_AUTH: 'true',
    });
    const principal = await provider.authenticate({ headers: forgedHeaders });
    expect(principal).toBeNull();
  });

  it('accepts a valid role only when the dual-gate is open', async () => {
    const provider = new PlatformDevAuthProvider({
      NODE_ENV: 'development',
      ALLOW_DEV_AUTH: 'true',
    });
    const principal = await provider.authenticate({ headers: forgedHeaders });
    expect(principal).toMatchObject({
      platformUserId: 'attacker-1',
      role: PlatformUserRole.PLATFORM_OWNER,
    });
  });

  it('rejects a role outside the PlatformUserRole enum even when the gate is open', async () => {
    const provider = new PlatformDevAuthProvider({
      NODE_ENV: 'development',
      ALLOW_DEV_AUTH: 'true',
    });
    const principal = await provider.authenticate({
      headers: {
        'x-dev-platform-user-id': 'dev-1',
        'x-dev-platform-user-role': 'ANYTHING',
      },
    });
    expect(principal).toBeNull();
  });

  it('rejects a missing or blank user id even when the gate is open', async () => {
    const provider = new PlatformDevAuthProvider({
      NODE_ENV: 'development',
      ALLOW_DEV_AUTH: 'true',
    });
    expect(
      await provider.authenticate({
        headers: { 'x-dev-platform-user-role': PlatformUserRole.PLATFORM_ADMIN },
      }),
    ).toBeNull();
    expect(
      await provider.authenticate({
        headers: {
          'x-dev-platform-user-id': '   ',
          'x-dev-platform-user-role': PlatformUserRole.PLATFORM_ADMIN,
        },
      }),
    ).toBeNull();
  });
});

describe('createProductionPlatformAuthProvider / createServerPlatformAuthProvider', () => {
  it('production provider always denies, regardless of headers', async () => {
    const provider = createProductionPlatformAuthProvider();
    const principal = await provider.authenticate({ headers: forgedHeaders });
    expect(principal).toBeNull();
  });

  it('server factory returns the deny-all provider in production', async () => {
    const provider = createServerPlatformAuthProvider({
      NODE_ENV: 'production',
      ALLOW_DEV_AUTH: 'true',
    });
    expect(await provider.authenticate({ headers: forgedHeaders })).toBeNull();
  });

  it('server factory returns the gated dev provider outside production', async () => {
    const provider = createServerPlatformAuthProvider({
      NODE_ENV: 'development',
      ALLOW_DEV_AUTH: 'true',
    });
    expect(
      await provider.authenticate({ headers: forgedHeaders }),
    ).toMatchObject({ role: PlatformUserRole.PLATFORM_OWNER });
  });
});

describe('F-01: buildApp platform auth in production', () => {
  it('rejects forged x-dev-platform-* headers with 401 when NODE_ENV=production (no provider injected)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const app = buildTestApp();

    const response = await app.inject({
      method: 'GET',
      url: '/platform/subscribers',
      headers: forgedHeaders,
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'UNAUTHORIZED' });
    await app.close();
  });

  it('rejects forged headers with 401 when the production provider is injected explicitly', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const app = buildTestApp(createServerPlatformAuthProvider({
      NODE_ENV: 'production',
      ALLOW_DEV_AUTH: 'true',
    }));

    const response = await app.inject({
      method: 'GET',
      url: '/platform/audit',
      headers: forgedHeaders,
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('rejects forged headers with 401 on write routes in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const app = buildTestApp();

    const response = await app.inject({
      method: 'PATCH',
      url: '/platform/subscriptions/sub-1/status',
      headers: forgedHeaders,
      payload: { status: 'CANCELLED' },
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('still rejects unauthenticated requests without any headers (401, not 500)', async () => {
    const app = buildTestApp();
    const response = await app.inject({ method: 'GET', url: '/platform/plans' });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('rejects an out-of-enum role with 401 even when the dual-gate would otherwise be open', async () => {
    // Inject the gated dev provider directly (as local server.ts would),
    // with the gate open, but send an invalid role.
    const app = buildTestApp(
      new PlatformDevAuthProvider({ NODE_ENV: 'development', ALLOW_DEV_AUTH: 'true' }),
    );

    const response = await app.inject({
      method: 'GET',
      url: '/platform/plans',
      headers: {
        'x-dev-platform-user-id': 'dev-1',
        'x-dev-platform-user-role': 'NOT_A_REAL_ROLE',
      },
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });
});
