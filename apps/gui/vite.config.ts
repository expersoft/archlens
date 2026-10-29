import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'web',
  plugins: [react()],
  build: { outDir: '../dist', emptyOutDir: true },
  server: { proxy: { '/api': 'http://localhost:5180' } },
  test: { environment: 'jsdom', globals: false, setupFiles: ['./src/setup.ts'], css: false },
});
