import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import {
  assertSafeDatabasePools,
  assertSafeDatabaseRole,
  isLocalDatabaseHost,
  validateNonProductionDatabaseTargets,
  validateProductionEnvironment,
} from '../src/env';

const requireCjs = createRequire(import.meta.url);
const scriptGuard = requireCjs('../../../scripts/local-database-guard.cjs') as {
  findRemoteDatabaseTargets: (environment: Record<string, string | undefined>) => string[];
  isLocalDatabaseHost: (hostname: string) => boolean;
};

const PRODUCTION_POOLER_URL =
  'postgresql://travel_app_runtime.example:example-not-a-real-password@aws-0-us-east-1.pooler.supabase.com:5432/postgres';
const LOCAL_URL = 'postgresql://travel_test:example-local-password@127.0.0.1:55432/travel_platform_test';

describe('validateNonProductionDatabaseTargets (local dev must never reach production)', () => {
  it('blocks development startup with a production (Supabase pooler) DATABASE_URL', () => {
    expect(() =>
      validateNonProductionDatabaseTargets({ NODE_ENV: 'development', DATABASE_URL: PRODUCTION_POOLER_URL }),
    ).toThrow(/DATABASE_URL points to remote host "aws-0-us-east-1.pooler.supabase.com"/);
  });

  it('blocks a remote DATABASE_ADMIN_URL or PLATFORM_DATABASE_URL even when DATABASE_URL is local', () => {
    expect(() =>
      validateNonProductionDatabaseTargets({
        NODE_ENV: 'development',
        DATABASE_URL: LOCAL_URL,
        DATABASE_ADMIN_URL: PRODUCTION_POOLER_URL,
      }),
    ).toThrow(/DATABASE_ADMIN_URL points to remote host/);
    expect(() =>
      validateNonProductionDatabaseTargets({
        NODE_ENV: 'staging',
        DATABASE_URL: LOCAL_URL,
        PLATFORM_DATABASE_URL: 'postgresql://p:example-not-a-real-password@db.exampleprojectref.supabase.co:5432/postgres',
      }),
    ).toThrow(/PLATFORM_DATABASE_URL points to remote host/);
  });

  it('treats an unset NODE_ENV as non-production (fail closed)', () => {
    expect(() => validateNonProductionDatabaseTargets({ DATABASE_URL: PRODUCTION_POOLER_URL })).toThrow(
      /NODE_ENV is "unset"/,
    );
  });

  it('blocks dev auth against a production database (ALLOW_DEV_AUTH only works with a local DB)', () => {
    expect(() =>
      validateNonProductionDatabaseTargets({
        NODE_ENV: 'development',
        ALLOW_DEV_AUTH: 'true',
        DATABASE_URL: PRODUCTION_POOLER_URL,
      }),
    ).toThrow(/Refusing to start/);
  });

  it('rejects an unparseable database URL instead of ignoring it', () => {
    expect(() =>
      validateNonProductionDatabaseTargets({ NODE_ENV: 'development', DATABASE_URL: 'not a url' }),
    ).toThrow(/DATABASE_URL is not a valid connection URL/);
  });

  it('allows development with localhost / loopback / docker-compose service hosts', () => {
    expect(() =>
      validateNonProductionDatabaseTargets({
        NODE_ENV: 'development',
        ALLOW_DEV_AUTH: 'true',
        DATABASE_URL: LOCAL_URL,
        DATABASE_ADMIN_URL: 'postgresql://postgres:example-local-password@localhost:5433/travel_platform_dev',
        PLATFORM_DATABASE_URL: 'postgresql://staging_user:example-local-password@db:5432/travel_staging',
      }),
    ).not.toThrow();
    expect(() => validateNonProductionDatabaseTargets({ NODE_ENV: 'test' })).not.toThrow();
  });

  it('is a no-op in production (production DB allowed; production rules live in validateProductionEnvironment)', () => {
    expect(() =>
      validateNonProductionDatabaseTargets({ NODE_ENV: 'production', DATABASE_URL: PRODUCTION_POOLER_URL }),
    ).not.toThrow();
  });

  it('classifies hosts the same way in the API guard and the plain-Node script guard', () => {
    const cases: Array<[string, boolean]> = [
      ['localhost', true],
      ['127.0.0.1', true],
      ['[::1]', true],
      ['db', true],
      ['postgres-staging', true],
      ['host.docker.internal', true],
      ['aws-0-us-east-1.pooler.supabase.com', false],
      ['db.exampleprojectref.supabase.co', false],
      ['10.0.0.5', false],
      ['api.travelplataforma.com.br', false],
    ];
    for (const [host, local] of cases) {
      expect(isLocalDatabaseHost(host), host).toBe(local);
      expect(scriptGuard.isLocalDatabaseHost(host), `script:${host}`).toBe(local);
    }
  });

  it('script guard reports remote targets by host only, never credentials', () => {
    const problems = scriptGuard.findRemoteDatabaseTargets({
      DATABASE_URL: PRODUCTION_POOLER_URL,
      DATABASE_ADMIN_URL: LOCAL_URL,
    });
    expect(problems).toEqual(['DATABASE_URL: host remoto aws-0-us-east-1.pooler.supabase.com:5432']);
    expect(problems.join(' ')).not.toContain('not-a-real-password');
  });
});

