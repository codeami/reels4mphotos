import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { makeScenePhotos } from './ui/helpers';
import { BUNDLED_TRACK_IDS, GATE_TRACK_ID } from '../src/render/e2e/harness-reel';
import { startHarnessServer, type HarnessServer } from '../src/render/e2e/harness-server';
import type { HarnessRun, HarnessRunOptions } from '../src/render/e2e/harness';
import { buildTimeline } from '../src/render/frames/timeline';
import { selectPaths } from '../src/render/probe';
import { readMp4Metadata } from '../src/render/metadata';

// MVP gate, step 4: export a reel from fixture photos in Chromium, read the file back in
// JavaScript (mediabunny, no ffmpeg) and assert 1080x1920, 30 fps, 15-30 s, audio present.
//
// The reel is cut to a bundled track's real beat map by curation's own planner and rendered by the
// same renderReel() the UI calls. The page under test is the render harness
// (src/render/e2e/harness.html), which serves the app's public/ folder and runs under the app's
// CSP. The path the export takes is whatever the browser's capability probe picks; the assertions
// follow that path instead of assuming AAC exists on the machine running the test.
//
// Below the gate test: the rest of the render engine's promises. Every path of the fallback ladder
// produces a real file and is reported as such, frames are deterministic, cancelling stops the work,
// bad input is refused rather than stretched, and a render makes no request once the worker and the
// track are loaded.

interface CatalogueEntry {
  id: string;
  title: string;
}
const catalogue = (
  JSON.parse(readFileSync('public/music/index.json', 'utf8')) as { tracks: CatalogueEntry[] }
).tracks;

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

async function exportFixture(page: Page, name: string, options: HarnessRunOptions) {
  const run: HarnessRun = await page.evaluate((o) => window.r4p.run(o), options);
  const bytes = Buffer.from(run.base64, 'base64');
  await mkdir('test-results/render-e2e', { recursive: true });
  await writeFile(
    `test-results/render-e2e/${name}.${run.mimeType.includes('mp4') ? 'mp4' : 'webm'}`,
    bytes,
  );
  return { run, bytes, meta: await readMp4Metadata(new Uint8Array(bytes)) };
}

// Four shots (about 8 s): enough to show a path works without a full-length render.
const SHORT = { shotCount: 4 };

test('exports a 1080x1920, 30 fps, 15-30 s MP4 with audio', async ({ page }, testInfo) => {
  await openHarness(page);

  const { selection } = await page.evaluate(() => window.r4p.probe());
  expect(selection.candidates.length, 'this browser can export a reel at all').toBeGreaterThan(0);
  const { plan } = await page.evaluate(() => window.r4p.reel());

  const { run, meta } = await exportFixture(page, 'gate', {});
  const { report } = run;

  // Which path ran is reported, and is the best one the probe allowed. The report carries the
  // probe's own answer (asked inside the render worker), so that is what it is checked against.
  expect(report.path).toBe(selectPaths(report.capabilities).candidates[0]);
  expect(report.path).toBe(selection.candidates[0]);
  expect(report.failedAttempts).toEqual([]);

  const evidence = {
    track: GATE_TRACK_ID,
    shots: plan.shots.length,
    path: report.path,
    skipped: report.skipped,
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
    audioChannels: meta.audioChannels,
    bytes: run.byteLength,
    renderWallMs: Math.round(run.wallMs),
    cuts: report.beatAlignment.boundaries,
    cutsOffBeat: report.beatAlignment.offBeat.length,
    maxCutErrorMs: report.beatAlignment.maxErrorMs,
  };
  await testInfo.attach('export-metadata.json', {
    body: JSON.stringify(evidence, null, 2),
    contentType: 'application/json',
  });
  console.log(`export metadata: ${JSON.stringify(evidence)}`);

  expect(meta.width).toBe(1080);
  expect(meta.height).toBe(1920);
  expect(meta.durationSec).toBeGreaterThanOrEqual(15);
  expect(meta.durationSec).toBeLessThanOrEqual(30);

  if (report.path === 'mediarecorder') {
    // MediaRecorder cannot promise a constant frame rate; it still has to be close.
    expect(meta.fps).toBeGreaterThan(24);
    expect(meta.fps).toBeLessThan(31);
  } else {
    expect(meta.container).toBe('MP4');
    expect(meta.videoCodec).toBe('avc');
    expect(meta.fps).toBeGreaterThan(29.5);
    expect(meta.fps).toBeLessThan(30.5);
    expect(meta.frameCount).toBe(Math.round((plan.totalMs * 30) / 1000));
    // the file is as long as the plan says, give or take the audio encoder's priming
    expect(Math.abs(meta.durationSec - plan.totalMs / 1000)).toBeLessThan(0.2);
  }

  if (report.path === 'silent') {
    // Nothing here could put sound in the file; the caller is told why, never left guessing.
    expect(meta.hasAudio).toBe(false);
    expect(report.silentHint?.code).toBe('add-sound-in-instagram');
    expect(report.silentHint?.reason.length).toBeGreaterThan(0);
  } else {
    expect(meta.hasAudio).toBe(true);
    expect(report.hasAudio).toBe(true);
    expect(meta.audioChannels).toBe(2);
    // Read back from the file, so a malformed audio description (WebKit's AAC quirk) shows up here.
    expect(meta.audioSampleRate).toBe(48_000);
  }
  if (report.path === 'webcodecs-aac') expect(meta.audioCodec).toBe('aac');

  // Every cut lands within a frame of a beat in the track's real beat map.
  expect(report.beatAlignment.boundaries).toBe(plan.shots.length - 1);
  expect(report.beatAlignment.offBeat).toEqual([]);

  // Progress only ever moves forward and finishes at 1.
  expect(run.progress[0]).toBe(0);
  expect(run.progress.at(-1)).toBe(1);
  run.progress.forEach(
    (p, i) => i > 0 && expect(p).toBeGreaterThanOrEqual(run.progress[i - 1] ?? 0),
  );
});

