import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: 'website',
  base: process.env.DOCS_BASE ?? '/',
  resolve: {
    alias: {
      '/tests': fileURLToPath(new URL('./tests', import.meta.url)),
      'three-gpu-baker': fileURLToPath(new URL('./src/index.ts', import.meta.url)),
    },
  },
  server: { fs: { allow: ['..'] } },
  build: { outDir: '../site-dist', emptyOutDir: true, chunkSizeWarningLimit: 1100 },
});
