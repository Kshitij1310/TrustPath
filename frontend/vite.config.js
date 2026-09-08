import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // `@/…` everywhere — no ../../../ chains.
    alias: { '@': path.resolve(process.cwd(), 'src') },
  },
  server: {
    port: 5173,
    // Talk to the API on the same origin in dev, so cookies/CORS behave the
    // same way they will behind a reverse proxy in production.
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      '/uploads': { target: 'http://localhost:4000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:4000', ws: true },
    },
  },
  build: {
    // Split the heavy, rarely-changing libraries out of the app chunk so a
    // code change does not invalidate Leaflet in everyone's cache.
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-map': ['leaflet', 'react-leaflet'],
          'vendor-query': ['@tanstack/react-query', 'zustand'],
        },
      },
    },
  },
});