describe('production startup with production database + dev auth', () => {
  it('blocks production + ALLOW_DEV_AUTH=true', () => {
    expect(() =>
      validateProductionEnvironment({
        NODE_ENV: 'production',
        ALLOW_DEV_AUTH: 'true',
        DATABASE_URL: PRODUCTION_POOLER_URL,
        PLATFORM_DATABASE_URL: PRODUCTION_POOLER_URL.replace('travel_app_runtime', 'travel_app_platform'),
        RATE_LIMIT_STORE: 'external',
        REDIS_URL: 'redis://redis.internal:6379',
        STORAGE_PROVIDER: 'supabase',
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'example-service-role-key-not-a-real-secret',
        MFA_ENCRYPTION_KEY: 'example-mfa-encryption-key-at-least-32-chars',
      }),
    ).toThrow(/ALLOW_DEV_AUTH must not be "true" in production/);
  });

  it('allows production + production database under the existing production rules', () => {
    expect(() =>
      validateProductionEnvironment({
        NODE_ENV: 'production',
        DATABASE_URL: PRODUCTION_POOLER_URL,
        PLATFORM_DATABASE_URL: PRODUCTION_POOLER_URL.replace('travel_app_runtime', 'travel_app_platform'),
        RATE_LIMIT_STORE: 'external',
        REDIS_URL: 'redis://redis.internal:6379',
        STORAGE_PROVIDER: 'supabase',
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'example-service-role-key-not-a-real-secret',
        MFA_ENCRYPTION_KEY: 'example-mfa-encryption-key-at-least-32-chars',
      }),
    ).not.toThrow();
  });
});

