import { createRenderCanvas } from '../frames/canvas';
import { FrameGenerator } from '../frames/generator';
import { PhotoStore } from '../frames/photo-store';
import { AudioSampleSink, BlobSource, Input, MP4, VideoSampleSink } from 'mediabunny';
import { decodeTrack } from '../audio/decode';
import { estimateLagMs } from '../audio/lag';
import type { BeatMap } from '../beat-map';
import { renderReelWithReport, loadTrackBytes, warmUpRenderer } from '../index';
import { RenderWorkerClient } from '../worker/client';
import {
  probeMainThread,
  selectPaths,
  type Capabilities,
  type PathSelection,
  type RenderPathId,
} from '../probe';
import type { RenderReport } from '../report';
import type { ReelPlan } from '../../types/reel-plan';
import { GATE_TRACK_ID, buildHarnessReel, harnessPhotoSize } from './harness-reel';

export interface HarnessRun {
  report: RenderReport;
  mimeType: string;
  base64: string;
  byteLength: number;
  progress: number[];
  wallMs: number;
}

export interface HarnessRunOptions {
  // Bundled track to cut to (public/music/<id>). Default: the gate track.
  trackId?: string;
  // Keep only the first N shots of the 10-shot, ~20 s plan curation builds. Default: all ten.
  shotCount?: number;
  forcePath?: RenderPathId;
}

export interface EncodedFrameCheck {
  index: number;
  // Mean [r, g, b] of a thumbnail of the frame decoded from the file, and of the frame drawn
  // directly for the same index.
  decoded: number[];
  expected: number[];
  maxDiff: number;
}

export interface AudioLagResult {
  // Positive: the exported sound is later than the source track on the file's timeline.
  lagMs: number;
  firstTimestampSec: number;
  userAgent: string;
}

export interface HarnessFailure {
  name: string;
  code: string | null;
  message: string;
}

export interface HarnessCancel {
  outcome: string;
  settleMs: number;
  progressAfterAbort: number;
}

// A crop of the whole photo: not 9:16 for any of the harness photos.
const fullPhoto = { x: 0, y: 0, w: 1, h: 1 };

async function makePhoto(index: number): Promise<Blob> {
  const { width, height } = harnessPhotoSize(index);
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  const hue = (index * 36) % 360;

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, `hsl(${hue} 70% 35%)`);
  gradient.addColorStop(1, `hsl(${(hue + 60) % 360} 80% 65%)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 6;
  for (let x = -height; x < width; x += 90) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + height, height);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  for (let n = 0; n < 12; n++) {
    ctx.beginPath();
    ctx.arc(((n * 137) % width) + 40, ((n * 251) % height) + 40, 30 + (n % 4) * 14, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#fff';
  ctx.font = `bold ${Math.round(height * 0.4)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(index + 1), width / 2, height / 2);
  return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
}

