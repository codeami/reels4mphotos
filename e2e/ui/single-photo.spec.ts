import { devices, expect, test, type Page } from '@playwright/test';
import { makePhotos, pickPhotos } from './helpers';

test.use({ ...devices['Pixel 7'], viewport: { width: 390, height: 844 } });

const watchIt = (page: Page) => page.getByRole('heading', { name: 'Watch it cut' });
const shotTotal = async (page: Page) =>
  Number(((await page.locator('.frame-counter').textContent()) ?? '').split('/')[1]);
const canvasPixels = (page: Page) =>
  page.evaluate(() => document.querySelector<HTMLCanvasElement>('.reel-canvas')?.toDataURL() ?? '');

test.beforeEach(async ({ page }) => {
  await page.goto('./?fakes=1');
});

test('the first screen says, in plain words, that one photo works with three looks', async ({
  page,
}) => {
  await expect(page.getByTestId('single-photo-note')).toHaveText(
    'Only have one photo? Neon edge, Zoom through and Glitch slice work with a single photo.',
  );
});

test('one photo makes a reel: a look that works with it is chosen, the others say what they need', async ({
  page,
}) => {
  await pickPhotos(page, await makePhotos(page, 1));
  await expect(watchIt(page)).toBeVisible();

  await expect(page.getByTestId('look-neon-edge-pulse')).toHaveAttribute('aria-pressed', 'true');
  for (const id of ['classic', 'zoom-punch', 'flash-cut', 'cinematic', 'photo-dump']) {
    const chip = page.getByTestId(`look-${id}`);
    await expect(chip).toBeDisabled();
    await expect(chip).toContainText('needs 5 photos');
  }
  for (const id of ['neon-edge-pulse', 'zoom-through', 'glitch-slice']) {
    await expect(page.getByTestId(`look-${id}`)).toBeEnabled();
    await expect(page.getByTestId(`look-${id}`)).toContainText('works with one photo');
  }
  await expect(page.getByTestId('few-photos-note')).toContainText('With 1 photo');

  // a full reel from one photo: many cuts, every one on a beat of the chosen track
  expect(await shotTotal(page)).toBeGreaterThanOrEqual(8);
  await expect(page.getByTestId('beat-sync')).toHaveText(/(\d+)\/\1 cuts on beat/);
});

test('each single-photo look re-cuts the same one photo and draws it differently', async ({
  page,
}) => {
  await pickPhotos(page, await makePhotos(page, 1));
  await expect(watchIt(page)).toBeVisible();
  const seen = new Set<string>([await canvasPixels(page)]);

  for (const [id, blurb] of [
    ['zoom-through', 'inside itself'],
    ['glitch-slice', 'tears into strips'],
    ['neon-edge-pulse', 'glowing outline'],
  ] as const) {
    await page.getByTestId(`look-${id}`).click();
    await expect(page.getByTestId(`look-${id}`)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('look-blurb')).toContainText(blurb);
    await expect(page.getByTestId('beat-sync')).toHaveText(/(\d+)\/\1 cuts on beat/);
    await expect.poll(() => canvasPixels(page)).not.toBe('');
    seen.add(await canvasPixels(page));
  }
  expect(seen.size).toBeGreaterThanOrEqual(3);
});

test('three photos still make a reel in a single-photo look', async ({ page }) => {
  await pickPhotos(page, await makePhotos(page, 3));
  await expect(watchIt(page)).toBeVisible();
  await expect(page.getByTestId('look-neon-edge-pulse')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('look-classic')).toBeDisabled();
  await page.getByTestId('look-glitch-slice').click();
  await expect(page.getByTestId('look-glitch-slice')).toHaveAttribute('aria-pressed', 'true');
});

test('with five or more photos the chosen look is kept and every chip works', async ({ page }) => {
  await pickPhotos(page, await makePhotos(page, 6));
  await expect(watchIt(page)).toBeVisible();
  await expect(page.getByTestId('look-classic')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('looks').getByRole('button', { disabled: true })).toHaveCount(0);
  await expect(page.getByTestId('few-photos-note')).toHaveCount(0);
});

test('export without music works from one photo in a single-photo look', async ({ page }) => {
  await pickPhotos(page, await makePhotos(page, 1));
  await expect(watchIt(page)).toBeVisible();
  await page.getByTestId('look-zoom-through').click();
  await expect(page.getByTestId('look-zoom-through')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('next').click();

  await page.getByTestId('no-music').check();
  await page.getByTestId('export').click();
  await expect(page.getByRole('heading', { name: 'Your reel is ready' })).toBeVisible();
  await expect(page.getByTestId('silent-hint')).toContainText(
    'No music in this video, as you asked.',
  );
});
