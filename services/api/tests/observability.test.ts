import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import type { DatabaseRuntime } from '../src/database';

function buildTestApp() {
  return buildApp({
    authProvider: { authenticate: () => Promise.resolve(null) },
    validateUserAgencyAccess: () => Promise.resolve(false),
    database: {
      withTenantTransaction: () => Promise.reject(new Error('not used')),
      withPlatformTransaction: () => Promise.reject(new Error('not used')),
    } satisfies DatabaseRuntime,
    rateLimit: {
      classLimits: {
        SYSTEM_INTERNAL: { windowMs: 60_000, max: 1000 },
      },
    },
    deploymentId: 'test-deploy-123',
  });
}

describe('observability: correlation ID propagation', () => {
  it('mints a request/correlation id and echoes it on the response when none supplied', async () => {
    const app = buildTestApp();

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-request-id']).toBeTruthy();
    expect(response.headers['x-correlation-id']).toBeTruthy();

    await app.close();
  });

  it('propagates an inbound x-request-id / x-correlation-id instead of overwriting them', async () => {
    const app = buildTestApp();

    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: {
        'x-request-id': 'client-req-1',
        'x-correlation-id': 'client-corr-1',
      },
    });

    expect(response.headers['x-request-id']).toBe('client-req-1');
    expect(response.headers['x-correlation-id']).toBe('client-corr-1');

    await app.close();
  });
});

describe('observability: error correlation', () => {
  it('carries the same errorCode the client received into the structured log', async () => {
    const app = buildTestApp();
    const logLines: unknown[] = [];
    app.addHook('onResponse', (request, _reply, done) => {
      logLines.push(request.observedErrorCode);
      done();
    });

    const response = await app.inject({ method: 'GET', url: '/platform/plans' });

    expect(response.statusCode).toBe(401);
    expect(logLines).toContain('UNAUTHORIZED');

    await app.close();
  });
});

describe('observability: /metrics', () => {
  it('reports request counts, status-class buckets, and latency percentiles', async () => {
    const app = buildTestApp();

    // Generate some traffic: 3 successes, 1 not-found (4xx).
    await app.inject({ method: 'GET', url: '/health' });
    await app.inject({ method: 'GET', url: '/health' });
    await app.inject({ method: 'GET', url: '/health' });
    await app.inject({ method: 'GET', url: '/this-route-does-not-exist' });

    const response = await app.inject({ method: 'GET', url: '/metrics' });
    expect(response.statusCode).toBe(200);

    const body = response.json<{
      requestsTotal: number;
      statusClassCounts: Record<string, number>;
      latencyMs: { p50: number; p95: number; p99: number };
      dbPool: unknown;
    }>();
    expect(body.requestsTotal).toBeGreaterThanOrEqual(4);
    expect(body.statusClassCounts['2xx']).toBeGreaterThanOrEqual(3);
    expect(body.statusClassCounts['4xx']).toBeGreaterThanOrEqual(1);
    expect(typeof body.latencyMs.p50).toBe('number');
    expect(typeof body.latencyMs.p95).toBe('number');
    expect(typeof body.latencyMs.p99).toBe('number');
    // dbPoolStats not wired in this test app -- must report null, not throw.
    expect(body.dbPool).toBeNull();

    await app.close();
  });
});
