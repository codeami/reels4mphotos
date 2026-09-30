import { devices, expect, test } from '@playwright/test';

// 390px-wide touch phone profile (Chromium).
test.use({ ...devices['Pixel 7'], viewport: { width: 390, height: 844 } });
import { makePhotos, reelIds } from './helpers';

// Real touch input via CDP (Chromium). Playwright's own touchscreen only taps,
// so this is the closest automated stand-in for a finger drag on iOS Safari.
test('dragging a tile handle by touch reorders the reel', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'CDP touch dispatch is Chromium-only');
  await page.goto('./?fakes=1');
  await page.setInputFiles('#photo-input', await makePhotos(page, 12));
  await expect(page.getByRole('heading', { name: '10 in your reel' })).toBeVisible();
  const before = await reelIds(page);

  const handle = await page.getByRole('button', { name: 'Drag photo 1 to reorder' }).boundingBox();
  const target = await page.locator('[data-reel-list] [data-tile]').nth(3).boundingBox();
  if (!handle || !target) throw new Error('tiles not laid out');
  const cdp = await page.context().newCDPSession(page);
  const from = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 };
  const to = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', p?: { x: number; y: number }) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: p ? [{ x: p.x, y: p.y, id: 1 }] : [],
    });

  await touch('touchStart', from);
  for (let i = 1; i <= 8; i++)
    await touch('touchMove', {
      x: from.x + ((to.x - from.x) * i) / 8,
      y: from.y + ((to.y - from.y) * i) / 8,
    });
  await touch('touchEnd');

  const after = await reelIds(page);
  expect(after[3]).toBe(before[0]);
  expect(after).toHaveLength(before.length);
  expect(new Set(after)).toEqual(new Set(before));
});
