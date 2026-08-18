import Fastify from 'fastify';
import { describe, it, expect } from 'vitest';
import { UserRole } from '../../packages/domain/types';
import {
  createTenantContextHook,
  getAgencyId,
  getOptionalTenantContext,
} from '../../packages/domain/tenant-context';

// SEC-02 regression: createTenantContextHook must keep the tenant context
// available through the *entire* remaining request lifecycle of a real
// Fastify instance -- not just for whatever happens to be synchronously
// chained off the hook's own done() call. A test built on a hand-rolled
// fake request/reply (as tenant-isolation.test.ts uses) cannot catch this:
// it never exercises Fastify's actual hook scheduler, its promise-based
// hook sequencing, or genuinely concurrent requests sharing the process.

const agencyAId = 'agency-a-0000-0000-000000000001';
const agencyBId = 'agency-b-0000-0000-000000000002';
const userAId = 'user-a-0000-0000-000000000001';
const userBId = 'user-b-0000-0000-000000000002';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

declare module 'fastify' {
  interface FastifyRequest {
    auth?: {
      sub: string;
      agency_id: string;
      role: UserRole;
      email: string;
    };
  }
}

function buildApp(validateUserAgencyAccess: (userId: string, agencyId: string) => Promise<boolean>) {
  const app = Fastify();

  app.decorateRequest('auth', undefined);

  // Simulates a real authentication hook that decodes a trusted token
  // (e.g. a verified JWT) and runs *before* the tenant hook, with a
  // genuine async gap in between -- exactly the shape that would defeat a
  // context propagation mechanism relying on synchronous call-stack
  // causality alone.
  app.addHook('onRequest', async (request) => {
    const header = request.headers['x-test-agency'];
    await sleep(1);

    if (typeof header === 'string' && header.length > 0) {
      const [agencyId, userId] = header.split(':');
      request.auth = {
        sub: userId ?? '',
        agency_id: agencyId ?? '',
        role: UserRole.ADMIN,
        email: 'user@example.com',
      };
    }
  });

  app.addHook('onRequest', createTenantContextHook({ validateUserAgencyAccess }));

  app.get('/whoami', async () => {
    // Another async gap *inside* the handler, after the hook has already
    // called done(). If context were lost between hooks and the handler,
    // or lost across this await, this call throws NO_TENANT_CONTEXT.
    await sleep(1);
    const agencyId = getAgencyId();
    await sleep(1);
    return { agencyId };
  });

  app.get('/whoami-awaited', async () => {
    // A genuinely awaited async operation (not fire-and-forget) started
    // from inside the handler. The context must still be correct once it
    // resolves, proving the store follows properly awaited work.
    const agencyId = await Promise.resolve().then(() => sleep(2)).then(() => getAgencyId());
    return { agencyId };
  });

  app.get('/boom', () => {
    // Confirms the tenant context is visible right up to the moment a
    // handler throws, and that the throw does not corrupt context
    // observed by any later, unrelated request.
    getAgencyId();
    throw new Error('handler exploded');
  });

  return app;
}

describe('Fastify tenant context lifecycle (real server, real inject)', () => {
  it('keeps the tenant context available inside the route handler across async gaps', async () => {
    const app = buildApp(() => Promise.resolve(true));

    const response = await app.inject({
      method: 'GET',
      url: '/whoami',
      headers: { 'x-test-agency': `${agencyAId}:${userAId}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ agencyId: agencyAId });

    await app.close();
  });

  it('isolates concurrent requests for different agencies on the same server', async () => {
    const app = buildApp(() => Promise.resolve(true));

    const requests = Array.from({ length: 8 }, (_, index) => {
      const isA = index % 2 === 0;
      return app
        .inject({
          method: 'GET',
          url: '/whoami',
          headers: {
            'x-test-agency': isA ? `${agencyAId}:${userAId}` : `${agencyBId}:${userBId}`,
          },
        })
        .then((response) => ({ isA, response }));
    });

    const results = await Promise.all(requests);

    for (const { isA, response } of results) {
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ agencyId: isA ? agencyAId : agencyBId });
    }

    await app.close();
  });

  it('fails closed when no auth payload is present, without leaking a prior request context', async () => {
    const app = buildApp(() => Promise.resolve(true));

    const authed = await app.inject({
      method: 'GET',
      url: '/whoami',
      headers: { 'x-test-agency': `${agencyAId}:${userAId}` },
    });
    expect(authed.statusCode).toBe(200);

    const unauthed = await app.inject({ method: 'GET', url: '/whoami' });

    expect(unauthed.statusCode).toBe(401);
    expect(unauthed.json()).toEqual({
      error: 'Authentication required',
      code: 'UNAUTHORIZED',
    });

    await app.close();
  });

  it('rejects the request when the user does not belong to the agency, fail-closed', async () => {
    const app = buildApp(() => Promise.resolve(false));

    const response = await app.inject({
      method: 'GET',
      url: '/whoami',
      headers: { 'x-test-agency': `${agencyAId}:${userAId}` },
    });

    expect(response.statusCode).toBe(403);
    expect(getOptionalTenantContext()).toBeUndefined();

    await app.close();
  });

  it('keeps A and B correctly isolated across sequential requests, A -> B -> A', async () => {
    const app = buildApp(() => Promise.resolve(true));

    const first = await app.inject({
      method: 'GET',
      url: '/whoami',
      headers: { 'x-test-agency': `${agencyAId}:${userAId}` },
    });
    const second = await app.inject({
      method: 'GET',
      url: '/whoami',
      headers: { 'x-test-agency': `${agencyBId}:${userBId}` },
    });
    const third = await app.inject({
      method: 'GET',
      url: '/whoami',
      headers: { 'x-test-agency': `${agencyAId}:${userAId}` },
    });

    expect(first.json()).toEqual({ agencyId: agencyAId });
    expect(second.json()).toEqual({ agencyId: agencyBId });
    expect(third.json()).toEqual({ agencyId: agencyAId });

    await app.close();
  });

  it('resolves a genuinely awaited async operation inside the handler with the correct context', async () => {
    const app = buildApp(() => Promise.resolve(true));

    const [a, b] = await Promise.all([
      app.inject({
        method: 'GET',
        url: '/whoami-awaited',
        headers: { 'x-test-agency': `${agencyAId}:${userAId}` },
      }),
      app.inject({
        method: 'GET',
        url: '/whoami-awaited',
        headers: { 'x-test-agency': `${agencyBId}:${userBId}` },
      }),
    ]);

    expect(a.json()).toEqual({ agencyId: agencyAId });
    expect(b.json()).toEqual({ agencyId: agencyBId });

    await app.close();
  });

  it('keeps context correct up to a thrown exception, and does not leak it into the next request', async () => {
    const app = buildApp(() => Promise.resolve(true));

    const failed = await app.inject({
      method: 'GET',
      url: '/boom',
      headers: { 'x-test-agency': `${agencyAId}:${userAId}` },
    });
    expect(failed.statusCode).toBe(500);

    // A fresh request for a *different* agency, right after the failure,
    // must not observe Agency A's context and must resolve with its own.
    const next = await app.inject({
      method: 'GET',
      url: '/whoami',
      headers: { 'x-test-agency': `${agencyBId}:${userBId}` },
    });
    expect(next.json()).toEqual({ agencyId: agencyBId });

    await app.close();
  });
});
