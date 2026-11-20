import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { makePhotos, makeScenePhotos, pickPhotos } from './ui/helpers';
import { startHarnessServer, type HarnessServer } from '../src/render/e2e/harness-server';
import type { HarnessRun } from '../src/render/e2e/harness';
import { buildTimeline } from '../src/render/frames/timeline';
import { readMp4Metadata } from '../src/render/metadata';
import type { LookId } from '../src/types/reel-plan';

// The gallery fly-through look: the photos hang in a 3D room drawn with the bundled three.js and
// the camera flies from one to the next on the beat. Rendered by the real render engine in
// Chromium (WebGL on an OffscreenCanvas inside the render worker), read back from the file, and
// driven through the real UI with its feature flag on and off. Same harness page as looks.spec.ts.

const LOOK: LookId = 'gallery-fly-through';

let server: HarnessServer;

test.describe.configure({ mode: 'serial', timeout: 480_000 });

test.beforeAll(async () => {
  server = await startHarnessServer();
});

test.afterAll(async () => {
  await server.close();
});

async function openHarness(page: Page): Promise<void> {
  await page.goto(`${server.url}harness.html`);
  await page.waitForFunction(() => 'r4p' in window);
}

test('exports the gallery fly-through: a 1080x1920, 30 fps, 15-30 s MP4 with every planned frame', async ({
  page,
}, testInfo) => {
  await openHarness(page);
  const { plan, beatmap } = await page.evaluate((l) => window.r4p.reel(undefined, 10, l), LOOK);
  expect(plan.look).toBe(LOOK);
  // one stop per photo: the camera visits each of the ten photos once
  expect(plan.shots).toHaveLength(10);
  expect(new Set(plan.shots.map((s) => s.photoId)).size).toBe(10);

  const run: HarnessRun = await page.evaluate((o) => window.r4p.run(o), { look: LOOK });
  const bytes = Buffer.from(run.base64, 'base64');
  await mkdir('test-results/gallery', { recursive: true });
  await writeFile(
    `test-results/gallery/${LOOK}.${run.mimeType.includes('mp4') ? 'mp4' : 'webm'}`,
    bytes,
  );
  const meta = await readMp4Metadata(new Uint8Array(bytes));
  const { report } = run;

  const evidence = {
    look: LOOK,
    track: beatmap.trackId,
    shots: plan.shots.length,
    path: report.path,
    container: meta.container,
    width: meta.width,
    height: meta.height,
    fps: Number(meta.fps.toFixed(3)),
    frameCount: meta.frameCount,
    durationSec: Number(meta.durationSec.toFixed(3)),
    videoCodec: meta.videoCodec,
    hasAudio: meta.hasAudio,
    audioCodec: meta.audioCodec,
    audioSampleRate: meta.audioSampleRate,
    bytes: run.byteLength,
    renderWallMs: Math.round(run.wallMs),
    msPerFrame: Number((run.wallMs / (meta.frameCount || 1)).toFixed(1)),
    cuts: report.beatAlignment.boundaries,
    cutsOffBeat: report.beatAlignment.offBeat.length,
    maxCutErrorMs: report.beatAlignment.maxErrorMs,
  };
  await testInfo.attach('gallery-export-metadata.json', {
    body: JSON.stringify(evidence, null, 2),
    contentType: 'application/json',
  });
  await writeFile('test-results/gallery/export-metadata.json', JSON.stringify(evidence, null, 2));
  console.log(`gallery export metadata: ${JSON.stringify(evidence)}`);

  // Stills a person can look at: the opening overview, the stop at the second, fourth and seventh
  // photo (a quarter of a second after each arrives), a frame in flight, and the pull-back at the end.
  const stopAt = (k: number) => (plan.shots[k]?.startMs ?? 0) / 1000 + 0.25;
  const flight =
    (plan.shots[5]?.startMs ?? 0) / 1000 + ((plan.shots[5]?.durationMs ?? 0) / 1000) * 0.9;
  const times = [0, stopAt(1), stopAt(3), stopAt(6), flight, plan.totalMs / 1000 - 0.05];
  const stills = await page.evaluate(([b, t]) => window.r4p.stills(b, t), [
    run.base64,
    times,
  ] as const);
  for (const [i, still] of stills.entries()) {
    const file = `test-results/gallery/still-${i}-${(times[i] ?? 0).toFixed(2)}s.png`;
    await writeFile(file, Buffer.from(still, 'base64'));
    await testInfo.attach(`still ${(times[i] ?? 0).toFixed(2)}s`, {
      path: file,
      contentType: 'image/png',
    });
  }

  expect(report.failedAttempts).toEqual([]);
  expect(meta.width).toBe(1080);
  expect(meta.height).toBe(1920);
  expect(meta.durationSec).toBeGreaterThanOrEqual(15);
  expect(meta.durationSec).toBeLessThanOrEqual(30);
  if (report.path !== 'mediarecorder') {
    expect(meta.container).toBe('MP4');
    expect(meta.videoCodec).toBe('avc');
    expect(meta.fps).toBeGreaterThan(29.5);
    expect(meta.fps).toBeLessThan(30.5);
    expect(meta.frameCount).toBe(buildTimeline(plan).frameCount);
    expect(Math.abs(meta.durationSec - plan.totalMs / 1000)).toBeLessThan(0.2);
  }
  if (report.path === 'silent') {
    expect(meta.hasAudio).toBe(false);
  } else {
    expect(meta.hasAudio).toBe(true);
    expect(meta.audioSampleRate).toBe(48_000);
  }
  // the camera arrives at every photo on a cut, and every cut is on a beat of the real track
  expect(report.beatAlignment.boundaries).toBe(plan.shots.length - 1);
  expect(report.beatAlignment.offBeat).toEqual([]);
});

