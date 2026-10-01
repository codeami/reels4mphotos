import { fitAudioToDuration, type PcmAudio } from './audio/pcm';
import { measureBeatAlignment } from './beat-alignment';
import type { EncodeJob, EncodeOutput } from './encode/types';
import {
  RenderError,
  errorMessage,
  isAbortError,
  throwIfAborted,
  type RenderErrorCode,
} from './errors';
import { assertValidPlan, assertPhotosPresent } from './frames/validate-plan';
import {
  selectPaths,
  type Capabilities,
  type MainThreadCapabilities,
  type RenderPathId,
  type SkippedPath,
  type WebCodecsCapabilities,
} from './probe';
import type { FailedAttempt, RenderReport, SilentHint } from './report';
import type { ReelPlan } from '../types/reel-plan';
import type { BeatMap } from './beat-map';
import type { WorkerRenderPath } from './worker/protocol';

export interface RenderOptions {
  // Cancels the render; the returned promise rejects with an AbortError.
  signal?: AbortSignal;
  // The music track's bytes, if the caller already holds them. Skips the same-origin fetch.
  trackBytes?: ArrayBuffer;
  // Run only this path and fail rather than fall back. For tests and diagnostics.
  forcePath?: RenderPathId;
}

export interface RenderResult {
  blob: Blob;
  report: RenderReport;
}

// Everything the orchestrator touches outside itself, so its decisions can be tested without a
// browser: probing, fetching the track, and the two kinds of encoder.
export interface RenderDeps {
  probeWebCodecs(): Promise<WebCodecsCapabilities>;
  probeMainThread(): MainThreadCapabilities;
  loadTrack(trackId: string, signal?: AbortSignal): Promise<ArrayBuffer>;
  decodeTrack(bytes: ArrayBuffer): Promise<PcmAudio>;
  runWorkerPath(
    path: WorkerRenderPath,
    job: { plan: ReelPlan; photos: Map<string, Blob>; beatmap: BeatMap; audio: PcmAudio | null },
    onProgress: (progress: number) => void,
    signal?: AbortSignal,
  ): Promise<EncodeOutput>;
  runRecorderPath(job: EncodeJob): Promise<EncodeOutput>;
}

// Problems with the input, not the encoder: another path would hit the same wall.
const INPUT_ERRORS: ReadonlySet<RenderErrorCode> = new Set([
  'invalid-plan',
  'missing-photo',
  'photo-decode-failed',
]);

const PROBE_SHARE = 0.02;
const NO_SOUND_CODE = 'add-sound-in-instagram';

function silentHintFor(reasons: readonly string[]): SilentHint {
  return { code: NO_SOUND_CODE, reason: reasons.join('; ') || 'no audio path was available' };
}

// Probes, picks the best path, runs it, and reports which path ran and why. A path that fails at
// runtime hands over to the next viable one (the failure is recorded, never hidden); cancelling
// stops everything.
export async function orchestrate(
  plan: ReelPlan,
  photos: Map<string, Blob>,
  beatmap: BeatMap,
  onProgress: (progress: number) => void,
  options: RenderOptions,
  deps: RenderDeps,
  audioContext: AudioContext | null,
): Promise<RenderResult> {
  const startedAt = performance.now();
  assertValidPlan(plan);
  assertPhotosPresent(plan, photos);
  const { signal } = options;
  throwIfAborted(signal);

  let reported = 0;
  const report = (progress: number): void => {
    reported = Math.max(reported, Math.min(1, progress));
    onProgress(reported);
  };
  report(0);

  const capabilities: Capabilities = {
    webcodecs: await deps.probeWebCodecs(),
    main: deps.probeMainThread(),
  };
  throwIfAborted(signal);

  const selection = selectPaths(capabilities);
  const skipped: SkippedPath[] = [...selection.skipped];
  let candidates = selection.candidates;
  if (options.forcePath) {
    const forced = options.forcePath;
    if (!candidates.includes(forced)) {
      const why = skipped.find((s) => s.path === forced)?.reason ?? 'not viable on this device';
      throw new RenderError('unsupported', `forced path "${forced}" cannot run: ${why}`);
    }
    candidates = [forced];
  }
  if (candidates.length === 0) {
    throw new RenderError(
      'unsupported',
      `this browser can export a reel neither with WebCodecs nor MediaRecorder (${skipped.map((s) => s.reason).join('; ')})`,
    );
  }
  report(PROBE_SHARE);

  // The music is fetched and decoded once, here, and every audio path is handed the same samples.
  let audio: PcmAudio | null = null;
  let audioProblem: string | null = null;
  if (candidates.some((path) => path !== 'silent')) {
    try {
      const bytes = options.trackBytes ?? (await deps.loadTrack(plan.trackId, signal));
      audio = fitAudioToDuration(await deps.decodeTrack(bytes), plan.totalMs);
    } catch (error) {
      if (isAbortError(error)) throw error;
      audioProblem = errorMessage(error);
    }
    throwIfAborted(signal);
  }

  const failedAttempts: FailedAttempt[] = [];
  let output: EncodeOutput | null = null;
  let ran: RenderPathId | null = null;
  for (const path of candidates) {
    if (path !== 'silent' && !audio) {
      skipped.push({ path, reason: audioProblem ?? 'no music track available' });
      continue;
    }
    const onPathProgress = (p: number): void => report(PROBE_SHARE + (1 - PROBE_SHARE) * p);
    try {
      output =
        path === 'mediarecorder'
          ? await deps.runRecorderPath({
              plan,
              photos,
              audio,
              signal,
              onProgress: onPathProgress,
              audioContext,
            })
          : await deps.runWorkerPath(
              path,
              { plan, photos, beatmap, audio: path === 'silent' ? null : audio },
              onPathProgress,
              signal,
            );
      ran = path;
      break;
    } catch (error) {
      if (isAbortError(error)) throw error;
      if (error instanceof RenderError && INPUT_ERRORS.has(error.code)) throw error;
      failedAttempts.push({ path, error: errorMessage(error) });
    }
  }
  if (!output || !ran) {
    const detail = [
      ...failedAttempts.map((a) => `${a.path}: ${a.error}`),
      ...skipped.map((s) => `${s.path}: ${s.reason}`),
    ];
    throw new RenderError('encoder-failed', `every export path failed (${detail.join('; ')})`);
  }

  report(1);
  const result: RenderReport = {
    path: ran,
    audio: output.audio,
    hasAudio: output.audio !== 'none',
    mimeType: output.blob.type,
    width: 1080,
    height: 1920,
    fps: 30,
    frameCount: output.frameCount,
    silentHint:
      ran === 'silent'
        ? silentHintFor([
            ...skipped.map((s) => `${s.path}: ${s.reason}`),
            ...failedAttempts.map((a) => `${a.path}: ${a.error}`),
          ])
        : null,
    skipped,
    failedAttempts,
    capabilities,
    beatAlignment: measureBeatAlignment(plan, beatmap),
    elapsedMs: performance.now() - startedAt,
  };
  return { blob: output.blob, report: result };
}
