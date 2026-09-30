import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('./tour', import.meta.url)),
  base: './',
  plugins: [react()],
  publicDir: 'public',
  build: {
    outDir: '../dist-tour',
    emptyOutDir: true,
    sourcemap: false,
  },
  server: { host: '127.0.0.1', port: 5174 },
});
