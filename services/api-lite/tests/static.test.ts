import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';

describe('Travel Lite static SPA handler', () => {
  let distDir: string;
  let app: FastifyInstance;

  beforeAll(async () => {
    distDir = await fs.mkdtemp(path.join(os.tmpdir(), 'travel-lite-dist-'));
    await fs.mkdir(path.join(distDir, 'assets'));
    await fs.writeFile(path.join(distDir, 'index.html'), '<!doctype html><title>Lite</title>');
    await fs.writeFile(path.join(distDir, 'assets', 'main-abc123.js'), 'console.log(1)');
    app = await buildApp({ staticDir: distDir });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await fs.rm(distDir, { recursive: true, force: true });
  });

  it('serves index.html on the root path', async () => {
    const response = await app.inject({ method: 'GET', url: '/' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.body).toContain('<title>Lite</title>');
  });

  it('serves hashed assets with immutable cache', async () => {
    const response = await app.inject({ method: 'GET', url: '/assets/main-abc123.js' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/javascript');
    expect(response.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('falls back to index.html for SPA routes accepting html', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/clientes',
      headers: { accept: 'text/html' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('<title>Lite</title>');
  });

  it('never masks API 404s with the SPA fallback', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/does-not-exist',
      headers: { accept: 'text/html' },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'Recurso não encontrado', code: 'NOT_FOUND' });
  });

  it('rejects path traversal attempts', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/..%2f..%2fpackage.json',
      headers: { accept: 'text/html' },
    });
    expect(response.statusCode).toBe(404);
    expect(response.body).not.toContain('"workspaces"');
  });
});
