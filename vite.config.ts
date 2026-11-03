import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: { chunkSizeWarningLimit: 800 },
  server: {
    // `npm run dev` serves the pages; `npm run dev:api` answers these.
    proxy: { '/api': 'http://localhost:8080' },
  },
});
