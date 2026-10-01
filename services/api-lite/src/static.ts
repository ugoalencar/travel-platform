import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { FastifyReply, FastifyRequest } from 'fastify';

const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

export type StaticHandler = (request: FastifyRequest, reply: FastifyReply) => Promise<boolean>;

/**
 * Minimal static file handler for the built SPA (no @fastify/static).
 *
 * Serves existing files from the Vite `dist` directory and falls back to
 * `index.html` for HTML navigation requests (SPA routing). API paths are
 * never handled here. Returns `true` when the reply was sent.
 */
export async function createStaticHandler(rawDistDir: string): Promise<StaticHandler | null> {
  const distDir = path.resolve(rawDistDir);
  try {
    const stat = await fs.stat(distDir);
    if (!stat.isDirectory()) return null;
  } catch {
    return null;
  }

  return async function handleStatic(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
    if (request.method !== 'GET' && request.method !== 'HEAD') return false;

    const urlPath = request.url.split('?')[0] ?? '/';
    let decoded: string;
    try {
      decoded = decodeURIComponent(urlPath);
    } catch {
      return false;
    }
    if (decoded.startsWith('/api/') || decoded === '/api' || decoded === '/health') return false;

    const relative = decoded.replace(/^\/+/, '') || 'index.html';
    const candidate = path.resolve(distDir, relative);
    if (candidate !== distDir && !candidate.startsWith(distDir + path.sep)) return false;

    try {
      const file = await fs.stat(candidate);
      if (file.isFile()) {
        const contentType = CONTENT_TYPES[path.extname(candidate).toLowerCase()] ?? 'application/octet-stream';
        const isImmutableAsset = decoded.startsWith('/assets/');
        reply.header('content-type', contentType);
        reply.header(
          'cache-control',
          isImmutableAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
        );
        reply.send(await fs.readFile(candidate));
        return true;
      }
    } catch {
      // fall through to the SPA fallback
    }

    const accept = request.headers.accept ?? '';
    if (accept.includes('text/html') || accept.includes('*/*')) {
      try {
        const index = await fs.readFile(path.join(distDir, 'index.html'));
        reply.header('content-type', 'text/html; charset=utf-8');
        reply.header('cache-control', 'no-cache');
        reply.send(index);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  };
}