describe('validateProductionEnvironment', () => {
  it('is a no-op outside production (dev/test must never require prod config)', () => {
    expect(() => validateProductionEnvironment({ NODE_ENV: 'development' })).not.toThrow();
    expect(() => validateProductionEnvironment({ NODE_ENV: 'test' })).not.toThrow();
    expect(() => validateProductionEnvironment({})).not.toThrow();
  });

  it('throws when DATABASE_URL is missing in production', () => {
    expect(() => validateProductionEnvironment({ NODE_ENV: 'production', PORT: '3000' })).toThrow(
      /DATABASE_URL is required/
    );
  });

  it('throws when DATABASE_URL is blank/whitespace in production', () => {
    expect(() =>
      validateProductionEnvironment({
        NODE_ENV: 'production',
        DATABASE_URL: '   ',
      })
    ).toThrow(/DATABASE_URL is required/);
  });

  const validProductionBase = {
    NODE_ENV: 'production',
    DATABASE_URL:
      'postgresql://app_runtime:example-not-a-real-password@db.internal:5432/travel_platform',
    PLATFORM_DATABASE_URL:
      'postgresql://app_platform:example-not-a-real-password@db.internal:5432/travel_platform',
    PORT: '3000',
    RATE_LIMIT_STORE: 'external',
    REDIS_URL: 'redis://redis.internal:6379',
    STORAGE_PROVIDER: 'supabase',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'example-service-role-key-not-a-real-secret',
    MFA_ENCRYPTION_KEY: 'example-mfa-encryption-key-at-least-32-chars',
  };

  it('accepts a well-formed production environment', () => {
    expect(() => validateProductionEnvironment(validProductionBase)).not.toThrow();
  });

  // F-06: PLATFORM_DATABASE_URL must be present and distinct in production,
  // or platform-table access runs on (or falls back to) the runtime role
  // after migration 095 revoked those grants.
  it('refuses production boot when PLATFORM_DATABASE_URL is missing', () => {
    expect(() =>
      validateProductionEnvironment({
        ...validProductionBase,
        PLATFORM_DATABASE_URL: undefined,
      })
    ).toThrow(/PLATFORM_DATABASE_URL is required/);
  });

  it('refuses production boot when PLATFORM_DATABASE_URL equals DATABASE_URL (defeats F-06 separation)', () => {
    expect(() =>
      validateProductionEnvironment({
        ...validProductionBase,
        PLATFORM_DATABASE_URL: validProductionBase.DATABASE_URL,
      })
    ).toThrow(/must differ from DATABASE_URL/);
  });

  // F-07: MFA secrets cannot be encrypted at rest without a production key.
  it('refuses production boot when MFA_ENCRYPTION_KEY is missing', () => {
    expect(() =>
      validateProductionEnvironment({
        ...validProductionBase,
        MFA_ENCRYPTION_KEY: undefined,
      })
    ).toThrow(/MFA_ENCRYPTION_KEY is required/);
  });

  it('refuses production boot when MFA_ENCRYPTION_KEY is shorter than 32 characters', () => {
    expect(() =>
      validateProductionEnvironment({
        ...validProductionBase,
        MFA_ENCRYPTION_KEY: 'too-short-key',
      })
    ).toThrow(/at least 32 characters/);
  });

  it('refuses the process-local rate-limit store in production', () => {
    expect(() =>
      validateProductionEnvironment({
        NODE_ENV: 'production',
        DATABASE_URL:
          'postgresql://app_runtime:example-not-a-real-password@db.internal:5432/travel_platform',
        RATE_LIMIT_STORE: 'memory',
      })
    ).toThrow(/RATE_LIMIT_STORE must be "external" in production/);
  });

  it('throws when PORT is set but malformed', () => {
    expect(() =>
      validateProductionEnvironment({
        NODE_ENV: 'production',
        DATABASE_URL:
          'postgresql://app_runtime:example-not-a-real-password@db.internal:5432/travel_platform',
        PORT: 'not-a-port',
      })
    ).toThrow(/PORT must be a valid/);

    expect(() =>
      validateProductionEnvironment({
        NODE_ENV: 'production',
        DATABASE_URL:
          'postgresql://app_runtime:example-not-a-real-password@db.internal:5432/travel_platform',
        PORT: '0',
      })
    ).toThrow(/PORT must be a valid/);

    expect(() =>
      validateProductionEnvironment({
        NODE_ENV: 'production',
        DATABASE_URL:
          'postgresql://app_runtime:example-not-a-real-password@db.internal:5432/travel_platform',
        PORT: '99999',
      })
    ).toThrow(/PORT must be a valid/);
  });

  // PROHIBITED PRODUCTION FLAG PROOF: this is the SEC-H-owned proof (step 2
  // of the stream brief) that ALLOW_DEV_AUTH=true combined with
  // NODE_ENV=production still fails closed. dev-auth.test.ts already proves
  // isDevAuthEnabled()/createServerAuthProvider() ignore the flag under
  // production; this proves the *startup gate* also refuses to boot at all
  // in that combination, rather than silently starting with dev auth
  // merely inert.
  it('refuses to start when ALLOW_DEV_AUTH=true is present in production, even with otherwise-valid config', () => {
    expect(() =>
      validateProductionEnvironment({
        NODE_ENV: 'production',
        DATABASE_URL:
          'postgresql://app_runtime:example-not-a-real-password@db.internal:5432/travel_platform',
        ALLOW_DEV_AUTH: 'true',
        RATE_LIMIT_STORE: 'external',
        REDIS_URL: 'redis://localhost:6379',
      })
    ).toThrow(/ALLOW_DEV_AUTH must not be "true" in production/);
  });

  it('requires REDIS_URL in production when RATE_LIMIT_STORE is external', () => {
    expect(() =>
      validateProductionEnvironment({
        NODE_ENV: 'production',
        DATABASE_URL:
          'postgresql://app_runtime:example-not-a-real-password@db.internal:5432/travel_platform',
        RATE_LIMIT_STORE: 'external',
      })
    ).toThrow(/REDIS_URL is required in production when RATE_LIMIT_STORE is "external"/);
  });

  it('allows ALLOW_DEV_AUTH=false in production (only the literal "true" flag is prohibited)', () => {
    expect(() =>
      validateProductionEnvironment({
        ...validProductionBase,
        ALLOW_DEV_AUTH: 'false',
      })
    ).not.toThrow();
  });

  it('reports every issue at once rather than stopping at the first', () => {
    try {
      validateProductionEnvironment({
        NODE_ENV: 'production',
        ALLOW_DEV_AUTH: 'true',
        PORT: 'nope',
      });
      throw new Error('expected validateProductionEnvironment to throw');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toMatch(/DATABASE_URL is required/);
      expect(message).toMatch(/PORT must be a valid/);
      expect(message).toMatch(/ALLOW_DEV_AUTH must not be "true"/);
      expect(message).toMatch(/STORAGE_PROVIDER is required/);
    }
  });

  // F-05: production must never boot with an implicit/unconfigured object
  // store -- customer documents would silently land on the container's
  // ephemeral disk and vanish on redeploy.
  it('refuses production boot when STORAGE_PROVIDER is missing', () => {
    expect(() =>
      validateProductionEnvironment({
        NODE_ENV: 'production',
        DATABASE_URL:
          'postgresql://app_runtime:example-not-a-real-password@db.internal:5432/travel_platform',
        RATE_LIMIT_STORE: 'external',
        REDIS_URL: 'redis://redis.internal:6379',
      })
    ).toThrow(/STORAGE_PROVIDER is required/);
  });

  it('refuses an unknown STORAGE_PROVIDER value in production', () => {
    expect(() =>
      validateProductionEnvironment({
        ...validProductionBase,
        STORAGE_PROVIDER: 's3',
      })
    ).toThrow(/STORAGE_PROVIDER must be "local" or "supabase"/);
  });

  it('requires UPLOADS_DIR when STORAGE_PROVIDER is local in production (explicit volume path)', () => {
    expect(() =>
      validateProductionEnvironment({
        ...validProductionBase,
        STORAGE_PROVIDER: 'local',
        UPLOADS_DIR: undefined,
      })
    ).toThrow(/UPLOADS_DIR is required in production when STORAGE_PROVIDER is "local"/);

    expect(() =>
      validateProductionEnvironment({
        ...validProductionBase,
        STORAGE_PROVIDER: 'local',
        UPLOADS_DIR: '/var/data/uploads',
      })
    ).not.toThrow();
  });

  it('requires Supabase credentials when STORAGE_PROVIDER is supabase in production', () => {
    expect(() =>
      validateProductionEnvironment({
        ...validProductionBase,
        SUPABASE_URL: undefined,
      })
    ).toThrow(/SUPABASE_URL is required/);

    expect(() =>
      validateProductionEnvironment({
        ...validProductionBase,
        SUPABASE_SERVICE_ROLE_KEY: undefined,
      })
    ).toThrow(/SUPABASE_SERVICE_ROLE_KEY is required/);
  });

  it('does not require STORAGE_PROVIDER outside production', () => {
    expect(() => validateProductionEnvironment({ NODE_ENV: 'development' })).not.toThrow();
    expect(() =>
      validateProductionEnvironment({ NODE_ENV: 'test', DATABASE_URL: 'postgresql://x' })
    ).not.toThrow();
  });
});

