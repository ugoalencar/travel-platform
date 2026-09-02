import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import type { DatabaseRuntime } from '../src/database';
import { PlatformUserRole } from '../../../packages/domain/types';

function buildPlatformApp() {
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
    platformAuthProvider: {
      authenticate(request) {
        return Promise.resolve(
          request.headers['x-test-platform-user'] === 'platform-user-1'
            ? {
                platformUserId: 'platform-user-1',
                role: PlatformUserRole.PLATFORM_ADMIN,
                email: 'platform-admin@example.test',
              }
            : null
        );
      },
    },
    rateLimit: {
      classLimits: {
        SYSTEM_INTERNAL: { windowMs: 60_000, max: 10 },
      },
    },
  });
}

describe('platform route authentication', () => {
  it('requires platform auth for platform-admin routes', async () => {
    const app = buildPlatformApp();

    const response = await app.inject({
      method: 'GET',
      url: '/platform/plans',
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: 'Platform authentication required',
      code: 'UNAUTHORIZED',
    });

    await app.close();
  });

  it('serves platform-admin routes without staff tenant context', async () => {
    const app = buildPlatformApp();

    const response = await app.inject({
      method: 'GET',
      url: '/platform/plans',
      headers: {
        'x-test-platform-user': 'platform-user-1',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ plans: [] });

    await app.close();
  });
});
