import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Visual prototype only (UI-01): no backend/API proxy, no dev-auth headers.
// This app has no AuthProvider/TenantContext yet -- adding either is out of
// scope for this batch (see final report). Screens render static/mock data.
export default defineConfig({
  plugins: [react(), tailwindcss()],
});
