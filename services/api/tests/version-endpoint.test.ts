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
