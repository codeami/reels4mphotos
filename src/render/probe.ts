import {
  AAC_CODEC,
  AUDIO_BITRATE,
  AUDIO_CHANNELS,
  AUDIO_SAMPLE_RATE,
  FPS,
  FRAME_HEIGHT,
  FRAME_WIDTH,
  OPUS_CODEC,
  VIDEO_BITRATE,
  VIDEO_CODEC,
} from './constants';
import { errorMessage } from './errors';

// Which way the reel gets encoded, best first. The ordering is docs/scout-technical.md section 1:
// H.264 + AAC, then Opus in MP4, then MediaRecorder, then a silent video.
export type RenderPathId = 'webcodecs-aac' | 'webcodecs-opus' | 'mediarecorder' | 'silent';

export const PATH_ORDER: readonly RenderPathId[] = [
  'webcodecs-aac',
  'webcodecs-opus',
  'mediarecorder',
  'silent',
];

// What the render worker's scope can do. Probed inside the worker, because that is where the
// WebCodecs encoders run, not on the main thread.
export interface WebCodecsCapabilities {
  videoH264: boolean;
  audioAac: boolean;
  audioOpus: boolean;
  offscreenCanvas: boolean;
  notes: string[];
}

// What the main thread can do: decode the music track for every audio path, and the pieces the
// MediaRecorder fallback is built from.
export interface MainThreadCapabilities {
  audioDecode: boolean;
  mediaRecorder: boolean;
  canvasCapture: boolean;
  audioContext: boolean;
}

export interface Capabilities {
  webcodecs: WebCodecsCapabilities;
  main: MainThreadCapabilities;
}

interface ConfigSupport {
  isConfigSupported(config: never): Promise<{ supported?: boolean }>;
}

// Just the parts of a global scope the probe reads; lets tests substitute a fake device.
export interface WebCodecsScope {
  VideoEncoder?: ConfigSupport;
  AudioEncoder?: ConfigSupport;
  OffscreenCanvas?: unknown;
}

export const H264_PROBE_CONFIG: VideoEncoderConfig = {
  codec: VIDEO_CODEC,
  width: FRAME_WIDTH,
  height: FRAME_HEIGHT,
  framerate: FPS,
  bitrate: VIDEO_BITRATE,
  avc: { format: 'avc' },
};

export const AAC_PROBE_CONFIG: AudioEncoderConfig = {
  codec: AAC_CODEC,
  sampleRate: AUDIO_SAMPLE_RATE,
  numberOfChannels: AUDIO_CHANNELS,
  bitrate: AUDIO_BITRATE,
  aac: { format: 'aac' },
};

export const OPUS_PROBE_CONFIG: AudioEncoderConfig = {
  codec: OPUS_CODEC,
  sampleRate: AUDIO_SAMPLE_RATE,
  numberOfChannels: AUDIO_CHANNELS,
  bitrate: AUDIO_BITRATE,
};

async function supported(
  api: ConfigSupport | undefined,
  config: object,
  label: string,
  notes: string[],
): Promise<boolean> {
  if (!api) {
    notes.push(`${label}: API missing`);
    return false;
  }
  try {
    const result = await api.isConfigSupported(config as never);
    if (!result.supported) notes.push(`${label}: isConfigSupported -> false`);
    return result.supported === true;
  } catch (error) {
    notes.push(`${label}: isConfigSupported threw (${errorMessage(error)})`);
    return false;
  }
}

// Asks the browser about exactly the configs the export will use, before any encoding starts.
export async function probeWebCodecs(
  scope: WebCodecsScope = globalThis as WebCodecsScope,
): Promise<WebCodecsCapabilities> {
  const notes: string[] = [];
  const [videoH264, audioAac, audioOpus] = await Promise.all([
    supported(scope.VideoEncoder, H264_PROBE_CONFIG, `VideoEncoder ${VIDEO_CODEC}`, notes),
    supported(scope.AudioEncoder, AAC_PROBE_CONFIG, `AudioEncoder ${AAC_CODEC}`, notes),
    supported(scope.AudioEncoder, OPUS_PROBE_CONFIG, `AudioEncoder ${OPUS_CODEC}`, notes),
  ]);
  const offscreenCanvas = typeof scope.OffscreenCanvas === 'function';
  if (!offscreenCanvas) notes.push('OffscreenCanvas: missing');
  return { videoH264, audioAac, audioOpus, offscreenCanvas, notes };
}

export function probeMainThread(
  scope: {
    MediaRecorder?: unknown;
    AudioContext?: unknown;
    OfflineAudioContext?: unknown;
    webkitOfflineAudioContext?: unknown;
    document?: Document;
  } = globalThis as never,
): MainThreadCapabilities {
  const canvas =
    typeof scope.document?.createElement === 'function'
      ? scope.document.createElement('canvas')
      : null;
  return {
    audioDecode:
      typeof (scope.OfflineAudioContext ?? scope.webkitOfflineAudioContext) === 'function',
    mediaRecorder: typeof scope.MediaRecorder === 'function',
    canvasCapture: typeof canvas?.captureStream === 'function',
    audioContext: typeof scope.AudioContext === 'function',
  };
}

export interface SkippedPath {
  path: RenderPathId;
  reason: string;
}

export interface PathSelection {
  // Viable paths, best first. renderReel runs the first and falls to the next only if it fails.
  candidates: RenderPathId[];
  // Why each better path was ruled out before encoding began.
  skipped: SkippedPath[];
}

function webcodecsGap(caps: WebCodecsCapabilities): string | null {
  if (!caps.offscreenCanvas) return 'OffscreenCanvas unavailable in the render worker';
  if (!caps.videoH264)
    return `VideoEncoder does not support ${VIDEO_CODEC} at ${FRAME_WIDTH}x${FRAME_HEIGHT}`;
  return null;
}

// Pure: capabilities in, ordered viable paths out. Never silently drops a path, each skip is named.
export function selectPaths(caps: Capabilities): PathSelection {
  const { webcodecs, main } = caps;
  const gap = webcodecsGap(webcodecs);
  const candidates: RenderPathId[] = [];
  const skipped: SkippedPath[] = [];

  const consider = (path: RenderPathId, problem: string | null): void => {
    if (problem === null) candidates.push(path);
    else skipped.push({ path, reason: problem });
  };

  const decodeGap = main.audioDecode ? null : 'OfflineAudioContext cannot decode the music track';
  consider(
    'webcodecs-aac',
    gap ?? (webcodecs.audioAac ? null : `AudioEncoder does not support ${AAC_CODEC}`) ?? decodeGap,
  );
  consider(
    'webcodecs-opus',
    gap ??
      (webcodecs.audioOpus ? null : `AudioEncoder does not support ${OPUS_CODEC}`) ??
      decodeGap,
  );
  consider(
    'mediarecorder',
    !main.mediaRecorder
      ? 'MediaRecorder unavailable'
      : !main.canvasCapture
        ? 'canvas.captureStream unavailable'
        : !main.audioContext
          ? 'AudioContext unavailable'
          : decodeGap,
  );
  consider('silent', gap);

  return { candidates, skipped };
}
