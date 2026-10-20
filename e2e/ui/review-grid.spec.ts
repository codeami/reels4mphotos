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

  // a few photos are enough for the single-photo looks, so Done stays on until none are left
  for (let i = 1; i < 6; i++) await page.locator('[data-review-tile]').nth(i).click();
  await expect(page.getByRole('heading', { name: '0 of 6 photos kept' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('at least 1 photo');
  await expect(page.getByTestId('next')).toBeDisabled();

  await page.locator('[data-review-tile]').first().click();
  await expect(page.locator('[data-review-tile]').first()).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('next')).toBeEnabled();
});

test('leaving out soft, dark, bright and repeat photos is a tick box, on by default', async ({
  page,
}) => {
  await page.setInputFiles('#photo-input', await makePhotos(page, 9));
  const box = page.getByTestId('drop-weak');
  await expect(box).toBeChecked();
  await box.uncheck();
  await expect(box).not.toBeChecked();
  // the choice is kept when the grid redraws after a tap on a photo
  await page.locator('[data-review-tile]').first().click();
  await expect(page.getByTestId('drop-weak')).not.toBeChecked();
});
