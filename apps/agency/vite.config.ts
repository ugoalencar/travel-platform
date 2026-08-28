import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import type { ProxyOptions } from 'vite';

// Dev-only synthetic staff principal (User A / Agency A / ADMIN) matching
// the backend's fail-closed dev-auth allowlist in services/api/src/dev-auth.ts.
// This is NOT a real credential -- the backend independently enforces that
// only this exact (userId, agencyId, role) triple is authorized, and only
// when the API is started with ALLOW_DEV_AUTH=true. The proxy simply saves
// developers from hand-adding these headers to every fetch call locally.
// Mirrors apps/customer/vite.config.ts's devAuthProxyConfig exactly (same
// staff-facing API surface, same headers) -- this app still has no
// AuthProvider/TenantContext of its own, and none is added here; the
// backend remains the sole source of truth for tenant scoping and RBAC.
const DEV_AUTH_HEADERS = {
  'x-dev-user-id': '11000000-0000-4000-8000-000000000001',
  'x-dev-agency-id': '10000000-0000-4000-8000-000000000001',
  'x-dev-role': 'ADMIN',
} as const;

const API_PROXY_TARGET = process.env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:3000';

function devAuthProxyConfig(): ProxyOptions {
  return {
    target: API_PROXY_TARGET,
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api/, ''),
    configure: (proxy) => {
      proxy.on('proxyReq', (proxyReq) => {
        for (const [name, value] of Object.entries(DEV_AUTH_HEADERS)) {
          proxyReq.setHeader(name, value);
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ command }) => {
  // The dev-auth header injection must never run outside `vite dev` (e.g. in
  // a production build), so the proxy -- and its header injection -- is
  // only ever configured for the `serve` command.
  const isDevServer = command === 'serve';

  return {
    plugins: [react(), tailwindcss()],
    server: {
      ...(isDevServer
        ? {
            proxy: {
              '/api': devAuthProxyConfig(),
            },
          }
        : {}),
    },
  };
});
