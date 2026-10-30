import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  runWithTenantContext,
  UnauthorizedError,
} from '../../../packages/domain/tenant-context';
import { UserRole } from '../../../packages/domain/types';
import { CepError, type CepLookup, type CepResult } from '../src/cep';
import { registerErrorHandler, ValidationError } from '../src/errors';
import { registerCepRoutes } from '../src/routes/cep';

const result: CepResult = {
  status: 'ok',
  street: 'Praça da Sé',
  neighborhood: 'Sé',
  city: 'São Paulo',
  state: 'SP',
  source: 'viacep',
};

type Lookup = Pick<CepLookup, 'lookup'>;

const apps: FastifyInstance[] = [];

async function fixture(
  role: UserRole | null,
  lookup: Lookup,
  agencyId = 'agency-a',
) {
  const app = Fastify();
  apps.push(app);
  registerErrorHandler(app);
  app.addHook('onSend', (request, reply, payload, done) => {
    if (request.url.startsWith('/cep/')) reply.header('cache-control', 'no-store');
    done(null, payload);
  });
  app.addHook('onRequest', (_request, _reply, done) => {
    if (role === null) {
      done(new UnauthorizedError());
      return;
    }
    runWithTenantContext(
      { agencyId, userId: 'user-1', userRole: role, email: '' },
      done,
    );
  });
  registerCepRoutes(app, { lookup, protectedHooks: [] });
  await app.ready();
  return app;
}

function fakeLookup(implementation: Lookup['lookup']): Lookup {
  return { lookup: vi.fn(implementation) };
}

beforeEach(() => vi.clearAllMocks());
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('Full CEP lookup route', () => {
  it('returns the provider address and forbids caching', async () => {
    const lookup = fakeLookup(() => Promise.resolve(result));
    const app = await fixture(UserRole.AGENT, lookup);
    const response = await app.inject('/cep/lookup?cep=01001-000');
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json()).toEqual(result);
    expect(lookup.lookup).toHaveBeenCalledWith('01001-000', 'agency-a:user-1');
  });

  it.each([UserRole.AGENT, UserRole.MANAGER, UserRole.OWNER, UserRole.ADMIN])(
    'allows %s to look up a CEP',
    async (role) => {
      const lookup = fakeLookup(() => Promise.resolve(result));
      const app = await fixture(role, lookup);
      expect((await app.inject('/cep/lookup?cep=01001000')).statusCode).toBe(200);
    },
  );

  it.each([UserRole.VIEWER])('denies %s before calling the provider', async (role) => {
    const lookup = fakeLookup(() => Promise.resolve(result));
    const app = await fixture(role, lookup);
    const response = await app.inject('/cep/lookup?cep=01001000');
    expect(response.statusCode).toBe(403);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(lookup.lookup).not.toHaveBeenCalled();
  });

  it('denies unauthenticated requests and forbids caching the auth error', async () => {
    const lookup = fakeLookup(() => Promise.resolve(result));
    const app = await fixture(null, lookup);
    const response = await app.inject('/cep/lookup?cep=01001000');
    expect(response.statusCode).toBe(401);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(lookup.lookup).not.toHaveBeenCalled();
  });

  it('keeps the authenticated agency even if the query names another one', async () => {
    const lookup = fakeLookup(() => Promise.resolve(result));
    const app = await fixture(UserRole.AGENT, lookup, 'agency-b');
    const response = await app.inject('/cep/lookup?cep=01001000&agencyId=agency-a');
    expect(response.statusCode).toBe(200);
    expect(lookup.lookup).toHaveBeenCalledWith('01001000', 'agency-b:user-1');
  });

  it('normalizes a missing or malformed CEP as a validation error', async () => {
    const lookup = fakeLookup(() => {
      throw new ValidationError('Informe um CEP com 8 digitos.');
    });
    const app = await fixture(UserRole.AGENT, lookup);
    for (const path of ['/cep/lookup', '/cep/lookup?cep=abc']) {
      const response = await app.inject(path);
      expect(response.statusCode).toBe(400);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
    }
  });

  it.each([
    [new CepError(404, 'CEP_NOT_FOUND', 'CEP nao encontrado.'), 404, 'CEP_NOT_FOUND'],
    [new CepError(429, 'CEP_RATE_LIMIT', 'Limite atingido.'), 429, 'CEP_RATE_LIMIT'],
    [new CepError(502, 'CEP_INVALID_RESPONSE', 'Resposta invalida.'), 502, 'CEP_INVALID_RESPONSE'],
    [new CepError(503, 'CEP_DISABLED', 'Consulta desabilitada.'), 503, 'CEP_DISABLED'],
    [new CepError(504, 'CEP_TIMEOUT', 'Consulta indisponivel.'), 504, 'CEP_TIMEOUT'],
  ])('translates %s explicitly', async (error, statusCode, code) => {
    const app = await fixture(UserRole.AGENT, fakeLookup(() => Promise.reject(error)));
    const response = await app.inject('/cep/lookup?cep=01001000');
    expect(response.statusCode).toBe(statusCode);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['retry-after']).toBe(statusCode === 429 ? '60' : undefined);
    expect(response.json()).toMatchObject({ code });
  });

  it('does not expose unexpected upstream errors', async () => {
    const app = await fixture(
      UserRole.AGENT,
      fakeLookup(() => Promise.reject(new Error('sensitive upstream content'))),
    );
    const response = await app.inject('/cep/lookup?cep=01001000');
    expect(response.statusCode).toBe(500);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).not.toContain('sensitive upstream content');
    expect(response.json()).toEqual({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    });
  });
});
