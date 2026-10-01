import { expect, test } from '@playwright/test';

// MVP gate, step 6: zero network requests after page load.
// Listens on the browser context so requests from pages, workers and the
// service worker are all seen, of any resource type (not just XHR).
test('makes no network request after the page has loaded', async ({ page, context }) => {
  await page.goto('./');
  await expect(page.locator('#app h1')).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready); // precache fetches are part of load
  // the app's own load-time warm-up (render worker, capability probe, tracks) is part of load too
  await expect(page.locator('#app[data-warm="done"]')).toBeAttached();
  await page.waitForLoadState('networkidle');

  const late: string[] = [];
  context.on('request', (req) => late.push(`${req.resourceType()} ${req.url()}`));
  await page.waitForTimeout(1500);

  expect(late).toEqual([]);
});
