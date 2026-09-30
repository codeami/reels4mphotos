import { devices, expect, test } from '@playwright/test';

// 390px-wide touch phone profile (Chromium).
test.use({ ...devices['Pixel 7'], viewport: { width: 390, height: 844 } });
import { makePhotos, reelIds } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('./?fakes=1');
});

test('file input accepts image/* and nothing else', async ({ page }) => {
  await expect(page.locator('#photo-input')).toHaveAttribute('accept', 'image/*');
  await expect(page.getByText('5–50 photos', { exact: false }).first()).toBeVisible();
});

test('states the 5-50 range instead of failing silently', async ({ page }) => {
  const few = await makePhotos(page, 3);
  await page.setInputFiles('#photo-input', few);
  await expect(page.getByRole('alert')).toContainText('at least 5');
  const many = await makePhotos(page, 51);
  await page.setInputFiles('#photo-input', many);
  await expect(page.getByRole('alert')).toContainText('50 or fewer');
});

test('an undecodable HEIC shows a chip and is skipped, not dropped or crashed', async ({
  page,
}) => {
  const photos = await makePhotos(page, 6);
  const heic = {
    name: 'IMG_9000.HEIC',
    mimeType: 'image/heic',
    buffer: Buffer.from('not really heic'),
  };
  await page.setInputFiles('#photo-input', [...photos, heic]);
  await expect(page.getByRole('heading', { name: /in your reel/ })).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.locator('.chip-warn')).toContainText('HEIC not supported in this browser');
  await expect(page.locator('.chip-warn')).toContainText('IMG_9000.HEIC');
});

test('core loop: pick 20, deselect one, reorder, track, preview, export, share', async ({
  page,
}) => {
  await page.setInputFiles('#photo-input', await makePhotos(page, 20));
  await expect(page.getByRole('heading', { name: '10 in your reel' })).toBeVisible();

  // left-out photos carry a reason
  await expect(page.locator('.leftout .why').first()).not.toBeEmpty();

  // deselect one
  await page.getByRole('button', { name: 'Remove photo 3 from the reel' }).click();
  await expect(page.getByRole('heading', { name: '9 in your reel' })).toBeVisible();

  // reorder with buttons (accessible path)
  const before = await reelIds(page);
  await page.getByRole('button', { name: 'Move photo 1 later' }).click();
  const after = await reelIds(page);
  expect(after[1]).toBe(before[0]);

  await page.getByTestId('next').click();
  await page.getByText('Upbeat', { exact: true }).click();
  await expect(page.getByTestId('next')).toBeEnabled();
  await page.getByTestId('next').click();

  await expect(page.getByRole('heading', { name: 'Watch it cut' })).toBeVisible();
  await expect(page.getByTestId('beat-sync')).toHaveText(/(\d+)\/\1 cuts on beat/);
  await page.getByRole('button', { name: 'Play preview' }).click();
  await expect(page.getByRole('button', { name: 'Pause preview' })).toBeVisible();
  await page.getByRole('button', { name: 'Pause preview' }).click();

  await page.getByTestId('next').click();
  await page.getByTestId('export').click();
  await expect(page.getByRole('progressbar')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your reel is ready' })).toBeVisible();
  await expect(page.getByTestId('download')).toHaveText('Save video');
  await expect(page.getByTestId('silent-hint')).toHaveCount(0);
  await expect(page.getByTestId('saved-next')).toHaveCount(0);
  await page.getByTestId('download').click();
  await expect(page.getByTestId('saved-next')).toContainText(
    'open Instagram and pick the reel from your camera roll',
  );
  await expect(page.getByTestId('saved-next')).not.toContainText(/post(s|ed)? to/i);
});

test('share is guarded by canShare and download is always there', async ({ page }) => {
  await page.addInitScript(() => {
    (navigator as unknown as { canShare: unknown }).canShare = () => false;
  });
  await page.goto('./?fakes=1');
  await page.setInputFiles('#photo-input', await makePhotos(page, 6));
  await page.getByTestId('next').click();
  await page.getByText('Chill', { exact: true }).click();
  await expect(page.getByTestId('next')).toBeEnabled();
  await page.getByTestId('next').click();
  await page.getByTestId('next').click();
  await page.getByTestId('export').click();
  await expect(page.getByTestId('download')).toBeVisible();
  await expect(page.getByTestId('share')).toHaveCount(0);
});

test('share button calls navigator.share with the MP4 file when allowed', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __shared: unknown };
    navigator.canShare = () => true;
    navigator.share = async (d: ShareData) => {
      w.__shared = { n: d.files?.[0]?.name, t: d.files?.[0]?.type };
    };
  });
  await page.goto('./?fakes=1');
  await page.setInputFiles('#photo-input', await makePhotos(page, 6));
  await page.getByTestId('next').click();
  await page.getByText('Chill', { exact: true }).click();
  await expect(page.getByTestId('next')).toBeEnabled();
  await page.getByTestId('next').click();
  await page.getByTestId('next').click();
  await page.getByTestId('export').click();
  await page.getByTestId('share').click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __shared: unknown }).__shared))
    .toEqual({ n: 'reel.mp4', t: 'video/mp4' });
});

