import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../..', import.meta.url));
// Local config for the UI workstream. The scaffold workstream owns the real
// vite/vitest config; this one only serves and tests src/ui.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  server: { fs: { allow: [root] }, port: 5199, strictPort: true },
  build: { outDir: `${root}/dist-ui-dev`, emptyOutDir: true },
  test: { root, include: ['src/ui/**/*.test.ts'], environment: 'node' },
});
