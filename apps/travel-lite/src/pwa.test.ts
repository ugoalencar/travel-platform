// @vitest-environment node
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const appRoot = (relative: string) => fileURLToPath(new URL(`../${relative}`, import.meta.url));
const read = (relative: string) => readFileSync(appRoot(relative), 'utf8');

interface Manifest {
  name: string;
  short_name: string;
  lang: string;
  start_url: string;
  scope: string;
  display: string;
  theme_color: string;
  background_color: string;
  icons: Array<{ src: string; sizes: string; type: string; purpose: string }>;
  shortcuts: Array<{ name: string; url: string }>;
}

describe('web app manifest', () => {
  const manifest = JSON.parse(read('public/manifest.json')) as Manifest;

  it('describes an installable standalone app at the site root', () => {
    expect(manifest.name).toBe('Travel Lite');
    expect(manifest.short_name).toBe('Travel Lite');
    expect(manifest.lang).toBe('pt-BR');
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('ships real PNG icons with the declared sizes, including a maskable one', () => {
    const purposes = manifest.icons.map((icon) => `${icon.sizes}:${icon.purpose}`);
    expect(purposes).toEqual(expect.arrayContaining(['192x192:any', '512x512:any', '512x512:maskable']));

    for (const icon of manifest.icons) {
      const file = appRoot(`public${icon.src}`);
      expect(existsSync(file), icon.src).toBe(true);
      const bytes = readFileSync(file);
      expect(bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
      const [width, height] = icon.sizes.split('x').map(Number);
      expect(bytes.readUInt32BE(16)).toBe(width);
      expect(bytes.readUInt32BE(20)).toBe(height);
      expect(icon.type).toBe('image/png');
    }
  });

  it('only offers shortcuts that stay inside the app', () => {
    expect(manifest.shortcuts.length).toBeGreaterThan(0);
    for (const shortcut of manifest.shortcuts) {
      expect(shortcut.url.startsWith('/')).toBe(true);
      expect(shortcut.url.startsWith('//')).toBe(false);
    }
    expect(manifest.shortcuts.map((shortcut) => shortcut.url)).toContain('/clientes?novo=1');
  });
});

describe('index.html', () => {
  const html = read('index.html');

  it('links the manifest and declares the mobile meta tags', () => {
    expect(html).toContain('<link rel="manifest" href="/manifest.json" />');
    expect(html).toMatch(/<meta name="theme-color" content="#[0-9a-f]{6}" \/>/i);
    expect(html).toContain('width=device-width, initial-scale=1.0, viewport-fit=cover');
    expect(html).toContain('rel="apple-touch-icon"');
    expect(html).toContain('name="apple-mobile-web-app-capable"');
  });
});

// --- Service worker: run public/sw.js against a small fake runtime ------------

interface FakeResponse {
  ok: boolean;
  type: string;
  headers: { get: (name: string) => string | null };
  clone: () => FakeResponse;
}

function response(options: { ok?: boolean; type?: string; contentType?: string } = {}): FakeResponse {
  const value: FakeResponse = {
    ok: options.ok ?? true,
    type: options.type ?? 'basic',
    headers: { get: (name) => (name.toLowerCase() === 'content-type' ? (options.contentType ?? 'text/plain') : null) },
    clone: () => value,
  };
  return value;
}

type Listener = (event: Record<string, unknown>) => void;

function loadServiceWorker(options: { network?: (url: string) => Promise<FakeResponse> } = {}) {
  const listeners: Record<string, Listener> = {};
  const stores = new Map<string, Map<string, FakeResponse>>();
  const path = (input: unknown): string => {
    const raw = typeof input === 'string' ? input : (input as { url: string }).url;
    return new URL(raw, 'https://app.test').pathname;
  };
  const cacheApi = (name: string) => ({
    addAll: (urls: string[]) => {
      const store = stores.get(name) ?? new Map<string, FakeResponse>();
      stores.set(name, store);
      urls.forEach((url) => store.set(path(url), response({ contentType: 'text/html' })));
      return Promise.resolve();
    },
    put: (request: unknown, value: FakeResponse) => {
      const store = stores.get(name) ?? new Map<string, FakeResponse>();
      stores.set(name, store);
      store.set(path(request), value);
      return Promise.resolve();
    },
  });
  const caches = {
    open: (name: string) => {
      if (!stores.has(name)) stores.set(name, new Map());
      return Promise.resolve(cacheApi(name));
    },
    match: (request: unknown) => {
      for (const store of stores.values()) {
        const hit = store.get(path(request));
        if (hit) return Promise.resolve(hit);
      }
      return Promise.resolve(undefined);
    },
    keys: () => Promise.resolve([...stores.keys()]),
    delete: (name: string) => Promise.resolve(stores.delete(name)),
  };
  const self = {
    location: { origin: 'https://app.test' },
    skipWaiting: vi.fn(() => Promise.resolve()),
    clients: { claim: vi.fn(() => Promise.resolve()) },
    addEventListener: (type: string, listener: Listener) => {
      listeners[type] = listener;
    },
  };
  const fetchMock = vi.fn(options.network ?? (() => Promise.resolve(response())));
  const FakeResponseStatic = { error: () => 'network-error' };

  // The worker runs in its own context with only the globals a service worker would see.
  runInNewContext(read('public/sw.js'), {
    self,
    caches,
    fetch: (request: { url: string }) => fetchMock(request.url),
    Response: FakeResponseStatic,
    URL,
  });

  async function dispatch(type: string, extra: Record<string, unknown> = {}) {
    const waits: Array<Promise<unknown>> = [];
    let responded: Promise<unknown> | undefined;
    listeners[type]?.({
      ...extra,
      waitUntil: (promise: Promise<unknown>) => waits.push(promise),
      respondWith: (promise: Promise<unknown>) => {
        responded = promise;
      },
    });
    await Promise.all(waits);
    return { responded: responded ? await responded : undefined, handled: responded !== undefined };
  }

  const fetchEvent = (url: string, init: { method?: string; mode?: string } = {}) =>
    dispatch('fetch', {
      request: { url, method: init.method ?? 'GET', mode: init.mode ?? 'cors', headers: {} },
    });

  return { self, stores, fetchMock, dispatch, fetchEvent };
}

describe('service worker', () => {
  it('precaches the shell on install and takes control on activate', async () => {
    const sw = loadServiceWorker();
    await sw.dispatch('install');
    const store = [...sw.stores.values()][0]!;
    expect([...store.keys()]).toEqual(['/', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png']);
    expect(sw.self.skipWaiting).toHaveBeenCalled();

    await sw.dispatch('activate');
    expect(sw.self.clients.claim).toHaveBeenCalled();
  });

  it('removes only its own outdated caches', async () => {
    const sw = loadServiceWorker();
    sw.stores.set('travel-lite-shell-v0', new Map());
    sw.stores.set('another-app-cache', new Map());
    await sw.dispatch('install');
    await sw.dispatch('activate');
    expect([...sw.stores.keys()].sort()).toEqual(['another-app-cache', 'travel-lite-shell-v1']);
  });

  it('never touches the API: no interception, no caching, no network call of its own', async () => {
    const sw = loadServiceWorker();
    await sw.dispatch('install');

    for (const url of [
      'https://app.test/api/customers',
      'https://app.test/api/auth/me',
      'https://app.test/api',
      'https://app.test/api/branding/public?slug=gadotti',
    ]) {
      const result = await sw.fetchEvent(url);
      expect(result.handled, url).toBe(false);
    }
    // Opening an API URL straight in the browser is a navigation: it must not be answered
    // from, or stored in, the shell cache either.
    for (const url of ['https://app.test/api/customers', 'https://app.test/api/auth/me']) {
      const result = await sw.fetchEvent(url, { mode: 'navigate' });
      expect(result.handled, `navigate ${url}`).toBe(false);
    }
    expect(sw.fetchMock).not.toHaveBeenCalled();
    for (const store of sw.stores.values()) {
      expect([...store.keys()].some((key) => key.startsWith('/api'))).toBe(false);
    }
  });

  it('ignores writes and other origins', async () => {
    const sw = loadServiceWorker();
    await sw.dispatch('install');

    expect((await sw.fetchEvent('https://app.test/assets/app.js', { method: 'POST' })).handled).toBe(false);
    expect((await sw.fetchEvent('https://cdn.example/assets/app.js')).handled).toBe(false);
    expect((await sw.fetchEvent('https://app.test/some/data.json')).handled).toBe(false);
  });

  it('serves built assets cache-first and stores only successful same-origin responses', async () => {
    const sw = loadServiceWorker();
    await sw.dispatch('install');

    const first = await sw.fetchEvent('https://app.test/assets/app-abc123.js');
    expect(first.handled).toBe(true);
    expect(sw.fetchMock).toHaveBeenCalledTimes(1);

    await sw.fetchEvent('https://app.test/assets/app-abc123.js');
    expect(sw.fetchMock).toHaveBeenCalledTimes(1);

    const failing = loadServiceWorker({ network: () => Promise.resolve(response({ ok: false })) });
    await failing.dispatch('install');
    await failing.fetchEvent('https://app.test/assets/missing.js');
    const failingStore = [...failing.stores.values()][0]!;
    expect(failingStore.has('/assets/missing.js')).toBe(false);

    // A missing asset comes back as the HTML shell with a 200: it must not be stored as the asset.
    const spaFallback = loadServiceWorker({
      network: () => Promise.resolve(response({ contentType: 'text/html; charset=utf-8' })),
    });
    await spaFallback.dispatch('install');
    await spaFallback.fetchEvent('https://app.test/assets/removed-after-deploy.js');
    expect([...spaFallback.stores.values()][0]!.has('/assets/removed-after-deploy.js')).toBe(false);

    const opaque = loadServiceWorker({ network: () => Promise.resolve(response({ type: 'opaque' })) });
    await opaque.dispatch('install');
    await opaque.fetchEvent('https://app.test/assets/opaque.js');
    expect([...opaque.stores.values()][0]!.has('/assets/opaque.js')).toBe(false);
  });

  it('navigates network-first, refreshes the shell and falls back to it offline', async () => {
    const online = loadServiceWorker({ network: () => Promise.resolve(response({ contentType: 'text/html; charset=utf-8' })) });
    await online.dispatch('install');
    const fresh = await online.fetchEvent('https://app.test/clientes', { mode: 'navigate' });
    expect(fresh.handled).toBe(true);
    expect(online.fetchMock).toHaveBeenCalledWith('https://app.test/clientes');

    const offline = loadServiceWorker({ network: () => Promise.reject(new Error('offline')) });
    await offline.dispatch('install');
    const cached = await offline.fetchEvent('https://app.test/vendas', { mode: 'navigate' });
    expect(cached.responded).toBe([...offline.stores.values()][0]!.get('/'));
  });

  it('does not overwrite the shell with a non-HTML or failed navigation response', async () => {
    const sw = loadServiceWorker({ network: () => Promise.resolve(response({ ok: false, contentType: 'application/json' })) });
    await sw.dispatch('install');
    const shell = [...sw.stores.values()][0]!.get('/');
    await sw.fetchEvent('https://app.test/qualquer', { mode: 'navigate' });
    expect([...sw.stores.values()][0]!.get('/')).toBe(shell);
  });

  it('keeps the source free of anything that could cache the API', () => {
    const source = read('public/sw.js');
    expect(source).toContain("url.pathname.startsWith('/api/')");
    expect(source).not.toMatch(/cache\.put\([^)]*api/i);
  });
});
