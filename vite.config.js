import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const noCacheHeaders = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
};

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    headers: noCacheHeaders,
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
    headers: noCacheHeaders,
  },
});
