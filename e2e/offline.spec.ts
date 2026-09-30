import { expect, test } from '@playwright/test';

test('renders again after a reload with the network disabled', async ({ page, context }) => {
  await page.goto('./');
  await expect(page.locator('#app h1')).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  await page.reload();

  await expect(page.locator('#app h1')).toHaveText('Reels4mPhotos');
});
