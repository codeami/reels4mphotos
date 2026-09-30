import { AUDIO_BITRATE, FPS, VIDEO_BITRATE } from '../constants';
import { RenderError, throwIfAborted } from '../errors';
import { createRenderCanvas } from '../frames/canvas';
import { FrameGenerator } from '../frames/generator';
import { PhotoStore } from '../frames/photo-store';
import { assertPhotosPresent } from '../frames/validate-plan';
import { within } from './deadline';
import type { EncodeJob, EncodeOutput, ReelEncoder } from './types';

// Safari records MP4; Chromium and Firefox record WebM. First one the browser accepts wins.
const MIME_PREFERENCE = [
  'video/mp4;codecs=avc1.640028,mp4a.40.2',
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

export function pickRecorderMimeType(isTypeSupported: (type: string) => boolean): string | null {
  return MIME_PREFERENCE.find((type) => isTypeSupported(type)) ?? null;
}

// A frame is due every ~33 ms; drawing may take most of that, but not more. Recording starts at
// 'medium' resampling rather than the 'high' the offline paths use: on a machine without GPU
// canvas, 'high' draws so slowly that MediaRecorder's encoder starves and drops nearly every frame.
const DRAW_BUDGET_MS = 25;
const OVERRUNS_BEFORE_LOW_QUALITY = 2;
const STARTING_SMOOTHING: ImageSmoothingQuality = 'medium';

// How long to wait for the audio hardware to start before giving up on recording sound.
const AUDIO_CLOCK_TIMEOUT_MS = 3_000;

// A recorder started before the audio clock runs can end up with no audio track at all, and the
// file would claim sound it does not have. Start only once the clock is moving, or fail so the
// caller can fall back to a silent export that says so.
async function untilAudioClockRuns(
  context: AudioContext,
  signal: AbortSignal | undefined,
): Promise<void> {
  const start = context.currentTime;
  const deadline = performance.now() + AUDIO_CLOCK_TIMEOUT_MS;
  while (context.currentTime - start < 0.05) {
    throwIfAborted(signal);
    if (performance.now() > deadline)
      throw new RenderError('encoder-failed', 'the audio clock never started');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

// The next animation frame, or a short timer if the browser is not delivering any (a hidden tab),
// so the loop still gets to notice a cancel or a hidden tab.
const FRAME_FALLBACK_MS = 250;

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, FRAME_FALLBACK_MS);
    requestAnimationFrame(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

// Fallback b: draws the reel onto a canvas in real time while MediaRecorder captures the canvas
// and an audio graph. This must run on the main thread (MediaRecorder and canvas capture do not
// exist in workers), so it takes as long as the reel itself and needs the tab to stay visible.
// Frame content is still a pure function of the frame index; only the pacing follows the clock.
export function createMediaRecorderEncoder(): ReelEncoder {
  return { path: 'mediarecorder', encode: encodeWithMediaRecorder };
}

async function encodeWithMediaRecorder(job: EncodeJob): Promise<EncodeOutput> {
  const { plan, signal, onProgress } = job;
  assertPhotosPresent(plan, job.photos);
  const pcm = job.audio;
  if (!pcm) throw new RenderError('track-decode-failed', 'no decoded music was supplied');
  throwIfAborted(signal);

  const mimeType = pickRecorderMimeType((t) => MediaRecorder.isTypeSupported(t));
  if (!mimeType)
    throw new RenderError(
      'unsupported',
      'MediaRecorder accepts none of the video formats we can use',
    );

  const ownsContext = !job.audioContext;
  const audioContext = job.audioContext ?? new AudioContext();
  const store = new PhotoStore(job.photos);
  const canvas = createRenderCanvas('element') as HTMLCanvasElement;
  const generator = new FrameGenerator(plan, store, canvas, STARTING_SMOOTHING);
  let stream: MediaStream | null = null;
  let source: AudioBufferSourceNode | null = null;
  let recorder: MediaRecorder | null = null;

  try {
    if (audioContext.state !== 'running') {
      await within(audioContext.resume(), AUDIO_CLOCK_TIMEOUT_MS, 'AudioContext.resume()', signal);
    }
    await untilAudioClockRuns(audioContext, signal);

    const buffer = audioContext.createBuffer(2, pcm.channels[0].length, pcm.sampleRate);
    buffer.copyToChannel(pcm.channels[0], 0);
    buffer.copyToChannel(pcm.channels[1], 1);
    const destination = audioContext.createMediaStreamDestination();
    source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(destination);

    await generator.drawFrame(0);
    stream = canvas.captureStream(FPS);
    for (const track of destination.stream.getAudioTracks()) stream.addTrack(track);

    const chunks: Blob[] = [];
    recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: VIDEO_BITRATE,
      audioBitsPerSecond: AUDIO_BITRATE,
    });
    let recorderFailure: Error | null = null;
    recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    });
    recorder.addEventListener('error', () => {
      recorderFailure = new RenderError('encoder-failed', 'MediaRecorder reported an error');
    });
    const stopped = new Promise<void>((resolve) =>
      recorder?.addEventListener('stop', () => resolve()),
    );

    recorder.start();
    source.start();
    const t0 = performance.now();

    let lastDrawn = 0;
    let overruns = 0;
    for (;;) {
      throwIfAborted(signal);
      if (recorderFailure) throw recorderFailure;
      // A hidden tab stops animation frames and canvas capture: what got recorded would be a
      // frozen reel labelled as a good one, so fail and let the ladder say why.
      if (document.visibilityState === 'hidden') {
        throw new RenderError('encoder-failed', 'the tab was hidden while the reel was recording');
      }
      const elapsed = performance.now() - t0;
      if (elapsed >= plan.totalMs) break;
      const index = Math.min(generator.frameCount - 1, Math.floor((elapsed * FPS) / 1000));
      if (index > lastDrawn) {
        const drawStart = performance.now();
        await generator.drawFrame(index);
        lastDrawn = index;
        // Real time cannot wait for a slow draw. A single overrun is usually a photo decoding, so
        // only a streak of them makes the generator trade resampling quality for speed.
        overruns = performance.now() - drawStart > DRAW_BUDGET_MS ? overruns + 1 : 0;
        if (overruns >= OVERRUNS_BEFORE_LOW_QUALITY) generator.smoothing = 'low';
      }
      onProgress(Math.min(0.99, elapsed / plan.totalMs));
      await nextFrame();
    }
    if (lastDrawn < generator.frameCount - 1) await generator.drawFrame(generator.frameCount - 1);
    await nextFrame();
    if (recorderFailure) throw recorderFailure;
    recorder.stop();
    await stopped;

    if (chunks.length === 0)
      throw new RenderError('encoder-failed', 'MediaRecorder produced no data');
    onProgress(1);
    return {
      blob: new Blob(chunks, { type: recorder.mimeType || mimeType }),
      audio: 'recorder',
      frameCount: null,
    };
  } finally {
    try {
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      source?.stop();
    } catch {
      // already stopped
    }
    stream?.getTracks().forEach((track) => track.stop());
    if (ownsContext) await audioContext.close().catch(() => {});
    generator.dispose();
  }
}
