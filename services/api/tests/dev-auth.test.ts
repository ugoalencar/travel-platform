import { describe, expect, it } from 'vitest';
import { UserRole } from '../../../packages/domain/types';
import {
  createServerAccessValidator,
  createServerAuthProvider,
  createServerCustomerAuthProvider,
  isDevAuthEnabled,
} from '../src/dev-auth';

describe('local manual dev auth', () => {
  const userAId = '11000000-0000-4000-8000-000000000001';
  const userBId = '21000000-0000-4000-8000-000000000001';
  const agencyAId = '10000000-0000-4000-8000-000000000001';
  const agencyBId = '20000000-0000-4000-8000-000000000001';
  const unknownUserId = '99000000-0000-4000-8000-000000000001';
  const unknownAgencyId = '90000000-0000-4000-8000-000000000001';

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
        'x-dev-user-id': userAId,
        'x-dev-agency-id': agencyAId,
        'x-dev-role': UserRole.ADMIN,
      },
    });

    expect(principal).toEqual({
      userId: userAId,
      agencyId: agencyAId,
      role: UserRole.ADMIN,
      email: 'dev-local@example.test',
    });
  });

  it('creates the Agency B synthetic principal only for the authorized Agency B pair', async () => {
    const authProvider = createServerAuthProvider({
      NODE_ENV: 'development',
      ALLOW_DEV_AUTH: 'true',
    });

    const principal = await authProvider.authenticate({
      headers: {
        'x-dev-user-id': userBId,
        'x-dev-agency-id': agencyBId,
        'x-dev-role': UserRole.ADMIN,
      },
    });

    expect(principal).toEqual({
      userId: userBId,
      agencyId: agencyBId,
      role: UserRole.ADMIN,
      email: 'dev-local@example.test',
    });
  });

  it('rejects synthetic principals with unauthorized user and agency pairs', async () => {
    const authProvider = createServerAuthProvider({
      NODE_ENV: 'development',
      ALLOW_DEV_AUTH: 'true',
    });

    await expect(
      authProvider.authenticate({
        headers: {
          'x-dev-user-id': userAId,
          'x-dev-agency-id': agencyBId,
          'x-dev-role': UserRole.ADMIN,
        },
      }),
    ).resolves.toBeNull();

    await expect(
      authProvider.authenticate({
        headers: {
          'x-dev-user-id': userBId,
          'x-dev-agency-id': agencyAId,
          'x-dev-role': UserRole.ADMIN,
        },
      }),
    ).resolves.toBeNull();
  });

  it('rejects unknown synthetic users and agencies', async () => {
    const authProvider = createServerAuthProvider({
      NODE_ENV: 'development',
      ALLOW_DEV_AUTH: 'true',
    });

    await expect(
      authProvider.authenticate({
        headers: {
          'x-dev-user-id': unknownUserId,
          'x-dev-agency-id': agencyAId,
          'x-dev-role': UserRole.ADMIN,
        },
      }),
    ).resolves.toBeNull();

    await expect(
      authProvider.authenticate({
        headers: {
          'x-dev-user-id': userAId,
          'x-dev-agency-id': unknownAgencyId,
          'x-dev-role': UserRole.ADMIN,
        },
      }),
    ).resolves.toBeNull();
  });

  it('rejects role escalation for an otherwise authorized synthetic principal', async () => {
    const authProvider = createServerAuthProvider({
      NODE_ENV: 'development',
      ALLOW_DEV_AUTH: 'true',
    });

    await expect(
      authProvider.authenticate({
        headers: {
          'x-dev-user-id': userAId,
          'x-dev-agency-id': agencyAId,
          'x-dev-role': 'OWNER_BUT_NOT_VALID_HERE',
        },
      }),
    ).resolves.toBeNull();
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
          'x-dev-agency-id': agencyAId,
          'x-dev-role': UserRole.ADMIN,
        },
      }),
    ).resolves.toBeNull();

    await expect(
      authProvider.authenticate({
        headers: {
          'x-dev-user-id': '11000000-0000-4000-8000-000000000001',
          'x-dev-agency-id': agencyAId,
          'x-dev-role': 'OWNER_BUT_NOT_VALID_HERE',
        },
      }),
    ).resolves.toBeNull();

    await expect(
      authProvider.authenticate({
        headers: {
          'x-dev-user-id': userAId,
          'x-dev-role': UserRole.ADMIN,
        },
      }),
    ).resolves.toBeNull();

    await expect(
      authProvider.authenticate({
        headers: {
          'x-dev-user-id': userAId,
          'x-dev-agency-id': agencyAId,
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

    await expect(enabled(userAId, agencyAId)).resolves.toBe(true);
    await expect(enabled(userBId, agencyBId)).resolves.toBe(true);
    await expect(enabled(userAId, agencyBId)).resolves.toBe(false);
    await expect(enabled(userBId, agencyAId)).resolves.toBe(false);
    await expect(enabled(unknownUserId, agencyAId)).resolves.toBe(false);
    await expect(enabled(userAId, unknownAgencyId)).resolves.toBe(false);
    await expect(disabled(userAId, agencyAId)).resolves.toBe(false);
    await expect(production(userAId, agencyAId)).resolves.toBe(false);
  });

  // SEC-H proof (stream brief step 2): confirms the ALLOW_DEV_AUTH +
  // NODE_ENV dual-gate genuinely holds for every dev-auth surface, not just
  // isDevAuthEnabled() in isolation -- including the customer-portal dev
  // auth provider, which is not exercised by any test above.
  it('PROOF: ALLOW_DEV_AUTH=true combined with NODE_ENV=production does NOT enable dev auth on any surface', async () => {
    const prodEnv = { NODE_ENV: 'production', ALLOW_DEV_AUTH: 'true' };

    expect(isDevAuthEnabled(prodEnv)).toBe(false);

    const staffAuth = createServerAuthProvider(prodEnv);
    await expect(
      staffAuth.authenticate({
        headers: {
          'x-dev-user-id': userAId,
          'x-dev-agency-id': agencyAId,
          'x-dev-role': UserRole.ADMIN,
        },
      }),
    ).resolves.toBeNull();

    const accessValidator = createServerAccessValidator(prodEnv);
    await expect(accessValidator(userAId, agencyAId)).resolves.toBe(false);

    const customerAuth = createServerCustomerAuthProvider(prodEnv);
    await expect(
      customerAuth.authenticateCustomer({
        headers: { 'x-dev-customer': 'agency-a' },
      }),
    ).resolves.toBeNull();
  });
});
