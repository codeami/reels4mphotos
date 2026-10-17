import { devices, expect, test, type Page } from '@playwright/test';
import { makePhotos, pickPhotos } from './helpers';

test.use({ ...devices['Pixel 7'], viewport: { width: 390, height: 844 } });

const watchIt = (page: Page) => page.getByRole('heading', { name: 'Watch it cut' });
const shotTotal = async (page: Page) =>
  Number(((await page.locator('.frame-counter').textContent()) ?? '').split('/')[1]);
// The paused frame as pixels, to tell one look from another.
const canvasPixels = (page: Page) =>
  page.evaluate(() => document.querySelector<HTMLCanvasElement>('.reel-canvas')?.toDataURL() ?? '');

test.beforeEach(async ({ page }) => {
  await page.goto('./?fakes=1');
  await pickPhotos(page, await makePhotos(page, 12));
  await expect(watchIt(page)).toBeVisible();
});

test('five look chips under the reel, Classic first and chosen, in plain words', async ({
  page,
}) => {
  const chips = page.getByTestId('looks').getByRole('button');
  await expect(chips).toHaveText(['Classic', 'Zoom punch', 'Flash cut', 'Cinematic', 'Photo dump']);
  await expect(page.getByTestId('look-classic')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('look-blurb')).toContainText('Soft fades');
});

test('tapping a look re-cuts the preview: chip lights up, blurb changes, picture changes', async ({
  page,
}) => {
  const classic = await canvasPixels(page);
  const classicShots = await shotTotal(page);
  expect(classicShots).toBe(10);

  await page.getByTestId('look-zoom-punch').click();
  await expect(page.getByTestId('look-zoom-punch')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('look-classic')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('look-blurb')).toContainText('push-in on every beat');
  // a quick-cut look goes round the photos again: more cuts than photos
  await expect.poll(() => shotTotal(page)).toBeGreaterThan(classicShots);
  await expect.poll(() => canvasPixels(page)).not.toBe(classic);

  // every cut still lands on a beat of the chosen track
  await expect(page.getByTestId('beat-sync')).toHaveText(/(\d+)\/\1 cuts on beat/);

  await page.getByTestId('look-cinematic').click();
  await expect.poll(() => shotTotal(page)).toBe(10);
  await expect(page.getByTestId('look-blurb')).toContainText('black bars');
});

test('the look survives Play, rating and Length: the reel is still cut in that look', async ({
  page,
}) => {
  await page.getByTestId('look-photo-dump').click();
  await expect(page.getByTestId('look-photo-dump')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('look-blurb')).toContainText('shaky');
  await page.getByText('Long', { exact: true }).click();
  await expect(page.getByTestId('look-photo-dump')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Rate 2 out of 5' }).click();
  await expect(page.getByTestId('rating-note')).toContainText('new version');
  await expect(page.getByTestId('look-photo-dump')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Play preview' }).click();
  await expect(page.getByRole('button', { name: 'Pause preview' })).toBeVisible();
  await expect(page.locator('.clock')).not.toContainText('0.0s /');
});

test('export without music: says what it does, exports silent, and says what to do next', async ({
  page,
}) => {
  await page.getByTestId('look-flash-cut').click();
  await expect(page.getByTestId('look-flash-cut')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('next').click();

  const box = page.getByTestId('no-music');
  await expect(box).not.toBeChecked();
  await expect(page.getByTestId('no-music-help')).toHaveText(
    'Add a song inside Instagram when you post.',
  );
  await box.check();
  await expect(page.getByTestId('cuts-follow')).toContainText('Cuts follow the beat of');

  await page.getByTestId('export').click();
  await expect(page.getByRole('heading', { name: 'Your reel is ready' })).toBeVisible();
  const hint = page.getByTestId('silent-hint');
  await expect(hint).toContainText('No music in this video, as you asked.');
  await expect(hint).toContainText('Add a song inside Instagram when you post.');
  await expect(hint).toContainText('Cuts follow the beat of');
});

test('with the option off, an export keeps its music and shows no silent note', async ({
  page,
}) => {
  await page.getByTestId('next').click();
  await page.getByTestId('export').click();
  await expect(page.getByRole('heading', { name: 'Your reel is ready' })).toBeVisible();
  await expect(page.getByTestId('silent-hint')).toHaveCount(0);
});
