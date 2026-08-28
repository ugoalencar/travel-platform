import { describe, expect, it } from 'vitest';
import { assertSafeDatabaseRole, validateProductionEnvironment } from '../src/env';

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

  it('accepts a well-formed production environment', () => {
    expect(() =>
      validateProductionEnvironment({
        NODE_ENV: 'production',
        DATABASE_URL:
          'postgresql://app_runtime:example-not-a-real-password@db.internal:5432/travel_platform',
        PORT: '3000',
        RATE_LIMIT_STORE: 'external',
      })
    ).not.toThrow();
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
      })
    ).toThrow(/ALLOW_DEV_AUTH must not be "true" in production/);
  });

  it('allows ALLOW_DEV_AUTH=false in production (only the literal "true" flag is prohibited)', () => {
    expect(() =>
      validateProductionEnvironment({
        NODE_ENV: 'production',
        DATABASE_URL:
          'postgresql://app_runtime:example-not-a-real-password@db.internal:5432/travel_platform',
        ALLOW_DEV_AUTH: 'false',
        RATE_LIMIT_STORE: 'external',
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
    }
  });
});

describe('assertSafeDatabaseRole', () => {
  function fakePool(rows: Array<{ rolsuper: boolean; rolbypassrls: boolean }>) {
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
    const pool = fakePool([{ rolsuper: false, rolbypassrls: false }]);
    await expect(assertSafeDatabaseRole(pool, { NODE_ENV: 'production' })).resolves.toBeUndefined();
  });

  it('refuses to start in production for a superuser role', async () => {
    const pool = fakePool([{ rolsuper: true, rolbypassrls: false }]);
    await expect(assertSafeDatabaseRole(pool, { NODE_ENV: 'production' })).rejects.toThrow(
      /SUPERUSER/
    );
  });

  it('refuses to start in production for a BYPASSRLS role', async () => {
    const pool = fakePool([{ rolsuper: false, rolbypassrls: true }]);
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
