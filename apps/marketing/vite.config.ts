import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const API_PROXY_TARGET = process.env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:4000';

export default defineConfig(({ command }) => {
  const isDevServer = command === 'serve';

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5175,
      ...(isDevServer
        ? {
            proxy: {
              '/api': {
                target: API_PROXY_TARGET,
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api/, ''),
              },
            },
          }
        : {}),
    },
  };
});