test('the file holds the room: frames have depth, differ from stop to stop, and match the generator', async ({
  page,
}) => {
  await openHarness(page);
  const { plan } = await page.evaluate((l) => window.r4p.reel(undefined, 10, l), LOOK);
  const timeline = buildTimeline(plan);
  const start = (k: number) => timeline.shotStartFrames[k] ?? 0;
  // the opening overview, then three frames with the camera stopped in front of a photo (two frames
  // into the shot) and one in flight (nine tenths through a shot)
  const indices = [
    0,
    start(1) + 2,
    start(3) + 2,
    start(5) + 2,
    start(6) + Math.floor((start(7) - start(6)) * 0.9),
    timeline.frameCount - 1,
  ];

  const checks = await page.evaluate(([i, l]) => window.r4p.encodedFrames(i, l), [
    indices,
    LOOK,
  ] as const);
  console.log(
    `gallery encoded frames vs generator (mean rgb): ${JSON.stringify(checks.map((c) => ({ i: c.index, dec: c.decoded.map(Math.round), exp: c.expected.map(Math.round), d: Number(c.maxDiff.toFixed(1)), spread: Math.round(c.spread) })))}`,
  );
  for (const check of checks) {
    // the export (its own WebGL stage in the worker) and a stage on this thread draw the same room
    expect(check.maxDiff, `frame ${check.index}`).toBeLessThan(12);
    // a room, not a flat fill: dark frames and bright walls in every frame
    expect(check.spread, `frame ${check.index}`).toBeGreaterThan(60);
  }
  // different photos at different stops: the frames are not the same picture
  const stops = checks.slice(1, 4).map((c) => c.decoded);
  for (let a = 0; a < stops.length; a++) {
    for (let b = a + 1; b < stops.length; b++) {
      const diff = Math.max(...(stops[a] ?? []).map((v, c) => Math.abs(v - (stops[b]?.[c] ?? 0))));
      expect(diff, `stops ${a + 1} and ${b + 1}`).toBeGreaterThan(4);
    }
  }
});

