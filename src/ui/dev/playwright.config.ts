import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  testDir: fileURLToPath(new URL('../../../tests/ui', import.meta.url)),
  use: { baseURL: 'http://localhost:5199' },
  webServer: {
    command: 'npx vite --config src/ui/dev/vite.config.ts',
    url: 'http://localhost:5199',
    reuseExistingServer: true,
    cwd: fileURLToPath(new URL('../../..', import.meta.url)),
  },
  projects: [
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, hasTouch: true } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 14'], viewport: { width: 390, height: 844 } } },
  ],
});
