import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import type { DatabaseRuntime } from '../src/database';

// Fastify's own request-parsing errors (empty/invalid JSON body, unsupported
// content type) are client errors. They must never surface as a 500. These
// run before any auth or DB-backed handler, so no database is needed.
const stubDatabase: DatabaseRuntime = {
  withTenantTransaction: () => Promise.reject(new Error('not used in these tests')),
  withPlatformTransaction: () => Promise.reject(new Error('not used in these tests')),
};

function buildTestApp() {
  return buildApp({
    authProvider: { authenticate: () => Promise.resolve(null) },
    validateUserAgencyAccess: () => Promise.resolve(false),
    database: stubDatabase,
  });
}

describe('request body parsing errors', () => {
  it('answers 400 (not 500) to an empty body declared as application/json', async () => {
    const app = buildTestApp();

    const response = await app.inject({
      method: 'POST',
      url: '/settings/onboarding/complete',
      headers: { 'content-type': 'application/json' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'Invalid request body', code: 'INVALID_REQUEST_BODY' });
  });

  it('answers 400 (not 500) to malformed JSON', async () => {
    const app = buildTestApp();

    const response = await app.inject({
      method: 'POST',
      url: '/customers',
      headers: { 'content-type': 'application/json' },
      payload: '{"name": ',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'Invalid request body', code: 'INVALID_REQUEST_BODY' });
  });

  it('answers 415 (not 500) to an unsupported content type', async () => {
    const app = buildTestApp();

    const response = await app.inject({
      method: 'POST',
      url: '/customers',
      headers: { 'content-type': 'application/xml' },
      payload: '<customer/>',
    });

    expect(response.statusCode).toBe(415);
    expect(response.json()).toEqual({ error: 'Unsupported content type', code: 'UNSUPPORTED_MEDIA_TYPE' });
  });

  it('still reaches normal auth handling when the body is absent without a content type', async () => {
    const app = buildTestApp();

    const response = await app.inject({ method: 'POST', url: '/settings/onboarding/complete' });

    expect(response.statusCode).toBe(401);
  });

  it('never leaks the internal Fastify error message', async () => {
    const app = buildTestApp();

    const response = await app.inject({
      method: 'POST',
      url: '/customers',
      headers: { 'content-type': 'application/json' },
      payload: '{',
    });

    expect(response.body).not.toMatch(/FST_|Unexpected|position/i);
  });
});