describe('assertSafeDatabaseRole', () => {
  function fakePool(rows: Array<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean }>) {
    return {
      query: () => Promise.resolve({ rows }),
    };
  }

  it('is a no-op outside production (never requires DB access for dev/test startup)', async () => {
    const pool = fakePool([]);
    await expect(
      assertSafeDatabaseRole(pool, { NODE_ENV: 'development' })
    ).resolves.toBeUndefined();
    await expect(assertSafeDatabaseRole(pool, { NODE_ENV: 'test' })).resolves.toBeUndefined();
  });

  it('passes in production for a non-superuser, non-BYPASSRLS role', async () => {
    const pool = fakePool([{ rolname: 'travel_app_runtime', rolsuper: false, rolbypassrls: false }]);
    await expect(assertSafeDatabaseRole(pool, { NODE_ENV: 'production' })).resolves.toBeUndefined();
  });

  it('refuses to start in production for a superuser role', async () => {
    const pool = fakePool([{ rolname: 'postgres', rolsuper: true, rolbypassrls: false }]);
    await expect(assertSafeDatabaseRole(pool, { NODE_ENV: 'production' })).rejects.toThrow(
      /SUPERUSER/
    );
  });

  it('refuses to start in production for a BYPASSRLS role', async () => {
    const pool = fakePool([{ rolname: 'unsafe_runtime', rolsuper: false, rolbypassrls: true }]);
    await expect(assertSafeDatabaseRole(pool, { NODE_ENV: 'production' })).rejects.toThrow(
      /BYPASSRLS/
    );
  });

  it('refuses to start in production when role metadata cannot be read at all', async () => {
    const pool = fakePool([]);
    await expect(assertSafeDatabaseRole(pool, { NODE_ENV: 'production' })).rejects.toThrow(
      /could not read the connected database role/
    );
  });
});

