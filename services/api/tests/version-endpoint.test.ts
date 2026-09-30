import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import type { DatabaseRuntime } from '../src/database';
import { resolveVersionInfo, type VersionInfo } from '../src/version';

describe('resolveVersionInfo buildSha', () => {
  it('prefers RENDER_GIT_COMMIT (injected by Render) over GIT_SHA/BUILD_SHA', () => {
    const info = resolveVersionInfo({
      environment: { RENDER_GIT_COMMIT: 'render-sha', GIT_SHA: 'git-sha', BUILD_SHA: 'build-sha' },
    });
    expect(info.buildSha).toBe('render-sha');
  });

  it('falls back to GIT_SHA, then BUILD_SHA, skipping blank values', () => {
    expect(resolveVersionInfo({ environment: { RENDER_GIT_COMMIT: '  ', GIT_SHA: 'git-sha' } }).buildSha).toBe(
      'git-sha',
    );
    expect(resolveVersionInfo({ environment: { BUILD_SHA: 'build-sha' } }).buildSha).toBe('build-sha');
  });

  it('reports unknown when no SHA variable is set', () => {
    expect(resolveVersionInfo({ environment: {} }).buildSha).toBe('unknown');
  });
});

function buildMinimalApp(versionInfo?: VersionInfo) {
  const database: DatabaseRuntime = {
    withTenantTransaction: () => {
      throw new Error('must not be used by /version');
    },
    // No schema_migrations reachable: /version must degrade to 'unknown'.
    withPlatformTransaction: () => {
      throw new Error('database unavailable');
    },
  };

  return buildApp({
    authProvider: { authenticate: () => Promise.resolve(null) },
    validateUserAgencyAccess: () => Promise.resolve(false),
    database,
    rateLimit: {
      classLimits: {
        SYSTEM_INTERNAL: { windowMs: 60_000, max: 10 },
      },
    },
    ...(versionInfo ? { versionInfo } : {}),
  });
}

describe('GET /version', () => {
  it('is reachable without any authentication', async () => {
    const app = buildMinimalApp();

    const response = await app.inject({ method: 'GET', url: '/version' });

    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it('returns appVersion, buildSha, migrationVersion, deploymentId, releasedAt', async () => {
    const app = buildMinimalApp({
      appVersion: '1.2.3',
      buildSha: 'abc123',
      migrationVersion: '047_operacao_occurrences_posttrip',
      deploymentId: 'deploy-42',
      releasedAt: '2026-09-11T00:00:00.000Z',
    });

    const response = await app.inject({ method: 'GET', url: '/version' });
    const body: VersionInfo = response.json();

    expect(body).toEqual({
      appVersion: '1.2.3',
      buildSha: 'abc123',
      migrationVersion: '047_operacao_occurrences_posttrip',
      deploymentId: 'deploy-42',
      releasedAt: '2026-09-11T00:00:00.000Z',
    });

    await app.close();
  });

  it('never leaks a filesystem path or stack trace when using the real (non-overridden) resolver', async () => {
    const app = buildMinimalApp();

    const response = await app.inject({ method: 'GET', url: '/version' });
    const body: VersionInfo = response.json();

    expect(typeof body.appVersion).toBe('string');
    expect(typeof body.buildSha).toBe('string');
    expect(typeof body.migrationVersion).toBe('string');
    expect(typeof body.deploymentId).toBe('string');
    expect(typeof body.releasedAt).toBe('string');

    const serialized = JSON.stringify(body);
    expect(serialized).not.toMatch(/[A-Za-z]:\\/); // no Windows absolute path
    expect(serialized).not.toContain('/services/api/');
    expect(serialized).not.toContain('at ');

    await app.close();
  });
});

describe('GET /version migrationVersion (schema_migrations)', () => {
  function appWithAppliedVersion(version: string | null) {
    const queries: string[] = [];
    const database: DatabaseRuntime = {
      withTenantTransaction: () => Promise.reject(new Error('must not be used by /version')),
      withPlatformTransaction: (operation) =>
        operation({
          query: (text: string) => {
            queries.push(text);
            return Promise.resolve({ rows: [{ version }], rowCount: 1, command: 'SELECT', oid: 0, fields: [] });
          },
        } as never),
    };
    const app = buildApp({
      authProvider: { authenticate: () => Promise.resolve(null) },
      validateUserAgencyAccess: () => Promise.resolve(false),
      database,
    });
    return { app, queries };
  }

  it('reports the highest migration applied to the database', async () => {
    const { app, queries } = appWithAppliedVersion('096');

    const body: VersionInfo = (await app.inject({ method: 'GET', url: '/version' })).json();

    expect(body.migrationVersion).toBe('096');
    expect(queries).toEqual(['SELECT max(version) AS version FROM schema_migrations']);
    await app.close();
  });

  it('reports unknown when the registry is empty', async () => {
    const { app } = appWithAppliedVersion(null);

    const body: VersionInfo = (await app.inject({ method: 'GET', url: '/version' })).json();

    expect(body.migrationVersion).toBe('unknown');
    await app.close();
  });

  it('reports unknown (and still 200) when the database is unavailable', async () => {
    const app = buildMinimalApp();

    const response = await app.inject({ method: 'GET', url: '/version' });

    expect(response.statusCode).toBe(200);
    expect(response.json<VersionInfo>().migrationVersion).toBe('unknown');
    await app.close();
  });
});
