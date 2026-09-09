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
      proxy.on('proxyReq', (proxyReq) => {
        Object.entries(DEV_AUTH_HEADERS).forEach(([name, value]) => {
          proxyReq.setHeader(name, value);
        });
      });
    },
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
            },
            middlewares: [
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (req: any, res: any, next: Connect.NextFunction) => {
                if (req.url?.startsWith('/api')) {
                  Object.entries(DEV_AUTH_HEADERS).forEach(([name, value]) => {
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
