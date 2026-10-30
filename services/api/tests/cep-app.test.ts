import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app';
import { CepLookup } from '../src/cep';
import type { AuthenticatedPrincipal } from '../src/auth';
import type { DatabaseRuntime } from '../src/database';
import { UserRole } from '../../../packages/domain/types';

// Exercises the real registration in buildApp (global hooks, authenticate,
// tenant context, error handler) instead of a hand-built fixture.
const stubDatabase: DatabaseRuntime = {
  withTenantTransaction: () => Promise.reject(new Error('not used')),
  withPlatformTransaction: () => Promise.reject(new Error('not used')),
};
const agencyA = '10000000-0000-4000-8000-000000000001';
const agencyB = '20000000-0000-4000-8000-000000000001';
const principal = (agencyId: string, role: UserRole): AuthenticatedPrincipal => ({
  userId: 'user-1',
  agencyId,
  role,
  email: 'user@example.test',
});
const principals: Record<string, AuthenticatedPrincipal> = {
  agentA: principal(agencyA, UserRole.AGENT),
  viewerA: principal(agencyA, UserRole.VIEWER),
  agentB: principal(agencyB, UserRole.AGENT),
};
const payload = {
  cep: '01001-000',
  logradouro: 'Praça da Sé',
  bairro: 'Sé',
  localidade: 'São Paulo',
  uf: 'SP',
};
const providerResponse = (data: unknown) =>
  new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });

const apps: Array<ReturnType<typeof buildApp>> = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function makeApp(fetcher: typeof fetch, enabled = true) {
  const app = buildApp({
    authProvider: {
      authenticate(request) {
        const key = request.headers['x-test-principal'];
        return Promise.resolve(typeof key === 'string' ? (principals[key] ?? null) : null);
      },
    },
    validateUserAgencyAccess: () => Promise.resolve(true),
    database: stubDatabase,
    cepLookup: new CepLookup({ fetcher, enabled }),
  });
  apps.push(app);
  return app;
}

describe('GET /cep/lookup through the real buildApp', () => {
  it('requires authentication and never calls the provider without it', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const response = await makeApp(fetcher).inject('/cep/lookup?cep=01001000');
    expect(response.statusCode).toBe(401);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('denies VIEWER server-side before the provider', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const response = await makeApp(fetcher).inject({
      url: '/cep/lookup?cep=01001000',
      headers: { 'x-test-principal': 'viewerA' },
    });
    expect(response.statusCode).toBe(403);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('returns the address to an AGENT with no-store and a sanitized shape', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(providerResponse(payload));
    const response = await makeApp(fetcher).inject({
      url: '/cep/lookup?cep=01001-000',
      headers: { 'x-test-principal': 'agentA' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json()).toEqual({
      status: 'ok',
      street: 'Praça da Sé',
      neighborhood: 'Sé',
      city: 'São Paulo',
      state: 'SP',
      source: 'viacep',
    });
    expect(fetcher).toHaveBeenCalledOnce();
    expect((fetcher.mock.calls[0]![0] as string)).toBe('https://viacep.com.br/ws/01001000/json/');
  });

  it('answers 400 for a malformed CEP without calling the provider', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const response = await makeApp(fetcher).inject({
      url: '/cep/lookup?cep=abc',
      headers: { 'x-test-principal': 'agentA' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('is disabled by default in buildApp (fail closed) with a 503', async () => {
    const app = buildApp({
      authProvider: { authenticate: () => Promise.resolve(principals.agentA ?? null) },
      validateUserAgencyAccess: () => Promise.resolve(true),
      database: stubDatabase,
    });
    apps.push(app);
    const response = await app.inject('/cep/lookup?cep=01001000');
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ code: 'CEP_DISABLED' });
  });

  it('turns an invalid upstream cep into a sanitized 502 CEP_INVALID_RESPONSE', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(providerResponse({ ...payload, cep: 'secret-upstream-text' }));
    const response = await makeApp(fetcher).inject({
      url: '/cep/lookup?cep=01001000',
      headers: { 'x-test-principal': 'agentA' },
    });
    expect(response.statusCode).toBe(502);
    expect(response.json()).toMatchObject({ code: 'CEP_INVALID_RESPONSE' });
    expect(response.body).not.toContain('secret-upstream-text');
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('rate-limits per agency:user principal, not across agencies', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(() => Promise.resolve(providerResponse(payload)));
    const app = makeApp(fetcher);
    const get = (who: string) =>
      app.inject({ url: '/cep/lookup?cep=01001000', headers: { 'x-test-principal': who } });
    for (let i = 0; i < 10; i++) expect((await get('agentA')).statusCode).toBe(200);
    const limited = await get('agentA');
    expect(limited.statusCode).toBe(429);
    expect(limited.headers['retry-after']).toBe('60');
    expect((await get('agentB')).statusCode).toBe(200);
  });
});
