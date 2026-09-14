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

const API_PROXY_TARGET = process.env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:4000';

function devAuthProxyConfig(): ProxyOptions {
  return {
    target: API_PROXY_TARGET,
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api/, ''),
    configure: (proxy, _env) => {
      proxy.on('proxyReq', (proxyReq, req, _res) => {
        // Real Bearer token (Frontend Auth & Session track) always wins --
        // the dev bypass must never override a real session.
        if (req.headers.authorization) return;
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
// needed -- only the distinct dev-customer header is injected, and only
// when the request carries no real customer session token.
function devCustomerAuthProxyConfig(): ProxyOptions {
  return {
    target: API_PROXY_TARGET,
    changeOrigin: true,
    configure: (proxy, _env) => {
      proxy.on('proxyReq', (proxyReq, req, _res) => {
        if (req.headers.authorization) return;
        console.log('[DEV-CUSTOMER-AUTH] Intercepted request:', req.method, req.url);
        for (const [name, value] of Object.entries(DEV_CUSTOMER_AUTH_HEADERS)) {
          console.log(`[DEV-CUSTOMER-AUTH] Setting header: ${name}=${value}`);
          proxyReq.setHeader(name, value);
        }
      });
    },
  };
}

// /customer-auth/* (login, forgot/reset-password, logout) is a distinct,
// unauthenticated-until-login route family the backend registers with no
// prefix rewrite (services/api/src/routes/customer-auth.ts) -- plain
// pass-through, no dev-header injection at all, since these are exactly
// the routes real login uses to obtain the session in the first place.
function customerAuthProxyConfig(): ProxyOptions {
  return {
    target: API_PROXY_TARGET,
    changeOrigin: true,
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
    build: {
      emptyOutDir: false,
    },
    server: {
      port: 5176,
      strictPort: true,
      ...(isDevServer
        ? {
            proxy: {
              '/api': devAuthProxyConfig(),
              '/customer-api': devCustomerAuthProxyConfig(),
              '/customer-auth': customerAuthProxyConfig(),
            },
            middlewares: [
              /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
              (req: any, res: any, next: Connect.NextFunction) => {
                if (!req.headers.authorization) {
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
