import { describe, expect, it } from 'vitest';
import { UserRole } from '../../../packages/domain/types';
import {
  createServerAccessValidator,
  createServerAuthProvider,
  isDevAuthEnabled,
} from '../src/dev-auth';

describe('local manual dev auth', () => {
  it('keeps dev auth disabled unless the explicit flag is enabled outside production', () => {
    expect(isDevAuthEnabled({ NODE_ENV: 'development' })).toBe(false);
    expect(isDevAuthEnabled({ NODE_ENV: 'test', ALLOW_DEV_AUTH: 'true' })).toBe(true);
    expect(isDevAuthEnabled({ NODE_ENV: 'development', ALLOW_DEV_AUTH: 'true' })).toBe(true);
  });

  it('blocks dev auth in production even when the explicit flag is set', () => {
    expect(isDevAuthEnabled({ NODE_ENV: 'production', ALLOW_DEV_AUTH: 'true' })).toBe(false);
  });

  it('ignores dev headers when dev auth is disabled', async () => {
    const authProvider = createServerAuthProvider({
      NODE_ENV: 'development',
      ALLOW_DEV_AUTH: 'false',
    });

    const principal = await authProvider.authenticate({
      headers: {
        'x-dev-user-id': '11000000-0000-4000-8000-000000000001',
        'x-dev-agency-id': '10000000-0000-4000-8000-000000000001',
        'x-dev-role': UserRole.ADMIN,
      },
    });

    expect(principal).toBeNull();
  });

  it('creates a synthetic principal from valid dev headers only when enabled', async () => {
    const authProvider = createServerAuthProvider({
      NODE_ENV: 'development',
      ALLOW_DEV_AUTH: 'true',
    });

    const principal = await authProvider.authenticate({
      headers: {
        'x-dev-user-id': '11000000-0000-4000-8000-000000000001',
        'x-dev-agency-id': '10000000-0000-4000-8000-000000000001',
        'x-dev-role': UserRole.ADMIN,
      },
    });

    expect(principal).toEqual({
      userId: '11000000-0000-4000-8000-000000000001',
      agencyId: '10000000-0000-4000-8000-000000000001',
      role: UserRole.ADMIN,
      email: 'dev-local@example.test',
    });
  });

  it('rejects incomplete or invalid dev auth payloads', async () => {
    const authProvider = createServerAuthProvider({
      NODE_ENV: 'development',
      ALLOW_DEV_AUTH: 'true',
    });

    await expect(
      authProvider.authenticate({
        headers: {
          'x-dev-user-id': '',
          'x-dev-agency-id': '10000000-0000-4000-8000-000000000001',
          'x-dev-role': UserRole.ADMIN,
        },
      }),
    ).resolves.toBeNull();

    await expect(
      authProvider.authenticate({
        headers: {
          'x-dev-user-id': '11000000-0000-4000-8000-000000000001',
          'x-dev-agency-id': '10000000-0000-4000-8000-000000000001',
          'x-dev-role': 'OWNER_BUT_NOT_VALID_HERE',
        },
      }),
    ).resolves.toBeNull();
  });

  it('allows tenant validation only when dev auth is explicitly enabled outside production', async () => {
    const enabled = createServerAccessValidator({
      NODE_ENV: 'development',
      ALLOW_DEV_AUTH: 'true',
    });
    const disabled = createServerAccessValidator({
      NODE_ENV: 'development',
      ALLOW_DEV_AUTH: 'false',
    });
    const production = createServerAccessValidator({
      NODE_ENV: 'production',
      ALLOW_DEV_AUTH: 'true',
    });

    await expect(enabled('user-a', 'agency-a')).resolves.toBe(true);
    await expect(disabled('user-a', 'agency-a')).resolves.toBe(false);
    await expect(production('user-a', 'agency-a')).resolves.toBe(false);
  });
});
