import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const API_PROXY_TARGET = process.env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:4000';

export default defineConfig(({ command }) => {
  const isDevServer = command === 'serve';

  return {
    plugins: [react(), tailwindcss()],
    build: {
      emptyOutDir: false,
    },
    server: {
      port: 5175,
      strictPort: true,
      ...(isDevServer
        ? {
            proxy: {
              '/api': {
                target: API_PROXY_TARGET,
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api/, ''),
              },
              // DemoRequest.tsx / TrialSignup.tsx call fetch('/public/leads')
              // directly (no /api prefix) -- this entry was missing entirely
              // before, so that call 404'd even in local `vite dev`. No path
              // rewrite: the backend registers /public/leads at that exact
              // path (services/api/src/platform-routes.ts).
              '/public': {
                target: API_PROXY_TARGET,
                changeOrigin: true,
              },
            },
          }
        : {}),
    },
  };
});
