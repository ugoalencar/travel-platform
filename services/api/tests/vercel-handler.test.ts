import { createServer } from 'node:http';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { createVercelHandler } from '../src/vercel-handler';

describe('Vercel Fastify handler', () => {
  it('routes an HTTP request through the ready Fastify instance', async () => {
    const app = Fastify();
    app.get('/health', async () => ({ status: 'ok' }));
    const handler = createVercelHandler(async () => app);
    const server = createServer((request, response) => {
      void handler(request, response).catch((error: unknown) => {
        response.statusCode = 500;
        response.end(error instanceof Error ? error.message : 'unexpected error');
      });
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Expected an IP socket address.');
    }

    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/health`);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ status: 'ok' });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      await app.close();
    }
  });
});
