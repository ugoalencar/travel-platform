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

  it('unknown route returns 404 with error code', async () => {
    const response = await app.inject({ method: 'GET', url: '/does-not-exist' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'Not found', code: 'NOT_FOUND' });
  });
});