// The gate as a user meets it: real UI, real curation, real bundled track, real render engine. Photos
// go in through the file input, the export is downloaded through the Save button, and the file that
// lands on disk is read back in JS.
test('through the real UI: pick photos, choose a track, export, and read the downloaded MP4', async ({
  page,
  context,
}, testInfo) => {
  const track = catalogue.find((t) => t.id === GATE_TRACK_ID);
  if (!track) throw new Error(`${GATE_TRACK_ID} is not in public/music/index.json`);

  await page.goto('./');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForLoadState('networkidle');

  await page.setInputFiles('#photo-input', await makeScenePhotos(page, 12));
  await expect(page.getByRole('heading', { name: /\d+ in your reel/ })).toBeVisible();
  await page.getByTestId('next').click();
  await page.getByText(track.title, { exact: true }).click();
  await expect(page.getByTestId('next')).toBeEnabled();
  await page.getByTestId('next').click();
  await expect(page.getByRole('heading', { name: 'Watch it cut' })).toBeVisible();
  const cutsOnBeat = await page.getByTestId('beat-sync').textContent();
  await page.getByTestId('next').click();

  const requests: string[] = [];
  context.on('request', (request) => requests.push(request.url()));
  await page.getByTestId('export').click();
  await expect(page.getByRole('progressbar')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your reel is ready' })).toBeVisible({
    timeout: 420_000,
  });

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('download').click(),
  ]);
  const file = await download.path();
  const bytes = new Uint8Array(await readFile(file));
  const meta = await readMp4Metadata(bytes);
  const silent = (await page.getByTestId('silent-hint').count()) > 0;

  const origin = new URL(page.url()).origin;
  const offOrigin = requests.filter(
    (url) => !url.startsWith('blob:') && new URL(url).origin !== origin,
  );
  const evidence = {
    track: track.id,
    cutsOnBeat,
    download: download.suggestedFilename(),
    silentHint: silent,
    container: meta.container,
    width: meta.width,
    height: meta.height,
    fps: Number(meta.fps.toFixed(3)),
    durationSec: Number(meta.durationSec.toFixed(3)),
    hasAudio: meta.hasAudio,
    audioCodec: meta.audioCodec,
    audioSampleRate: meta.audioSampleRate,
    bytes: bytes.length,
    requestsDuringExport: requests.map((url) => url.replace(origin, '')),
  };
  await testInfo.attach('ui-export-metadata.json', {
    body: JSON.stringify(evidence, null, 2),
    contentType: 'application/json',
  });
  console.log(`ui export metadata: ${JSON.stringify(evidence)}`);

  expect(meta.width).toBe(1080);
  expect(meta.height).toBe(1920);
  expect(meta.durationSec).toBeGreaterThanOrEqual(15);
  expect(meta.durationSec).toBeLessThanOrEqual(30);
  expect(cutsOnBeat).toMatch(/(\d+)\/\1 cuts on beat/);
  // Nothing in the export reached beyond the app's own origin.
  expect(offOrigin).toEqual([]);

  if (silent) {
    // Only where this browser could not put sound in the file, and then it says so.
    expect(meta.hasAudio).toBe(false);
  } else {
    expect(meta.hasAudio).toBe(true);
    expect(meta.audioSampleRate).toBe(48_000);
    expect(meta.fps).toBeGreaterThan(24);
    expect(meta.fps).toBeLessThan(31);
  }
  if (meta.container === 'MP4') {
    expect(meta.fps).toBeGreaterThan(29.5);
    expect(meta.fps).toBeLessThan(30.5);
  }
});