test.describe('in the app', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  // The paused frame as pixels, to tell one look from another.
  const canvasPixels = (page: Page) =>
    page.evaluate(
      () => document.querySelector<HTMLCanvasElement>('.reel-canvas')?.toDataURL() ?? '',
    );

  test('with the flag off there is no Gallery chip, and Back from the export screen still works', async ({
    page,
  }) => {
    await page.goto('./?fakes=1');
    await pickPhotos(page, await makePhotos(page, 12));
    await expect(page.getByRole('heading', { name: 'Watch it cut' })).toBeVisible();
    await expect(page.getByTestId('looks').locator('.look-name')).toHaveCount(8);
    await expect(page.getByTestId(`look-${LOOK}`)).toHaveCount(0);

    await page.getByTestId('next').click();
    await expect(page.getByRole('heading', { name: 'Export your reel' })).toBeVisible();
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByRole('heading', { name: 'Watch it cut' })).toBeVisible();
    await expect(page.locator('.reel-canvas')).toBeVisible();
    await expect(page.getByTestId('look-classic')).toHaveAttribute('aria-pressed', 'true');
  });

  test('with ?gallery=1: the chip appears, the preview is drawn in 3D, Back keeps it, and the export is an MP4 made with zero requests', async ({
    page,
    context,
  }, testInfo) => {
    await page.goto('./?gallery=1');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect(page.locator('#app[data-warm="done"]')).toBeAttached();
    await page.waitForLoadState('networkidle');

    await pickPhotos(page, await makeScenePhotos(page, 12));
    await expect(page.getByRole('heading', { name: 'Watch it cut' })).toBeVisible();

    // From here on nothing may be fetched: not three.js, not the worker, not a track.
    const requests: string[] = [];
    context.on('request', (request) => {
      if (!request.url().startsWith('blob:'))
        requests.push(`${request.resourceType()} ${request.url()}`);
    });

    const names = page.getByTestId('looks').locator('.look-name');
    await expect(names).toHaveCount(9);
    await expect(names.nth(5)).toHaveText('Gallery');
    const classic = await canvasPixels(page);
    await page.getByTestId(`look-${LOOK}`).click();
    await expect(page.getByTestId(`look-${LOOK}`)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('look-blurb')).toContainText('gallery');
    await expect.poll(() => canvasPixels(page)).not.toBe(classic);
    await expect(page.locator('.notice')).toHaveCount(0);
    const cutsOnBeat = await page.getByTestId('beat-sync').textContent();
    expect(cutsOnBeat).toMatch(/(\d+)\/\1 cuts on beat/);

    // the preview survives a trip to the export screen and back (the 3D stage is rebuilt)
    await page.getByTestId('next').click();
    await expect(page.getByRole('heading', { name: 'Export your reel' })).toBeVisible();
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByRole('heading', { name: 'Watch it cut' })).toBeVisible();
    await expect(page.getByTestId(`look-${LOOK}`)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.notice')).toHaveCount(0);

    await page.getByTestId('next').click();
    await page.getByTestId('export').click();
    await expect(page.getByRole('progressbar')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Your reel is ready' })).toBeVisible({
      timeout: 420_000,
    });
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('download').click(),
    ]);
    const bytes = new Uint8Array(await readFile(await download.path()));
    const meta = await readMp4Metadata(bytes);

    const evidence = {
      look: LOOK,
      cutsOnBeat,
      container: meta.container,
      width: meta.width,
      height: meta.height,
      fps: Number(meta.fps.toFixed(3)),
      durationSec: Number(meta.durationSec.toFixed(3)),
      hasAudio: meta.hasAudio,
      audioCodec: meta.audioCodec,
      bytes: bytes.length,
      requestsAfterWarmUp: requests,
    };
    await testInfo.attach('gallery-ui-export-metadata.json', {
      body: JSON.stringify(evidence, null, 2),
      contentType: 'application/json',
    });
    console.log(`gallery ui export metadata: ${JSON.stringify(evidence)}`);

    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1920);
    expect(meta.durationSec).toBeGreaterThanOrEqual(15);
    expect(meta.durationSec).toBeLessThanOrEqual(30);
    if (meta.container === 'MP4') {
      expect(meta.fps).toBeGreaterThan(29.5);
      expect(meta.fps).toBeLessThan(30.5);
    }
    expect(requests).toEqual([]);
  });
});
