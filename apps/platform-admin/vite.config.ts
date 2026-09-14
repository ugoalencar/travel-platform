import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import type { ProxyOptions } from 'vite';
import type { Connect } from 'vite';

// Platform Admin Auth: Development headers for platform admin testing
const DEV_AUTH_HEADERS = {
  'x-dev-platform-user-id': '20000000-0000-4000-8000-000000000001',
  'x-dev-platform-user-role': 'PLATFORM_ADMIN',
} as const;

const API_PROXY_TARGET = process.env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:4000';

function devAuthProxyConfig(): ProxyOptions {
  return {
    target: API_PROXY_TARGET,
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api/, ''),
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

// /platform-auth/* (login, mfa/verify, logout) is registered by the
// backend with no prefix rewrite (services/api/src/routes/platform-auth.ts)
// -- plain pass-through, no dev-header injection, since these are exactly
// the routes real login uses to obtain the session in the first place.
function platformAuthProxyConfig(): ProxyOptions {
  return {
    target: API_PROXY_TARGET,
    changeOrigin: true,
  };
}

export default defineConfig(({ command }) => {
  const isDevServer = command === 'serve';

  return {
    plugins: [react(), tailwindcss()],
    build: {
      emptyOutDir: false,
    },
    server: {
      port: 5174,
      strictPort: true,
      ...(isDevServer
        ? {
            proxy: {
              '/api': devAuthProxyConfig(),
              '/platform-auth': platformAuthProxyConfig(),
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
