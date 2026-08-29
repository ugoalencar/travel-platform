import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import type { ProxyOptions } from 'vite';
import type { Connect } from 'vite';

// Dev-only synthetic principal (User A / Agency A / ADMIN) matching the
// backend's fail-closed dev-auth allowlist in services/api/src/dev-auth.ts.
// This is NOT a real credential — the backend independently enforces that
// only this exact (userId, agencyId, role) triple is authorized, and only
// when the API is started with ALLOW_DEV_AUTH=true. The proxy simply saves
// developers from hand-adding these headers to every fetch call locally.
const DEV_AUTH_HEADERS = {
  'x-dev-user-id': '11000000-0000-4000-8000-000000000001',
  'x-dev-agency-id': '10000000-0000-4000-8000-000000000001',
  'x-dev-role': 'ADMIN',
} as const;

// Dev-only synthetic CUSTOMER identity (Cliente Demo / Agency A), matching
// services/api/src/dev-auth.ts's authorizedDevCustomerPrincipals. Separate
// header scheme (x-dev-customer) from DEV_AUTH_HEADERS above -- this must
// never be sent alongside, or confused with, a staff token.
const DEV_CUSTOMER_AUTH_HEADERS = {
  'x-dev-customer': 'agency-a',
} as const;

const API_PROXY_TARGET = process.env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:3000';

function devAuthProxyConfig(): ProxyOptions {
  return {
    target: API_PROXY_TARGET,
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api/, ''),
    configure: (proxy, _env) => {
      proxy.on('proxyReq', (proxyReq, req, _res) => {
        console.log('[DEV-AUTH] Intercepted request:', req.method, req.url);
        for (const [name, value] of Object.entries(DEV_AUTH_HEADERS)) {
          console.log(`[DEV-AUTH] Setting header: ${name}=${value}`);
          proxyReq.setHeader(name, value);
        }
      });
    },
  };
}

// Separate proxy entry for the customer-portal API surface. The backend
// mounts these routes at /customer-api/* already, so no path rewrite is
// needed -- only the distinct dev-customer header is injected.
function devCustomerAuthProxyConfig(): ProxyOptions {
  return {
    target: API_PROXY_TARGET,
    changeOrigin: true,
    configure: (proxy, _env) => {
      proxy.on('proxyReq', (proxyReq, req, _res) => {
        console.log('[DEV-CUSTOMER-AUTH] Intercepted request:', req.method, req.url);
        for (const [name, value] of Object.entries(DEV_CUSTOMER_AUTH_HEADERS)) {
          console.log(`[DEV-CUSTOMER-AUTH] Setting header: ${name}=${value}`);
          proxyReq.setHeader(name, value);
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ command }) => {
  // The dev-auth header injection must never run outside `vite dev` (e.g. in
  // a production build), so the proxy — and its header injection — is only
  // ever configured for the `serve` command.
  const isDevServer = command === 'serve';

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5174,
      ...(isDevServer
        ? {
            proxy: {
              '/api': devAuthProxyConfig(),
              '/customer-api': devCustomerAuthProxyConfig(),
            },
            middlewares: [
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (req: any, res: any, next: Connect.NextFunction) => {
                if (req.url?.startsWith('/api')) {
                  Object.entries(DEV_AUTH_HEADERS).forEach(([name, value]) => {
                    req.headers[name] = value;
                  });
                }
                if (req.url?.startsWith('/customer-api')) {
                  Object.entries(DEV_CUSTOMER_AUTH_HEADERS).forEach(([name, value]) => {
                    req.headers[name] = value;
                  });
                }
                next();
              },
            ],
          }
        : {}),
    },
  };
});
