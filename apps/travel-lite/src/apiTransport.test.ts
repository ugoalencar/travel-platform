import Fastify, { type FastifyInstance } from 'fastify';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { api } from './api';

/**
 * Real HTTP transport against a real Fastify server (default JSON parser, same as api-lite): the Codex
 * review found POST /sales/:id/confirm answered 400 FST_ERR_CTP_EMPTY_JSON_BODY because the client sent
 * Content-Type: application/json without a body. The component tests mock `api`, so they cannot see this.
 */
describe('api() over real HTTP', () => {
  let server: FastifyInstance;
  let base: string;
  const realFetch = globalThis.fetch;

  beforeAll(async () => {
    server = Fastify({ logger: false });
    server.post('/api/sales/:id/confirm', () => ({ ok: true }));
    server.post('/api/sales/:id/cancel', () => ({ ok: true }));
    server.post('/api/auth/logout', () => ({ ok: true }));
    server.post('/api/echo', (request) => ({ received: request.body, contentType: request.headers['content-type'] ?? null }));
    server.get('/api/ping', (request) => ({ contentType: request.headers['content-type'] ?? null }));
    await server.listen({ port: 0, host: '127.0.0.1' });
    base = `http://127.0.0.1:${(server.server.address() as AddressInfo).port}`;
    vi.stubGlobal('fetch', (input: string, init?: RequestInit) => realFetch(`${base}${input}`, init));
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await server.close();
  });

  it('control: the server really rejects a JSON content-type without a body', async () => {
    const response = await realFetch(`${base}/api/sales/1/confirm`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });
    expect(response.status).toBe(400);
    expect((await response.json()) as { code: string }).toMatchObject({ code: 'FST_ERR_CTP_EMPTY_JSON_BODY' });
  });

  it('commands without a body (confirm, cancel, logout) succeed', async () => {
    await expect(api('/sales/1/confirm', { method: 'POST', token: 't' })).resolves.toEqual({ ok: true });
    await expect(api('/sales/1/cancel', { method: 'POST', token: 't' })).resolves.toEqual({ ok: true });
    await expect(api('/auth/logout', { method: 'POST', token: 't' })).resolves.toEqual({ ok: true });
  });

  it('declares JSON only when a body is sent', async () => {
    const withBody = await api<{ received: unknown; contentType: string }>('/echo', { method: 'POST', body: { a: 1 }, token: 't' });
    expect(withBody.received).toEqual({ a: 1 });
    expect(withBody.contentType).toContain('application/json');

    const emptyObject = await api<{ received: unknown }>('/echo', { method: 'POST', body: {}, token: 't' });
    expect(emptyObject.received).toEqual({});

    const get = await api<{ contentType: string | null }>('/ping', { token: 't' });
    expect(get.contentType).toBeNull();
  });
});
