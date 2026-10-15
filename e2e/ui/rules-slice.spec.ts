import { devices, expect, test, type Page } from '@playwright/test';
import { makePhotos } from './helpers';

test.use({ ...devices['Pixel 7'], viewport: { width: 390, height: 844 } });

const watchIt = (page: Page) => page.getByRole('heading', { name: 'Watch it cut' });
const order = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-reel-list] [data-tile]')].map(
      (e) => (e as HTMLElement).dataset.id,
    ),
  );
const reelOrder = async (page: Page) => {
  await page.getByTestId('customize-photos').click();
  await expect(page.getByRole('heading', { name: /in your reel$/ })).toBeVisible();
  const ids = await order(page);
  await page.getByTestId('next').click();
  await expect(watchIt(page)).toBeVisible();
  return ids.join();
};

test.beforeEach(async ({ page }) => {
  await page.goto('./?fakes=1');
});

test('advice card: plain words, what is strong and where a B-roll shot would help', async ({
  page,
}) => {
  await page.setInputFiles('#photo-input', await makePhotos(page, 12));
  await expect(watchIt(page)).toBeVisible();
  const card = page.getByTestId('advice');
  await expect(card).toContainText('12 photos, 10 in your reel.');
  await expect(card).toContainText('10 sharp, well-lit shots to work with.');
  await expect(card).toContainText('Mostly portrait shots. Add a wide landscape shot');
  expect(await card.innerText()).not.toMatch(/\bAI\b/i);
});

test('rating 5 stops and says the rating stays on the device', async ({ page }) => {
  await page.setInputFiles('#photo-input', await makePhotos(page, 12));
  await expect(watchIt(page)).toBeVisible();
  const before = await reelOrder(page);
  await page.getByRole('button', { name: 'Rate 5 out of 5' }).click();
  await expect(page.getByTestId('rating-note')).toContainText('stays on this device');
  await expect(page.getByRole('button', { name: 'Rate 5 out of 5' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(await reelOrder(page)).toBe(before);
});

test('rating 1 to 4 makes a different reel, three times, then says so plainly', async ({
  page,
}) => {
  await page.setInputFiles('#photo-input', await makePhotos(page, 12));
  await expect(watchIt(page)).toBeVisible();
  const seen = [await reelOrder(page)];
  for (const [retry, stars] of [
    [1, 2],
    [2, 1],
    [3, 4],
  ] as const) {
    await page.getByRole('button', { name: `Rate ${stars} out of 5` }).click();
    await expect(page.getByTestId('rating-note')).toContainText(
      `Rated ${stars}. Here is a new version (${retry} of 3).`,
    );
    await expect(page.getByTestId('rating-note')).not.toContainText('Building');
    const now = await reelOrder(page);
    expect(seen).not.toContain(now);
    seen.push(now);
  }
  await page.getByRole('button', { name: 'Rate 2 out of 5' }).click();
  await expect(page.getByTestId('rating-note')).toHaveText(
    "That's 3 new versions. Try changing the photos.",
  );
  expect(await reelOrder(page)).toBe(seen[3]);
});

test('ratings are not saved or sent anywhere', async ({ page }) => {
  const foreign: string[] = [];
  page.on('request', (r) => {
    if (!/^(blob|data):/.test(r.url()) && new URL(r.url()).hostname !== 'localhost')
      foreign.push(r.url());
  });
  await page.setInputFiles('#photo-input', await makePhotos(page, 8));
  await expect(watchIt(page)).toBeVisible();
  await page.getByRole('button', { name: 'Rate 2 out of 5' }).click();
  await expect(page.getByTestId('rating-note')).toContainText('Rated 2');
  expect(foreign).toEqual([]);
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
});

test('export, then clear: says what goes and what stays, then leaves the app empty', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __made: string[]; __revoked: string[] };
    w.__made = [];
    w.__revoked = [];
    const make = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    // Only the user's own data: photos and the exported reel, not the shipped music.
    URL.createObjectURL = (o: Blob | MediaSource) => {
      const url = make(o);
      if (o instanceof File || (o instanceof Blob && o.type === 'video/mp4')) w.__made.push(url);
      return url;
    };
    URL.revokeObjectURL = (url: string) => {
      w.__revoked.push(url);
      revoke(url);
    };
  });
  await page.goto('./?fakes=1');
  await page.setInputFiles('#photo-input', await makePhotos(page, 12));
  await expect(watchIt(page)).toBeVisible();
  await page.getByTestId('next').click();
  await page.getByTestId('export').click();
  await expect(page.getByRole('heading', { name: 'Your reel is ready' })).toBeVisible();

  await page.getByTestId('clear').click();
  const ask = page.getByTestId('clear-confirm');
  await expect(ask).toContainText('Clear the copies this app holds?');
  await expect(ask).toContainText('The photos you added.');
  await expect(ask).toContainText('The exported reel video. Save it first.');
  await expect(ask).toContainText('Not deleted: your original photos in your Photos library');
  await expect(ask).toContainText('A web app cannot delete them.');
  await expect(ask).toContainText('open Photos and delete them yourself');

  // Keep changes nothing
  await page.getByTestId('clear-keep').click();
  await expect(page.getByTestId('clear-confirm')).toHaveCount(0);
  await expect(page.getByTestId('download')).toBeVisible();

  await page.getByTestId('clear').click();
  await page.getByTestId('clear-confirm-yes').click();
  await expect(page.getByRole('heading', { name: 'App copies cleared' })).toBeVisible();
  await expect(page.getByTestId('cleared')).toHaveText(
    'Done. This app no longer holds your photos or your reel.',
  );
  await expect(page.getByTestId('originals-note')).toContainText('still in your Photos library');

  // nothing left on screen or in storage
  await expect(page.locator('img[src^="blob:"], canvas, video')).toHaveCount(0);
  await expect(page.getByTestId('download')).toHaveCount(0);
  const left = await page.evaluate(async () => {
    const w = window as unknown as { __made: string[]; __revoked: string[] };
    return {
      made: w.__made.length,
      notRevoked: w.__made.filter((u) => !w.__revoked.includes(u)),
      local: localStorage.length,
      session: sessionStorage.length,
      databases: (await indexedDB.databases()).length,
      blobCaches: (
        await Promise.all(
          (await caches.keys()).map(async (k) =>
            (await (await caches.open(k)).keys()).filter((r) => r.url.startsWith('blob:')),
          ),
        )
      ).flat().length,
    };
  });
  expect(left.made).toBeGreaterThan(12); // 12 photos and the reel
  expect(left).toMatchObject({
    notRevoked: [],
    local: 0,
    session: 0,
    databases: 0,
    blobCaches: 0,
  });

  // start again begins empty
  await page.getByRole('button', { name: 'Start again' }).click();
  await expect(page.locator('#photo-input')).toBeAttached();
  await expect(page.locator('[data-tile]')).toHaveCount(0);
});
