import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      input: { app: resolve('index.html') },
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
      },
    },
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:3001',
      '/login': 'http://127.0.0.1:3001',
      '/register': 'http://127.0.0.1:3001',
      '/logout': 'http://127.0.0.1:3001',
    },
  },
});
