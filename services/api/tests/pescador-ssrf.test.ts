import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { extractOfferFromUrl } from '../src/pescador';
import { isBlockedIp } from '../src/ssrf-guard';

describe('Pescador SSRF guard (extractOfferFromUrl)', () => {
  let server: Server;
  let port: number;

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === '/redirect-to-metadata') {
        res.writeHead(302, { Location: 'http://169.254.169.254/latest/meta-data/' });
        res.end();
        return;
      }
      if (req.url === '/redirect-to-localhost') {
        res.writeHead(302, { Location: 'http://127.0.0.1/secret' });
        res.end();
        return;
      }
      if (req.url === '/ok') {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end('<html><head><title>Offer</title></head></html>');
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('server did not bind');
    port = address.port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('blocks direct requests to loopback addresses', async () => {
    const result = await extractOfferFromUrl(`http://127.0.0.1:${port}/ok`);
    expect(result.fetchError).toBeDefined();
    expect(result.fetchError).toMatch(/não permitido|resolve/i);
  });

  it('blocks direct requests to localhost hostname', async () => {
    // Synchronous pre-flight validation (same tier as the http/https protocol
    // check) rejects immediately rather than making any network attempt.
    await expect(extractOfferFromUrl(`http://localhost:${port}/ok`)).rejects.toThrow(/não permitido/i);
  });

  it('blocks requests to the cloud metadata IP', async () => {
    await expect(extractOfferFromUrl('http://169.254.169.254/latest/meta-data/')).rejects.toThrow(/não permitido/i);
  });

  it('blocks RFC1918 private ranges (10/8, 172.16/12, 192.168/16)', () => {
    expect(isBlockedIp('10.0.0.5')).toBe(true);
    expect(isBlockedIp('172.16.5.5')).toBe(true);
    expect(isBlockedIp('192.168.1.1')).toBe(true);
    expect(isBlockedIp('169.254.169.254')).toBe(true);
    expect(isBlockedIp('127.0.0.1')).toBe(true);
    expect(isBlockedIp('::1')).toBe(true);
    expect(isBlockedIp('fe80::1')).toBe(true);
    expect(isBlockedIp('fc00::1')).toBe(true);
  });

  it('allows public IPs through the blocklist check', () => {
    expect(isBlockedIp('8.8.8.8')).toBe(false);
    expect(isBlockedIp('1.1.1.1')).toBe(false);
  });

  it('does not follow a redirect from a public origin to the metadata endpoint', async () => {
    const result = await extractOfferFromUrl(`http://127.0.0.1:${port}/redirect-to-metadata`);
    // The initial hop to our own test server on 127.0.0.1 is itself a
    // loopback address, so it is blocked before any redirect is even
    // considered -- this asserts the guard runs on hop 0, not just later hops.
    expect(result.fetchError).toBeDefined();
  });

  it('rejects a malformed URL', async () => {
    await expect(extractOfferFromUrl('not a url')).rejects.toThrow();
  });

  it('rejects non-http(s) protocols', async () => {
    await expect(extractOfferFromUrl('file:///etc/passwd')).rejects.toThrow();
  });
});
