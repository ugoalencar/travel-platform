import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API_PROXY_TARGET = process.env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:4010';

// https://vite.dev/config/
// Dev only: /api is proxied to the Travel Lite API. Production installs are
// served by the API itself (single origin), so no proxy exists there.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    strictPort: true,
    proxy: {
      '/api': {
        target: API_PROXY_TARGET,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