describe('assertSafeDatabasePools', () => {
  function fakePool(rolname: string, rolsuper = false, rolbypassrls = false) {
    return {
      query: () => Promise.resolve({ rows: [{ rolname, rolsuper, rolbypassrls }] }),
    };
  }

  it('is a no-op outside production', async () => {
    const inaccessiblePool = {
      query: () => Promise.reject(new Error('database must not be queried outside production')),
    };
    await expect(
      assertSafeDatabasePools(inaccessiblePool, inaccessiblePool, { NODE_ENV: 'development' }),
    ).resolves.toBeUndefined();
  });

  it('accepts distinct safe tenant and platform roles in production', async () => {
    await expect(
      assertSafeDatabasePools(
        fakePool('travel_app_runtime'),
        fakePool('travel_app_platform'),
        { NODE_ENV: 'production' },
      ),
    ).resolves.toBeUndefined();
  });

  it('refuses a SUPERUSER platform role in production', async () => {
    await expect(
      assertSafeDatabasePools(
        fakePool('travel_app_runtime'),
        fakePool('postgres', true),
        { NODE_ENV: 'production' },
      ),
    ).rejects.toThrow(/platform.*SUPERUSER/i);
  });

  it('refuses a BYPASSRLS platform role in production', async () => {
    await expect(
      assertSafeDatabasePools(
        fakePool('travel_app_runtime'),
        fakePool('unsafe_platform', false, true),
        { NODE_ENV: 'production' },
      ),
    ).rejects.toThrow(/platform.*BYPASSRLS/i);
  });

  it('refuses production boot when tenant and platform pools use the same database role', async () => {
    await expect(
      assertSafeDatabasePools(
        fakePool('travel_app_runtime'),
        fakePool('travel_app_runtime'),
        { NODE_ENV: 'production' },
      ),
    ).rejects.toThrow(/tenant and platform database pools use the same role/i);
  });
});
