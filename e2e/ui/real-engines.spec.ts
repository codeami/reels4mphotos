import { readFileSync } from 'node:fs';
import { devices, expect, test } from '@playwright/test';
import { makeScenePhotos } from './helpers';

// Every other UI spec pins `?fakes=1`, so the real curation engine and the real
// bundled tracks are never driven end to end. This one loads the page as a user
// would (no `?fakes=1`). Render is still the stand-in until that workstream
// lands; everything up to and including the preview is real.
test.use({ ...devices['Pixel 7'], viewport: { width: 390, height: 844 } });

interface CatalogueEntry {
  id: string;
  title: string;
  mood: string;
  track: string;
  beatmap: string;
}
const catalogue = (
  JSON.parse(readFileSync('public/music/index.json', 'utf8')) as { tracks: CatalogueEntry[] }
).tracks;

test('real curation and real tracks: add photos, see the selection, pick a track, reach preview', async ({
  page,
}) => {
  const failed: string[] = [];
  page.on('response', (r) => {
    if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
  });
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await page.goto('./');
  await page.setInputFiles('#photo-input', await makeScenePhotos(page, 12));

  // Selection: no "Could not choose photos" notice, and the tiles carry the real engine's ids.
  await expect(page.getByRole('heading', { name: /\d+ in your reel/ })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  const ids = await page
    .locator('[data-reel-list] [data-tile]')
    .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.id ?? ''));
  expect(ids.length).toBeGreaterThanOrEqual(5);
  expect(ids.length).toBeLessThanOrEqual(10);
  expect(ids.every((id) => /^photo-\d+$/.test(id))).toBe(true);
  for (const why of await page.locator('.leftout .why').allTextContents())
    expect(why.trim()).not.toBe('');

  // Track list: exactly what public/music/index.json ships, in that order.
  await page.getByTestId('next').click();
  await expect(page.getByRole('heading', { name: 'Pick the beat' })).toBeVisible();
  const offered = await page.locator('.track').evaluateAll((els) =>
    els.map((e) => ({
      id: e.querySelector<HTMLInputElement>('input[name="track"]')?.value ?? '',
      title: e.querySelector('.track-title')?.textContent ?? '',
    })),
  );
  expect(offered).toEqual(catalogue.map(({ id, title }) => ({ id, title })));

  // Choosing each shipped track loads its real beat map; none may come back as an error.
  for (const entry of catalogue) {
    await page.getByText(entry.title, { exact: true }).click();
    await expect(page.getByTestId('next')).toBeEnabled();
    await expect(page.getByRole('alert')).toHaveCount(0);
  }
  const fetched = await page.evaluate(() =>
    performance.getEntriesByType('resource').map((e) => new URL(e.name).pathname),
  );
  for (const entry of catalogue)
    expect(fetched).toContain(new URL(entry.beatmap, page.url()).pathname);

  // Preview is planned from the last track chosen, on its real beats.
  await page.getByTestId('next').click();
  await expect(page.getByRole('heading', { name: 'Watch it cut' })).toBeVisible();
  await expect(page.getByTestId('beat-sync')).toHaveText(/(\d+)\/\1 cuts on beat/);

  expect(failed).toEqual([]);
  expect(pageErrors).toEqual([]);
});
