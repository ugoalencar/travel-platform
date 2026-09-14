import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import type { ProxyOptions } from 'vite';
import type { Connect } from 'vite';

// CORE-A: this app now talks to the real Fastify API for
// Customers/Wishes/Trips (see src/lib/api.ts). Dev-auth header injection
// mirrors apps/customer/vite.config.ts exactly -- same synthetic principal
// (User A / Agency A / ADMIN), same fail-closed backend allowlist in
// services/api/src/dev-auth.ts. Not a real credential: the backend
// independently enforces that only this exact (userId, agencyId, role)
// triple is authorized, and only when ALLOW_DEV_AUTH=true.
const DEV_AUTH_HEADERS = {
  'x-dev-user-id': '11000000-0000-4000-8000-000000000001',
  'x-dev-agency-id': '10000000-0000-4000-8000-000000000001',
  'x-dev-role': 'ADMIN',
} as const;

const API_PROXY_TARGET = process.env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:4000';

function devAuthProxyConfig(): ProxyOptions {
  return {
    target: API_PROXY_TARGET,
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api/, ''),
    // Use the http-proxy event-based header injection (Vite 7.x style).
    // Only injects the synthetic dev principal when the request carries no
    // real Authorization header -- once real login (Frontend Auth &
    // Session track) issues a Bearer session token, that token must win,
    // never be silently overridden by the dev bypass.
    configure: (proxy) => {
      proxy.on('proxyReq', (proxyReq, req) => {
        if (req.headers.authorization) return;
        Object.entries(DEV_AUTH_HEADERS).forEach(([name, value]) => {
          proxyReq.setHeader(name, value);
        });
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ command }) => {
  // The dev-auth header injection must never run outside `vite dev` (e.g. in
  // a production build), so the proxy -- and its header injection -- is only
  // ever configured for the `serve` command.
  const isDevServer = command === 'serve';

  return {
    plugins: [react(), tailwindcss()],
    build: {
      emptyOutDir: false,
    },
    server: {
      port: 5173,
      strictPort: true,
      ...(isDevServer
        ? {
            proxy: {
              '/api': devAuthProxyConfig(),
            },
            middlewares: [
              /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
              (req: any, res: any, next: Connect.NextFunction) => {
                if (req.url?.startsWith('/api') && !req.headers.authorization) {
                  Object.entries(DEV_AUTH_HEADERS).forEach(([name, value]) => {
                    req.headers[name] = value;
                  });
                }
                next();
                /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
              },
            ],
          }
        : {}),
    },
  };
});