async function makePhotos(plan: ReelPlan): Promise<Map<string, Blob>> {
  const entries = await Promise.all(
    plan.shots.map(async (shot, k) => [shot.photoId, await makePhoto(k)] as const),
  );
  return new Map(entries);
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    // A recorder's MIME type can itself contain commas (codecs=avc1,mp4a), so cut at the marker.
    reader.onload = () => resolve(String(reader.result).split(';base64,')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

const THUMB_W = 54;
const THUMB_H = 96;

function meanRgb(ctx: OffscreenCanvasRenderingContext2D): number[] {
  const { data } = ctx.getImageData(0, 0, THUMB_W, THUMB_H);
  const sums = [0, 0, 0];
  for (let i = 0; i < data.length; i += 4) {
    sums[0] = (sums[0] ?? 0) + (data[i] ?? 0);
    sums[1] = (sums[1] ?? 0) + (data[i + 1] ?? 0);
    sums[2] = (sums[2] ?? 0) + (data[i + 2] ?? 0);
  }
  return sums.map((sum) => sum / (THUMB_W * THUMB_H));
}

async function sha256(bytes: Uint8ClampedArray): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const harness = {
  // The plan (and beat map) a run with these options would render.
  async reel(trackId?: string, shotCount?: number): Promise<{ plan: ReelPlan; beatmap: BeatMap }> {
    return buildHarnessReel(trackId, shotCount);
  },

  // Decodes a bundled track the way the export does, and reports what came out.
  async decodeBundled(
    trackId: string,
  ): Promise<{ sampleRate: number; seconds: number; rms: number }> {
    const audio = await decodeTrack(await loadTrackBytes(trackId));
    const left = audio.channels[0];
    let sum = 0;
    for (const v of left) sum += v * v;
    return {
      sampleRate: audio.sampleRate,
      seconds: left.length / audio.sampleRate,
      rms: Math.sqrt(sum / left.length),
    };
  },

  // What a render would see: WebCodecs asked inside the render worker, the rest on this thread.
  async probe(): Promise<{ capabilities: Capabilities; selection: PathSelection }> {
    const client = new RenderWorkerClient();
    try {
      const capabilities: Capabilities = {
        webcodecs: await client.probe(),
        main: probeMainThread(),
      };
      return { capabilities, selection: selectPaths(capabilities) };
    } finally {
      client.terminate();
    }
  },

  // Warms the worker and loads the track, as an app that promises "no requests after load" would.
  async prepare(): Promise<void> {
    await buildHarnessReel(GATE_TRACK_ID); // loads the beat map, as the app does when a track is picked
    await warmUpRenderer(GATE_TRACK_ID);
  },

  async run(options: HarnessRunOptions = {}): Promise<HarnessRun> {
    const { plan, beatmap } = await buildHarnessReel(options.trackId, options.shotCount);
    const photos = await makePhotos(plan);
    const progress: number[] = [];
    const started = performance.now();
    const { blob, report } = await renderReelWithReport(
      plan,
      photos,
      beatmap,
      (p) => progress.push(p),
      {
        forcePath: options.forcePath,
      },
    );
    const wallMs = performance.now() - started;
    return {
      report,
      mimeType: blob.type,
      base64: await toBase64(blob),
      byteLength: blob.size,
      progress,
      wallMs,
    };
  },

  // Hashes the RGBA of the given frames from two independent generators.
  // Two independent generators' pixel hashes for the frames, on the canvas kind asked for: the
  // export draws on an OffscreenCanvas in a worker, the recorder path on a <canvas> element.
  async frameHashes(
    indices: number[],
    kind: 'offscreen' | 'element',
  ): Promise<{ first: string[]; second: string[] }> {
    const { plan } = await buildHarnessReel();
    const photos = await makePhotos(plan);
    const hashWith = async (): Promise<string[]> => {
      const generator = new FrameGenerator(plan, new PhotoStore(photos), createRenderCanvas(kind));
      try {
        const hashes: string[] = [];
        for (const index of indices) hashes.push(await sha256(await generator.renderRgba(index)));
        return hashes;
      } finally {
        generator.dispose();
      }
    };
    return { first: await hashWith(), second: await hashWith() };
  },

  // Renders a short reel, decodes frames back out of the MP4 and compares each with the frame the
  // generator draws for the same index (mean colour of a 54x96 thumbnail: robust to compression,
  // yet a shifted timestamp or a swapped frame changes it). Proves the file holds the planned
  // frames in the planned order, which the file's metadata alone cannot.
  async encodedFrames(indices: number[]): Promise<EncodedFrameCheck[]> {
    const { plan, beatmap } = await buildHarnessReel(GATE_TRACK_ID, 4);
    const photos = await makePhotos(plan);
    const { blob } = await renderReelWithReport(plan, photos, beatmap, () => {}, {
      forcePath: 'silent',
    });

    const input = new Input({ source: new BlobSource(blob), formats: [MP4] });
    const generator = new FrameGenerator(
      plan,
      new PhotoStore(photos),
      createRenderCanvas('offscreen'),
    );
    try {
      const track = await input.getPrimaryVideoTrack();
      if (!track) throw new Error('the export has no video track');
      const sink = new VideoSampleSink(track);
      const thumbnail = (): OffscreenCanvasRenderingContext2D => {
        const ctx = new OffscreenCanvas(THUMB_W, THUMB_H).getContext('2d', {
          willReadFrequently: true,
        });
        if (!ctx) throw new Error('2d context unavailable');
        return ctx;
      };
      const decodedCtx = thumbnail();
      const expectedCtx = thumbnail();

      const checks: EncodedFrameCheck[] = [];
      for (const index of indices) {
        const sample = await sink.getSample((index + 0.5) / plan.fps);
        if (!sample) throw new Error(`no frame at index ${index}`);
        decodedCtx.clearRect(0, 0, THUMB_W, THUMB_H);
        sample.draw(decodedCtx, 0, 0, THUMB_W, THUMB_H);
        sample.close();
        await generator.drawFrame(index);
        expectedCtx.clearRect(0, 0, THUMB_W, THUMB_H);
        expectedCtx.drawImage(generator.canvas, 0, 0, THUMB_W, THUMB_H);
        const decoded = meanRgb(decodedCtx);
        const expected = meanRgb(expectedCtx);
        const maxDiff = Math.max(...decoded.map((v, c) => Math.abs(v - (expected[c] ?? 0))));
        checks.push({ index, decoded, expected, maxDiff });
      }
      return checks;
    } finally {
      generator.dispose();
      input.dispose();
    }
  },

  // How late the exported audio is against the source track, measured in JS: the export's own
  // audio is decoded back out of the MP4 (placed on the file's timeline, so an edit list that
  // hides encoder priming counts) and cross-correlated with the source. null if this browser
  // cannot decode the file's audio.
  async audioLag(path: RenderPathId): Promise<AudioLagResult | null> {
    const { plan, beatmap } = await buildHarnessReel(GATE_TRACK_ID, 4);
    const photos = await makePhotos(plan);
    const { blob } = await renderReelWithReport(plan, photos, beatmap, () => {}, {
      forcePath: path,
    });

    const input = new Input({ source: new BlobSource(blob), formats: [MP4] });
    try {
      const track = await input.getPrimaryAudioTrack();
      if (!track || !(await track.canDecode())) return null;
      const rate = await track.getSampleRate();
      const seconds = 3;
      const timeline = new Float32Array(rate * seconds);
      for await (const sample of new AudioSampleSink(track).samples(0, seconds)) {
        const plane = new Float32Array(sample.numberOfFrames);
        sample.copyTo(plane, { planeIndex: 0, format: 'f32-planar' });
        const start = Math.round(sample.timestamp * rate);
        for (let i = 0; i < plane.length; i++) {
          const at = start + i;
          if (at >= 0 && at < timeline.length) timeline[at] = plane[i] ?? 0;
        }
        sample.close();
      }
      const source = await decodeTrack(await loadTrackBytes(GATE_TRACK_ID));
      const reference = source.channels[0].subarray(0, timeline.length);
      return {
        lagMs: estimateLagMs(reference, timeline, rate),
        firstTimestampSec: await track.getFirstTimestamp(),
        userAgent: navigator.userAgent,
      };
    } finally {
      input.dispose();
    }
  },

  // A render that has to be refused, with the error the caller would see.
  async runBad(kind: 'wrong-crop' | 'missing-photo'): Promise<HarnessFailure> {
    const { plan, beatmap } = await buildHarnessReel(GATE_TRACK_ID, 4);
    const photos = await makePhotos(plan);
    if (kind === 'missing-photo') photos.delete('photo-2');
    const shots = plan.shots.map((shot, k) =>
      kind === 'wrong-crop' && k === 1
        ? { ...shot, kenBurns: { from: fullPhoto, to: fullPhoto } }
        : shot,
    );
    try {
      await renderReelWithReport({ ...plan, shots }, photos, beatmap, () => {}, {
        forcePath: 'silent',
      });
      return { name: 'none', code: null, message: 'the render was not refused' };
    } catch (error) {
      const failure = error as { name?: string; code?: string; message?: string };
      return {
        name: failure.name ?? 'Error',
        code: failure.code ?? null,
        message: failure.message ?? '',
      };
    }
  },

  async cancel(): Promise<HarnessCancel> {
    const { plan, beatmap } = await buildHarnessReel();
    const photos = await makePhotos(plan);
    const controller = new AbortController();
    let abortedAt = 0;
    let progressAfterAbort = 0;
    let outcome = 'completed';
    try {
      await renderReelWithReport(
        plan,
        photos,
        beatmap,
        (p) => {
          if (abortedAt) progressAfterAbort++;
          else if (p > 0.15) {
            abortedAt = performance.now();
            controller.abort();
          }
        },
        { signal: controller.signal },
      );
    } catch (error) {
      outcome = error instanceof Error ? error.name : String(error);
    }
    const settleMs = abortedAt ? performance.now() - abortedAt : -1;
    await new Promise((resolve) => setTimeout(resolve, 750));
    return { outcome, settleMs, progressAfterAbort };
  },
};

declare global {
  interface Window {
    r4p: typeof harness;
  }
}
window.r4p = harness;
