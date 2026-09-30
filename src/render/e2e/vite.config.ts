import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

// Serves the render harness page only. The app's own Vite config belongs to the scaffold workstream.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  // The app's own public/ folder, so the harness renders to the real bundled tracks and beat maps.
  publicDir: fileURLToPath(new URL('../../../public', import.meta.url)),
  // Pre-bundle up front: finding mediabunny mid-test makes Vite reload the page under the test.
  optimizeDeps: { include: ['mediabunny'] },
  server: { fs: { allow: [repoRoot] } },
});
