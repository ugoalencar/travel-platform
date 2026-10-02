import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';

describe('api-lite foundation', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns 200 without auth', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', service: 'api-lite' });
  });

  it('GET /api/health returns 200 (frontend proxy path)', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', service: 'api-lite' });
  });

  it('GET /api/version returns the Travel Lite release baseline', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/version' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      service: 'api-lite',
      product: 'Travel Lite',
      version: '0.1.0',
      release: 'Inicial',
      releaseDate: '2026-10-02',
    });
  });

  it('sends a content security policy for browser responses', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/version' });

    expect(response.headers['content-security-policy']).toContain("default-src 'self'");
    expect(response.headers['content-security-policy']).toContain("frame-ancestors 'none'");
  });

  it('does not reflect arbitrary CORS origins', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/version',
      headers: { origin: 'https://attacker.example' },
    });

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('allows localhost CORS in development for Vite and local smoke tests', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/version',
      headers: { origin: 'http://127.0.0.1:5177' },
    });

    expect(response.headers['access-control-allow-origin']).toBe('http://127.0.0.1:5177');
  });

  it('unknown route returns 404 with error code', async () => {
    const response = await app.inject({ method: 'GET', url: '/does-not-exist' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'Recurso não encontrado', code: 'NOT_FOUND' });
  });
});
