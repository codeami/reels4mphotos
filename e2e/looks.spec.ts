import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { startHarnessServer, type HarnessServer } from '../src/render/e2e/harness-server';
import type { HarnessRun, HarnessRunOptions, LookTiming } from '../src/render/e2e/harness';
import { LOOK_ORDER } from '../src/looks';
import { buildTimeline } from '../src/render/frames/timeline';
import { readMp4Metadata } from '../src/render/metadata';

// The four looks, the classic one and the silent export, rendered by the real render engine in
// Chromium and read back from the file. Same harness page as export-metadata.spec.ts.

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

async function exportFixture(page: Page, options: HarnessRunOptions) {
  const run: HarnessRun = await page.evaluate((o) => window.r4p.run(o), options);
  const bytes = Buffer.from(run.base64, 'base64');
  return { run, meta: await readMp4Metadata(new Uint8Array(bytes)) };
}

for (const look of LOOK_ORDER) {
  test(`${look}: exports a 1080x1920, 30 fps MP4 with a frame for every planned frame`, async ({
    page,
  }) => {
    await openHarness(page);
    const { plan } = await page.evaluate((l) => window.r4p.reel(undefined, 8, l), look);
    expect(plan.look ?? 'classic').toBe(look);
    const { run, meta } = await exportFixture(page, { look, shotCount: 8 });

    expect(run.report.failedAttempts).toEqual([]);
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1920);
    if (run.report.path !== 'mediarecorder') {
      expect(meta.container).toBe('MP4');
      expect(meta.fps).toBeGreaterThan(29.5);
      expect(meta.fps).toBeLessThan(30.5);
      expect(meta.frameCount).toBe(buildTimeline(plan).frameCount);
    }
    // cuts still land on the beats of the chosen track, whatever the look
    expect(run.report.beatAlignment.offBeat).toEqual([]);
  });
}

test('every look draws different pixels, and the same pixels every time', async ({ page }) => {
  await openHarness(page);
  const hashes = await page.evaluate(() => window.r4p.lookFrameHashes(40));
  const distinct = new Set(Object.values(hashes.first));
  expect(distinct.size).toBe(LOOK_ORDER.length);
  expect(hashes.second).toEqual(hashes.first);
});

test('export without music: a video-only MP4, no track fetched, cuts still on the beat', async ({
  page,
}) => {
  await openHarness(page);
  const { selection } = await page.evaluate(() => window.r4p.probe());
  test.skip(!selection.candidates.includes('silent'), 'this browser cannot make a video-only MP4');
  const { run, meta } = await exportFixture(page, {
    look: 'zoom-punch',
    withoutMusic: true,
    shotCount: 8,
  });

  expect(run.report.path).toBe('silent');
  expect(run.report.hasAudio).toBe(false);
  expect(run.report.audio).toBe('none');
  // asked for, so no apology
  expect(run.report.silentHint).toBeNull();
  expect(meta.container).toBe('MP4');
  expect(meta.videoCodec).toBe('avc');
  expect(meta.hasAudio).toBe(false);
  expect(meta.width).toBe(1080);
  expect(meta.height).toBe(1920);
  expect(run.report.beatAlignment.offBeat).toEqual([]);
});

test('render time per frame of each look', async ({ page }, testInfo) => {
  await openHarness(page);
  const timings: LookTiming[] = await page.evaluate(() => window.r4p.benchLooks(120));
  const load = await page.evaluate(() => ({
    userAgent: navigator.userAgent,
    cores: navigator.hardwareConcurrency,
  }));
  const evidence = {
    what: 'ms per frame at 1080x1920: draw + VideoFrame hand-over; 120 frames per look; photos 3072 px long edge; one render at a time, nothing else timed in parallel',
    ...load,
    timings: timings.map((t) => ({
      ...t,
      medianMs: Number(t.medianMs.toFixed(2)),
      p95Ms: Number(t.p95Ms.toFixed(2)),
      maxMs: Number(t.maxMs.toFixed(2)),
      drawOnlyMedianMs: Number(t.drawOnlyMedianMs.toFixed(2)),
      shotStartMedianMs: Number(t.shotStartMedianMs.toFixed(2)),
    })),
  };
  await mkdir('test-results/looks', { recursive: true });
  await writeFile('test-results/looks/frame-times.json', JSON.stringify(evidence, null, 2));
  await testInfo.attach('frame-times.json', {
    body: JSON.stringify(evidence, null, 2),
    contentType: 'application/json',
  });
  console.log(`frame times: ${JSON.stringify(evidence)}`);

  expect(timings).toHaveLength(LOOK_ORDER.length);
  // a loose ceiling: far above any healthy machine, so only a real regression trips it
  for (const t of timings) expect(t.medianMs, `${t.look} median`).toBeLessThan(500);
});