test('silent render shows the add-sound hint, not a normal export', async ({ page }) => {
  await page.goto('./?fakes=1&silent=1');
  await page.setInputFiles('#photo-input', await makePhotos(page, 6));
  await page.getByTestId('next').click();
  await page.getByText('Chill', { exact: true }).click();
  await expect(page.getByTestId('next')).toBeEnabled();
  await page.getByTestId('next').click();
  await page.getByTestId('next').click();
  await page.getByTestId('export').click();
  await expect(page.getByTestId('silent-hint')).toContainText('Add sound in Instagram');
});

test('keyboard reorders from the drag handle and announces it', async ({ page }) => {
  await page.setInputFiles('#photo-input', await makePhotos(page, 12));
  await expect(page.getByRole('heading', { name: '10 in your reel' })).toBeVisible();
  const before = await reelIds(page);
  await page.getByRole('button', { name: 'Drag photo 1 to reorder' }).focus();
  await page.keyboard.press('ArrowDown');
  const after = await reelIds(page);
  expect(after[1]).toBe(before[0]);
  await expect(page.locator('[aria-live]')).toContainText('position 2');
  await expect(page.getByRole('button', { name: 'Drag photo 2 to reorder' })).toBeFocused();
});

test('makes no network requests beyond the app origin', async ({ page }) => {
  const foreign: string[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (!['localhost', ''].includes(u.hostname) && !/^(blob|data):/.test(u.protocol))
      foreign.push(r.url());
  });
  await page.goto('./?fakes=1');
  await page.setInputFiles('#photo-input', await makePhotos(page, 6));
  await page.getByTestId('next').click();
  expect(foreign).toEqual([]);
});

test('fits 390px with no horizontal overflow on every screen', async ({ page }) => {
  const overflow = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
  expect(await overflow()).toBeLessThanOrEqual(0);
  await page.setInputFiles('#photo-input', await makePhotos(page, 20));
  await expect(page.getByRole('heading', { name: /in your reel/ })).toBeVisible();
  expect(await overflow()).toBeLessThanOrEqual(0);
  await page.getByTestId('next').click();
  await page.getByText('Cinematic', { exact: true }).click();
  expect(await overflow()).toBeLessThanOrEqual(0);
  await expect(page.getByTestId('next')).toBeEnabled();
  await page.getByTestId('next').click();
  await expect(page.getByTestId('beat-sync')).toBeVisible();
  expect(await overflow()).toBeLessThanOrEqual(0);
  await page.screenshot({ path: 'test-results/ui-preview-390.png' });
});

test('reduced motion turns off interface transitions', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setInputFiles('#photo-input', await makePhotos(page, 6));
  const dur = await page
    .locator('.tile')
    .first()
    .evaluate((e) => getComputedStyle(e).transitionDuration);
  expect(dur).toBe('0s');
});

test('the whole flow raises no Content-Security-Policy violations', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (m) => {
    if (/content security policy/i.test(m.text())) violations.push(m.text());
  });
  await page.goto('./?fakes=1');
  await page.setInputFiles('#photo-input', await makePhotos(page, 6));
  await page.getByTestId('next').click();
  await page.getByText('Chill', { exact: true }).click();
  await expect(page.getByTestId('next')).toBeEnabled();
  await page.getByTestId('next').click();
  await expect(page.getByTestId('beat-sync')).toBeVisible();
  await page.getByTestId('next').click();
  await page.getByTestId('export').click();
  await expect(page.getByRole('heading', { name: 'Your reel is ready' })).toBeVisible();
  expect(violations).toEqual([]);
});
