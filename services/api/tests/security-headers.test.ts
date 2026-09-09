import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import type { DatabaseRuntime } from '../src/database';
import { resolveCorsPolicy, SecurityConfigError } from '../src/security-config';

// These tests cover SEC-E (CORS + security headers) only. They deliberately
// never hit the database -- CORS/header/body-limit middleware runs before
// any DB-backed route handler, so /health (which has no readinessCheck
// configured) is enough to exercise the full HTTP pipeline.
const stubDatabase: DatabaseRuntime = {
  withTenantTransaction: () => Promise.reject(new Error('not used in these tests')),
  withPlatformTransaction: () => Promise.reject(new Error('not used in these tests')),
};

function buildTestApp(overrides: Partial<Parameters<typeof buildApp>[0]> = {}) {
  return buildApp({
    authProvider: { authenticate: () => Promise.resolve(null) },
    validateUserAgencyAccess: () => Promise.resolve(false),
    database: stubDatabase,
    ...overrides,
  });
}

describe('SEC-E CORS policy', () => {
  it('allows an explicitly configured production origin', async () => {
    const app = buildTestApp({
      corsPolicy: {
        isProduction: true,
        allowedOrigins: ['https://app.travel-platform.example'],
        allowLocalhostAnyPort: false,
      },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://app.travel-platform.example' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe(
      'https://app.travel-platform.example',
    );
  });

  it('rejects an unknown origin instead of reflecting it back', async () => {
    const app = buildTestApp({
      corsPolicy: {
        isProduction: true,
        allowedOrigins: ['https://app.travel-platform.example'],
        allowLocalhostAnyPort: false,
      },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://evil.example' },
    });

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('never reflects wildcard "*" in production, even implicitly', async () => {
    const app = buildTestApp({
      corsPolicy: {
        isProduction: true,
        allowedOrigins: ['https://app.travel-platform.example'],
        allowLocalhostAnyPort: false,
      },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://app.travel-platform.example' },
    });

    expect(response.headers['access-control-allow-origin']).not.toBe('*');
  });

  it('does not send Access-Control-Allow-Credentials (bearer/header-token model, not cookie-based)', async () => {
    const app = buildTestApp({
      corsPolicy: {
        isProduction: true,
        allowedOrigins: ['https://app.travel-platform.example'],
        allowLocalhostAnyPort: false,
      },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://app.travel-platform.example' },
    });

    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('answers a preflight OPTIONS request predictably for an allowed origin', async () => {
    const app = buildTestApp({
      corsPolicy: {
        isProduction: true,
        allowedOrigins: ['https://app.travel-platform.example'],
        allowLocalhostAnyPort: false,
      },
    });

    const response = await app.inject({
      method: 'OPTIONS',
      url: '/customer-api/trips',
      headers: {
        origin: 'https://app.travel-platform.example',
        'access-control-request-method': 'GET',
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(
      'https://app.travel-platform.example',
    );
    expect(response.headers['access-control-allow-methods']).toBeDefined();
  });

  it('rejects a preflight OPTIONS request from an unknown origin', async () => {
    const app = buildTestApp({
      corsPolicy: {
        isProduction: true,
        allowedOrigins: ['https://app.travel-platform.example'],
        allowLocalhostAnyPort: false,
      },
    });

    const response = await app.inject({
      method: 'OPTIONS',
      url: '/customer-api/trips',
      headers: {
        origin: 'https://evil.example',
        'access-control-request-method': 'GET',
      },
    });

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('allows localhost:<any-port> only in the non-production default policy', async () => {
    const app = buildTestApp({
      corsPolicy: {
        isProduction: false,
        allowedOrigins: [],
        allowLocalhostAnyPort: true,
      },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'http://localhost:5173' },
    });

    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('a malformed/blocked Origin gets a clean CORS rejection, not a 500 with internals', async () => {
    const app = buildTestApp({
      corsPolicy: {
        isProduction: true,
        allowedOrigins: ['https://app.travel-platform.example'],
        allowLocalhostAnyPort: false,
      },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://evil.example' },
    });

    expect(response.statusCode).not.toBe(500);
    const body: unknown = response.json();
    expect(JSON.stringify(body)).not.toMatch(/stack|internal error stack/i);
  });
});

describe('SEC-E environment-sourced CORS origin resolution', () => {
  it('fails loudly (throws) in production when CORS_ALLOWED_ORIGINS is unset', () => {
    expect(() => resolveCorsPolicy({ NODE_ENV: 'production' })).toThrow(SecurityConfigError);
  });

  it('fails loudly in production if CORS_ALLOWED_ORIGINS is "*"', () => {
    expect(() =>
      resolveCorsPolicy({ NODE_ENV: 'production', CORS_ALLOWED_ORIGINS: '*' }),
    ).toThrow(SecurityConfigError);
  });

  it('fails loudly in production for a non-HTTPS non-localhost origin', () => {
    expect(() =>
      resolveCorsPolicy({
        NODE_ENV: 'production',
        CORS_ALLOWED_ORIGINS: 'http://app.travel-platform.example',
      }),
    ).toThrow(SecurityConfigError);
  });

  it('parses a valid comma-separated production allow-list', () => {
    const policy = resolveCorsPolicy({
      NODE_ENV: 'production',
      CORS_ALLOWED_ORIGINS: 'https://app.travel-platform.example, https://admin.travel-platform.example',
    });

    expect(policy.isProduction).toBe(true);
    expect(policy.allowedOrigins).toEqual([
      'https://app.travel-platform.example',
      'https://admin.travel-platform.example',
    ]);
    expect(policy.allowLocalhostAnyPort).toBe(false);
  });

  it('falls back to a permissive localhost-only dev policy when unset outside production', () => {
    const policy = resolveCorsPolicy({ NODE_ENV: 'development' });
    expect(policy.isProduction).toBe(false);
    expect(policy.allowLocalhostAnyPort).toBe(true);
    expect(policy.allowedOrigins).toEqual([]);
  });
});

describe('SEC-E security headers', () => {
  it('sets baseline security headers on every response', async () => {
    const app = buildTestApp();

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['permissions-policy']).toContain('geolocation=()');
    expect(response.headers['content-security-policy']).toBeDefined();
  });

  it('CSP is present and is not a wildcard policy', async () => {
    const app = buildTestApp();

    const response = await app.inject({ method: 'GET', url: '/health' });

    const csp = response.headers['content-security-policy'];
    expect(csp).toBeDefined();
    expect(String(csp)).not.toMatch(/\*/);
    expect(String(csp)).toContain("default-src 'self'");
    expect(String(csp)).toContain("frame-ancestors 'none'");
  });

  it('omits the deprecated X-XSS-Protection header', async () => {
    const app = buildTestApp();

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.headers['x-xss-protection']).toBeUndefined();
  });

  it('does not leak the X-Powered-By header', async () => {
    const app = buildTestApp();

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('enables HSTS only when the resolved CORS policy is production', async () => {
    const prodApp = buildTestApp({
      corsPolicy: {
        isProduction: true,
        allowedOrigins: ['https://app.travel-platform.example'],
        allowLocalhostAnyPort: false,
      },
    });
    const devApp = buildTestApp({
      corsPolicy: { isProduction: false, allowedOrigins: [], allowLocalhostAnyPort: true },
    });

    const prodResponse = await prodApp.inject({ method: 'GET', url: '/health' });
    const devResponse = await devApp.inject({ method: 'GET', url: '/health' });

    expect(prodResponse.headers['strict-transport-security']).toBeDefined();
    expect(devResponse.headers['strict-transport-security']).toBeUndefined();
  });
});

describe('SEC-E request body size limit', () => {
  it('rejects a request body larger than the configured limit with a clean 413, not a 500', async () => {
    const app = buildTestApp({
      bodyLimitBytes: 1024,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/customers',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ filler: 'x'.repeat(2048) }),
    });

    expect(response.statusCode).toBe(413);
  });

  it('accepts a body under the configured limit through to normal auth handling (401, not 413)', async () => {
    const app = buildTestApp({
      bodyLimitBytes: 1024,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/customers',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ name: 'small' }),
    });

    expect(response.statusCode).not.toBe(413);
  });
});
