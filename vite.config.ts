import { defineConfig } from 'vitest/config';
import { precacheServiceWorker } from './tools/precache-sw.ts';

// Project pages are served from /<repo>/. Override with VITE_BASE for other hosts.
const base = process.env.VITE_BASE ?? '/reels4mphotos/';

export default defineConfig({
  base,
  plugins: [precacheServiceWorker()],
  build: { target: 'es2022' },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tools/**/*.test.{ts,mjs}', 'scripts/**/*.test.mjs'],
    coverage: { provider: 'v8', reporter: ['text', 'lcov'], include: ['src/**', 'tools/**'] },
  },
});
