import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { registerCustomerRoutes } from '../src/routes/customers';
import { runWithTenantContext } from '../src/tenant-context';
import { HttpError } from '../src/errors';
import type { LiteDatabase } from '../src/database';

let app: FastifyInstance | undefined;
afterEach(async () => { await app?.close(); });

async function start(previous: string | null = null) {
  let stored = previous;
  let writes = 0;
  const row = () => ({ id: 'customer', name: 'Cliente Ficticio', responsible_seller_id: null, zip_code: stored });
  const client = { query(sql: string, params: unknown[] = []) {
    if (sql.startsWith('SELECT id, responsible_seller_id')) return Promise.resolve({ rows: [row()], rowCount: 1 });
    if (sql.includes('INSERT INTO customers')) { stored = params[7] as string | null; writes++; }
    if (sql.includes('UPDATE customers SET')) {
      const match = /zip_code = \$(\d+)/.exec(sql);
      if (match) stored = params[Number(match[1]) - 1] as string | null;
      writes++;
    }
    return Promise.resolve({ rows: [row()], rowCount: 1 });
  } };
  const database = { withTenantTransaction: <T,>(fn: (c: typeof client) => Promise<T>) => fn(client) } as unknown as LiteDatabase;
  app = Fastify();
  app.setErrorHandler((error: Error, _request, reply) => {
    reply.code(error instanceof HttpError ? error.statusCode : 500).send({ error: error.message });
  });
  registerCustomerRoutes(app, database, [(_request, _reply, done) => runWithTenantContext({
    tenantId: 'tenant', userId: 'user', sessionId: 'session', email: 'synthetic@example.test',
    role: 'MASTER', roleRank: 100, grantsAll: true, sellerId: null,
    permissions: new Set(['customers.create', 'customers.read_all', 'customers.update_all']),
  }, done)]);
  await app.ready();
  return { app, stored: () => stored, writes: () => writes };
}

describe('Customer CEP persistence validation', () => {
  it.each(['POST', 'PATCH'] as const)('normalizes CEP on %s', async (method) => {
    const fixture = await start();
    const result = await fixture.app.inject({ method, url: method === 'POST' ? '/customers' : '/customers/customer',
      payload: { name: 'Cliente Ficticio', zip_code: '01001000' } });
    expect(result.statusCode).toBe(method === 'POST' ? 201 : 200);
    expect(fixture.stored()).toBe('01001-000');
  });
  it.each(['POST', 'PATCH'] as const)('rejects malformed CEP before writing on %s', async (method) => {
    const fixture = await start();
    const result = await fixture.app.inject({ method, url: method === 'POST' ? '/customers' : '/customers/customer',
      payload: { name: 'Cliente Ficticio', zip_code: '01001A000' } });
    expect(result.statusCode).toBe(400);
    expect(fixture.writes()).toBe(0);
  });
  it('preserves unchanged legacy CEP and allows clearing it', async () => {
    const fixture = await start('legado');
    const result = await fixture.app.inject({ method: 'PATCH', url: '/customers/customer', payload: { name: 'Novo Nome', zip_code: 'legado' } });
    expect(result.statusCode).toBe(200);
    expect(fixture.stored()).toBe('legado');
    expect((await fixture.app.inject({ method: 'PATCH', url: '/customers/customer', payload: { zip_code: null } })).statusCode).toBe(200);
    expect(fixture.stored()).toBeNull();
  });
});