test('every bundled track decodes to 48 kHz stereo with sound in it', async ({ page }) => {
  await openHarness(page);
  for (const trackId of BUNDLED_TRACK_IDS) {
    const decoded = await page.evaluate((id) => window.r4p.decodeBundled(id), trackId);
    expect(decoded.sampleRate, trackId).toBe(48_000);
    expect(decoded.seconds, trackId).toBeGreaterThan(44);
    expect(decoded.seconds, trackId).toBeLessThan(46);
    expect(decoded.rms, trackId).toBeGreaterThan(0.01);
  }
});

test('Opus in MP4: the path runs where the browser can encode Opus, and says it did', async ({
  page,
}) => {
  await openHarness(page);
  const { capabilities } = await page.evaluate(() => window.r4p.probe());
  test.skip(!capabilities.webcodecs.audioOpus, 'this browser cannot encode Opus');

  const { run, meta } = await exportFixture(page, 'path-opus', {
    ...SHORT,
    forcePath: 'webcodecs-opus',
  });
  expect(run.report).toMatchObject({
    path: 'webcodecs-opus',
    audio: 'opus',
    hasAudio: true,
    silentHint: null,
  });
  expect(meta).toMatchObject({
    container: 'MP4',
    width: 1080,
    height: 1920,
    videoCodec: 'avc',
    hasAudio: true,
    audioCodec: 'opus',
  });
  expect(meta.audioSampleRate).toBe(48_000);
});

test('silent video: a real MP4 with no audio track, and the reason handed to the caller', async ({
  page,
}) => {
  await openHarness(page);
  const { run, meta } = await exportFixture(page, 'path-silent', { ...SHORT, forcePath: 'silent' });
  expect(run.report.path).toBe('silent');
  expect(run.report.hasAudio).toBe(false);
  expect(run.report.silentHint?.code).toBe('add-sound-in-instagram');
  expect(meta).toMatchObject({
    container: 'MP4',
    width: 1080,
    height: 1920,
    videoCodec: 'avc',
    hasAudio: false,
  });
  expect(meta.fps).toBeGreaterThan(29.5);
  expect(meta.fps).toBeLessThan(30.5);
});

test('MediaRecorder: records the canvas and an audio graph into a playable file, on the main thread', async ({
  page,
}) => {
  await openHarness(page);
  const { capabilities } = await page.evaluate(() => window.r4p.probe());
  test.skip(
    !capabilities.main.mediaRecorder || !capabilities.main.canvasCapture,
    'no MediaRecorder here',
  );

  const { plan } = await page.evaluate(() => window.r4p.reel(undefined, 4));
  const { run, meta } = await exportFixture(page, 'path-mediarecorder', {
    ...SHORT,
    forcePath: 'mediarecorder',
  });
  expect(run.report).toMatchObject({
    path: 'mediarecorder',
    audio: 'recorder',
    hasAudio: true,
    silentHint: null,
  });
  expect(meta.width).toBe(1080);
  expect(meta.height).toBe(1920);
  expect(meta.hasAudio).toBe(true);
  // Real-time recording. On a machine with no GPU canvas (this test's usual home) the recorder's
  // encoder drops frames and trims the tail, so only "a substantial, playable recording of about
  // the right size" is asserted; frame rate and exact length are device questions.
  expect(meta.durationSec).toBeGreaterThan(plan.totalMs / 1000 / 2);
  expect(meta.durationSec).toBeLessThan((plan.totalMs / 1000) * 1.3);
  expect(meta.frameCount).toBeGreaterThan(3);
  expect(run.progress.at(-1)).toBe(1);
});

// Playwright's "Desktop Chrome" device reports a Windows user agent even on a Mac. The render worker
// decides whether to compensate for Apple's AAC priming from the user agent, so this test presents the
// real one when the machine really is a Mac. Elsewhere the lag is recorded but not asserted: another
// platform's encoder has its own delay and there is nothing to compare it with.
const MAC_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36';

test('audio and picture share one timeline: AAC priming does not shift the sound', async ({
  browser,
}) => {
  const onMac = process.platform === 'darwin';
  const context = await browser.newContext(onMac ? { userAgent: MAC_USER_AGENT } : {});
  try {
    const page = await context.newPage();
    await openHarness(page);
    const { capabilities } = await page.evaluate(() => window.r4p.probe());
    test.skip(!capabilities.webcodecs.audioAac, 'this browser cannot encode AAC');

    const result = await page.evaluate(() => window.r4p.audioLag('webcodecs-aac'));
    test.skip(result === null, 'this browser cannot decode the exported AAC to measure it');
    console.log(`audio lag vs source: ${JSON.stringify(result)}`);
    if (!result || !onMac) return;

    expect(
      Math.abs(result.lagMs),
      'sound is within a third of a frame of the picture',
    ).toBeLessThan(12);
    // the MP4 says so itself: its audio starts before time zero, which is the edit list
    expect(result.firstTimestampSec).toBeLessThan(0);
  } finally {
    await context.close();
  }
});

