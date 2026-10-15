import { devices, expect, test } from '@playwright/test';
import { makePhotos } from './helpers';

// 390px-wide touch phone profile (Chromium), same as the main flow spec.
test.use({ ...devices['Pixel 7'], viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ page }) => {
  await page.goto('./?fakes=1');
});

test('the pick button is the file input: one tap opens the picker', async ({ page }) => {
  // A label bound to the input is the only way iOS Safari opens its picker without a second tap.
  const label = page.locator('label.drop');
  await expect(label).toHaveAttribute('for', 'photo-input');
  await expect(page.locator('#photo-input')).toHaveAttribute('multiple', '');
});

test('picked photos show as large two-per-row tiles with a count and Done', async ({ page }) => {
  await page.setInputFiles('#photo-input', await makePhotos(page, 9));
  await expect(page.getByRole('heading', { name: '9 of 9 photos kept' })).toBeVisible();

  const tiles = page.locator('[data-review-tile]');
  await expect(tiles).toHaveCount(9);
  const boxes = await tiles.evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: r.width, h: r.height };
    }),
  );
  // two per row on a 390px phone, each about 170px wide: far bigger than the 80px picker cells
  expect(new Set(boxes.map((b) => b.x)).size).toBe(2);
  for (const b of boxes) {
    expect(b.w).toBeGreaterThanOrEqual(160);
    expect(b.h).toBeGreaterThanOrEqual(48);
  }
  // no sideways scroll
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  // real pixels were drawn from the files
  await expect(page.locator('[data-review-tile] canvas[data-ready]')).toHaveCount(9);
  await expect(page.getByTestId('next')).toHaveText('Done · 9');
});

test('a tap removes a photo, a second tap keeps it; Done follows the count', async ({ page }) => {
  await page.setInputFiles('#photo-input', await makePhotos(page, 6));
  const first = page.locator('[data-review-tile]').first();
  await first.click();
  await expect(first).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('heading', { name: '5 of 6 photos kept' })).toBeVisible();
  await expect(page.getByTestId('next')).toHaveText('Done · 5');
  await expect(page.getByTestId('next')).toBeEnabled();

  await page.locator('[data-review-tile]').nth(1).click();
  await expect(page.getByRole('alert')).toContainText('at least 5');
  await expect(page.getByTestId('next')).toBeDisabled();

  await page.locator('[data-review-tile]').first().click();
  await expect(page.locator('[data-review-tile]').first()).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('next')).toBeEnabled();
});

test('Done sends only the kept photos on, and nothing leaves the device', async ({ page }) => {
  const requests: string[] = [];
  const origin = new URL(page.url()).origin;
  page.on('request', (r) => {
    if (!r.url().startsWith(origin) && !r.url().startsWith('blob:') && !r.url().startsWith('data:'))
      requests.push(r.url());
  });
  await page.setInputFiles('#photo-input', await makePhotos(page, 8));
  await page.locator('[data-review-tile]').nth(7).click();
  await page.getByTestId('next').click();
  await expect(page.getByRole('heading', { name: 'Watch it cut' })).toBeVisible();
  // 7 kept -> the preview works from 7 photos; the removed one is not in the Photos screen
  await page.getByTestId('customize-photos').click();
  await expect(page.locator('[data-reel-list] [data-tile], .leftout .tile-out')).toHaveCount(7);
  expect(requests).toEqual([]);
});

test('Cancel releases the thumbnails and returns to the first screen', async ({ page }) => {
  await page.setInputFiles('#photo-input', await makePhotos(page, 6));
  await expect(page.locator('[data-review-tile] canvas[data-ready]')).toHaveCount(6);
  const canvases = await page.locator('[data-review-tile] canvas').elementHandles();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('heading', { name: 'Start with your best frames' })).toBeVisible();
  const sizes = await Promise.all(
    canvases.map((c) => c.evaluate((el) => (el as HTMLCanvasElement).width)),
  );
  expect(sizes.every((w) => w === 0)).toBe(true);
});
