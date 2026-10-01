import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

export interface HarnessServer {
  // Base URL, ending in a slash.
  url: string;
  close(): Promise<void>;
}

// Serves src/render/e2e/harness.html with Vite's dev server, started from inside the spec so the
// app's own Playwright and Vite configs stay untouched.
export async function startHarnessServer(): Promise<HarnessServer> {
  const server = await createServer({
    configFile: fileURLToPath(new URL('./vite.config.ts', import.meta.url)),
    server: { host: '127.0.0.1', port: 5199, strictPort: false },
    logLevel: 'error',
  });
  await server.listen();
  const url = server.resolvedUrls?.local[0];
  if (!url) throw new Error('the render harness server did not report a URL');
  return { url, close: () => server.close() };
}
