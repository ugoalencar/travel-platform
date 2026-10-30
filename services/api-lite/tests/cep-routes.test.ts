import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CepLookup } from '../src/cep';
import { registerCepRoutes } from '../src/routes/cep';
import { runWithTenantContext } from '../src/tenant-context';
import { HttpError } from '../src/errors';
import { buildApp } from '../src/app';
import type { LiteDatabase } from '../src/database';

const apps: FastifyInstance[] = [];
afterEach(async () => { await Promise.all(apps.map((app) => app.close())); apps.length = 0; });

async function create() {
  const app = Fastify(); apps.push(app);
  app.setErrorHandler((error: Error, _request, reply) => {
    reply.code(error instanceof HttpError ? error.statusCode : 500).send({ error: error.message });
  });
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
    cep: '01001-000', logradouro: 'Rua Exemplo', bairro: 'Centro', localidade: 'Sao Paulo', uf: 'SP',
  }), { headers: { 'content-type': 'application/json' } }));
  const lookup = new CepLookup({ fetcher });
  registerCepRoutes(app, lookup, [(request, _reply, done) => {
    runWithTenantContext({ tenantId: 'tenant', userId: 'user', sessionId: 'session', email: 'synthetic@example.test',
      role: 'SELLER', roleRank: 20, grantsAll: false, sellerId: 'seller',
      permissions: new Set(request.headers.authorization ? ['customers.create'] : []),
    }, done);
  }]);
  await app.ready();
  return { app, fetcher };
}

describe('CEP route', () => {
  it('requires authentication in both app prefixes', async () => {
    const app = await buildApp({ database: {} as LiteDatabase }); apps.push(app);
    for (const prefix of ['', '/api']) expect((await app.inject(`${prefix}/cep/lookup?cep=01001000`)).statusCode).toBe(401);
  });
  it('checks customer permission before calling the provider', async () => {
    const { app, fetcher } = await create();
    expect((await app.inject('/cep/lookup?cep=01001000')).statusCode).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
    const result = await app.inject({ url: '/cep/lookup?cep=01001000', headers: { authorization: 'synthetic' } });
    expect(result.statusCode).toBe(200);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.json()).toMatchObject({ street: 'Rua Exemplo' });
  });
  it('rejects malformed input and adds retry-after on throttling', async () => {
    const { app, fetcher } = await create();
    const headers = { authorization: 'synthetic' };
    expect((await app.inject({ url: '/cep/lookup?cep=https://example.test', headers })).statusCode).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
    for (let i = 0; i < 10; i++) await app.inject({ url: '/cep/lookup?cep=01001000', headers });
    const limited = await app.inject({ url: '/cep/lookup?cep=01001000', headers });
    expect(limited.statusCode).toBe(429);
    expect(limited.headers['retry-after']).toBe('60');
  });
});