test('frames are deterministic: the same plan and photos give the same pixels', async ({
  page,
}) => {
  await openHarness(page);
  const { plan } = await page.evaluate(() => window.r4p.reel());
  const timeline = buildTimeline(plan);
  const crossfade = timeline.transitions[0];
  if (!crossfade) throw new Error('the plan has no crossfade');
  const boundary = timeline.shotStartFrames[crossfade.shotIndex] ?? 0;
  const cut = timeline.shotStartFrames[1] ?? 0;
  const frames = [
    0,
    cut - 1,
    cut,
    crossfade.startFrame,
    boundary - 1,
    boundary,
    crossfade.startFrame + crossfade.frameCount - 1,
    timeline.frameCount - 1,
  ];

  // the export draws on an OffscreenCanvas (in its worker), the recorder path on a <canvas>
  for (const kind of ['offscreen', 'element'] as const) {
    const { first, second } = await page.evaluate(([f, k]) => window.r4p.frameHashes(f, k), [
      frames,
      kind,
    ] as const);
    expect(second, kind).toEqual(first);
    // and the frames really differ: a cut changes the picture, a crossfade moves through blends
    expect(new Set(first).size, kind).toBe(frames.length);
  }
});

test('the exported file holds the planned frames in the planned order', async ({ page }) => {
  await openHarness(page);
  const { plan } = await page.evaluate(() => window.r4p.reel(undefined, 4));
  const timeline = buildTimeline(plan);
  const cut = timeline.shotStartFrames[1] ?? 0;
  const crossfade = timeline.transitions[0];
  if (!crossfade) throw new Error('the four-shot plan has no crossfade');
  const boundary = timeline.shotStartFrames[crossfade.shotIndex] ?? 0;
  const indices = [
    0,
    cut - 1,
    cut,
    cut + 12,
    boundary - 3,
    boundary,
    boundary + 3,
    timeline.frameCount - 1,
  ];

  const checks = await page.evaluate((i) => window.r4p.encodedFrames(i), indices);
  console.log(
    `encoded frames vs generator (mean rgb): ${JSON.stringify(checks.map((c) => ({ i: c.index, dec: c.decoded.map(Math.round), exp: c.expected.map(Math.round), d: Number(c.maxDiff.toFixed(1)) })))}`,
  );
  for (const check of checks) {
    // H.264 at 8 Mbit/s shifts colour by a couple of levels; a frame from the wrong place (a
    // timestamp three frames off) shifts it by 40 or more
    expect(check.maxDiff, `frame ${check.index}`).toBeLessThan(10);
  }
  // the cut shows: the frame before and the frame after look different in the file itself
  const before = checks[1]?.decoded ?? [];
  const after = checks[2]?.decoded ?? [];
  expect(Math.max(...before.map((v, c) => Math.abs(v - (after[c] ?? 0))))).toBeGreaterThan(10);
});

test('cancelling stops the render at once and leaves the renderer usable', async ({ page }) => {
  await openHarness(page);
  const cancelled = await page.evaluate(() => window.r4p.cancel());
  expect(cancelled.outcome).toBe('AbortError');
  expect(cancelled.settleMs).toBeLessThan(1000);
  expect(cancelled.progressAfterAbort).toBe(0);

  const { run } = await exportFixture(page, 'after-cancel', { ...SHORT, forcePath: 'silent' });
  expect(run.report.path).toBe('silent');
});

test('a crop that is not 9:16, or a missing photo, is refused rather than rendered wrong', async ({
  page,
}) => {
  await openHarness(page);
  const wrongCrop = await page.evaluate(() => window.r4p.runBad('wrong-crop'));
  expect(wrongCrop).toMatchObject({ name: 'RenderError', code: 'invalid-plan' });
  expect(wrongCrop.message).toContain('not 9:16');

  const missing = await page.evaluate(() => window.r4p.runBad('missing-photo'));
  expect(missing).toMatchObject({ name: 'RenderError', code: 'missing-photo' });
  expect(missing.message).toContain('photo-2');
});

test('a render makes no network request once the worker and the track are loaded', async ({
  page,
  context,
}) => {
  await openHarness(page);
  await page.evaluate(() => window.r4p.prepare());

  const late: string[] = [];
  // A blob: URL is an in-memory object, never a network request. WebKit reports the ones it makes
  // internally (createImageBitmap on a Blob) as requests, so they are left out; anything else counts.
  context.on('request', (request) => {
    if (!request.url().startsWith('blob:')) late.push(`${request.resourceType()} ${request.url()}`);
  });
  const { run } = await exportFixture(page, 'no-requests', SHORT);
  expect(run.report.hasAudio || run.report.silentHint !== null).toBe(true);
  expect(late).toEqual([]);
});
