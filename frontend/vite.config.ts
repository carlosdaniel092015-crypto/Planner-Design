import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: here('.'),
  plugins: [react()],
  resolve: { alias: { '@core': here('../src/core') } },
  build: { outDir: here('../dist/web'), emptyOutDir: true, sourcemap: true },
  server: { port: 5173, proxy: { '/api': 'http://localhost:3000' } },
});
