import { decodeTrack } from './audio/decode';
import { loadTrackBytes } from './audio/track-source';
import { orchestrate, type RenderDeps, type RenderOptions, type RenderResult } from './orchestrate';
import { probeMainThread } from './probe';
import type { RenderReport } from './report';
import type { ReelPlan } from '../types/reel-plan';
import type { BeatMap } from './beat-map';
import { RenderWorkerClient } from './worker/client';

export type { RenderOptions, RenderResult } from './orchestrate';
export type { FailedAttempt, RenderReport, SilentHint } from './report';
export type { BeatMap } from './beat-map';
export type { RenderPathId, Capabilities } from './probe';
export { RenderError, isAbortError } from './errors';
export type { RenderErrorCode } from './errors';
export { loadTrackBytes } from './audio/track-source';

const reports = new WeakMap<Blob, RenderReport>();

// An idle render worker kept between renders. Starting a worker fetches its script, so an app that
// promises "no requests after page load" starts one early with warmUpRenderer().
let idleClient: RenderWorkerClient | null = null;

function acquireClient(): RenderWorkerClient {
  const client = idleClient?.usable ? idleClient : new RenderWorkerClient();
  idleClient = null;
  return client;
}

function releaseClient(client: RenderWorkerClient, reusable: boolean): void {
  if (reusable && client.usable && !idleClient) idleClient = client;
  else client.terminate();
}

// The one music track warmUpRenderer(trackId) fetched ahead of an export.
let warmedTrack: { id: string; bytes: Promise<ArrayBuffer> } | null = null;

function trackBytesFor(trackId: string, signal: AbortSignal | undefined): Promise<ArrayBuffer> {
  if (warmedTrack?.id !== trackId) return loadTrackBytes(trackId, { signal });
  // a preload that failed is not the export's problem: fetch it again now
  return warmedTrack.bytes.catch(() => loadTrackBytes(trackId, { signal }));
}

// Call at page load, and again with the track id when a track is chosen: starts the render worker,
// runs the capability probe, loads the MediaRecorder fallback's code if this browser could need it
// and fetches the track, so renderReel() itself makes no request. Safe to call repeatedly; every
// part is best effort, and what could not be preloaded is simply fetched when the export needs it.
export async function warmUpRenderer(trackId?: string): Promise<void> {
  if (trackId && warmedTrack?.id !== trackId) {
    warmedTrack = { id: trackId, bytes: loadTrackBytes(trackId) };
    warmedTrack.bytes.catch(() => undefined);
  }
  if (!idleClient?.usable) idleClient = new RenderWorkerClient();
  await idleClient.probe();
  if (probeMainThread().mediaRecorder)
    await import('./encode/mediarecorder').catch(() => undefined);
  await warmedTrack?.bytes.catch(() => undefined);
}

// How the reel behind `blob` was made: which path ran, whether it has sound, why not. Lets a
// caller that only holds the Blob from renderReel() still show the "add sound in Instagram" hint.
export function getRenderReport(blob: Blob): RenderReport | undefined {
  return reports.get(blob);
}

// An AudioContext has to be created inside the user's tap for Safari to let it play later, and
// the MediaRecorder fallback needs one. It is closed again whichever path ends up running.
function primeAudioContext(): AudioContext | null {
  const Ctor =
    globalThis.AudioContext ??
    (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    const context = new Ctor();
    void context.resume().catch(() => {});
    return context;
  } catch {
    return null;
  }
}

// plan + photos + beat map -> MP4 (or, on the fallback paths, whatever the browser records).
// Call it from a user gesture. Frames, decoding, encoding and muxing run in a worker; only the
// MediaRecorder fallback has to run on the main thread. 100% on-device: the only request it can
// make is a same-origin fetch of the bundled track, and none if `options.trackBytes` is given.
export async function renderReelWithReport(
  plan: ReelPlan,
  photos: Map<string, Blob>,
  beatmap: BeatMap,
  onProgress: (progress: number) => void,
  options: RenderOptions = {},
): Promise<RenderResult> {
  const audioContext = primeAudioContext();
  const client = acquireClient();
  let reusable = false;
  const deps: RenderDeps = {
    probeWebCodecs: () => client.probe(),
    probeMainThread: () => probeMainThread(),
    loadTrack: trackBytesFor,
    decodeTrack,
    runWorkerPath: (path, job, progress, signal) =>
      client.render({ path, ...job }, progress, signal),
    runRecorderPath: async (job) => {
      const { createMediaRecorderEncoder } = await import('./encode/mediarecorder');
      return createMediaRecorderEncoder().encode(job);
    },
  };
  try {
    const result = await orchestrate(
      plan,
      photos,
      beatmap,
      onProgress,
      options,
      deps,
      audioContext,
    );
    reports.set(result.blob, result.report);
    // A clean render leaves the worker in a known state; after any failed attempt it may not.
    reusable = result.report.failedAttempts.length === 0;
    return result;
  } finally {
    // After a failure or a cancel the worker's state is unknown, so only a clean render is reused.
    releaseClient(client, reusable);
    await audioContext?.close().catch(() => {});
  }
}

// The Blob renderReel() returns, marked when no sound made it into the file, so a caller that
// only holds the Blob can show the "add sound in Instagram" hint.
export type RenderedBlob = Blob & { silent: boolean };

// The shared seam: renderReel(plan, photos, beatmap, onProgress) -> Blob. `options` is an optional
// extra (cancel signal, test hooks). The full report for the Blob is getRenderReport(blob).
export async function renderReel(
  plan: ReelPlan,
  photos: Map<string, Blob>,
  beatmap: BeatMap,
  onProgress: (progress: number) => void,
  options: RenderOptions = {},
): Promise<RenderedBlob> {
  const { blob, report } = await renderReelWithReport(plan, photos, beatmap, onProgress, options);
  return Object.assign(blob, { silent: !report.hasAudio });
}
