import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import type { DatabaseRuntime } from '../src/database';
import type { VersionInfo } from '../src/version';

function buildMinimalApp(versionInfo?: VersionInfo) {
  const database: DatabaseRuntime = {
    withTenantTransaction: () => {
      throw new Error('must not be used by /version');
    },
    withPlatformTransaction: () => {
      throw new Error('must not be used by /version');
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
