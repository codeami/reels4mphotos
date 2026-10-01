import {
  BufferTarget,
  EncodedAudioPacketSource,
  EncodedPacket,
  EncodedVideoPacketSource,
  Mp4OutputFormat,
  Output,
} from 'mediabunny';
import {
  AUDIO_CHUNK_FRAMES,
  ENCODER_QUEUE_LIMIT,
  FPS,
  KEYFRAME_INTERVAL_FRAMES,
} from '../constants';
import { RenderError, errorMessage, isAbortError, throwIfAborted } from '../errors';
import { createRenderCanvas } from '../frames/canvas';
import { FrameGenerator } from '../frames/generator';
import { PhotoStore } from '../frames/photo-store';
import { assertPhotosPresent } from '../frames/validate-plan';
import {
  AAC_PROBE_CONFIG,
  H264_PROBE_CONFIG,
  OPUS_PROBE_CONFIG,
  type RenderPathId,
} from '../probe';
import { withValidAacDescription } from './aac-config';
import { aacPrimingSamples, primingShiftSeconds } from './priming';
import type { AudioOutcome, EncodeJob, EncodeOutput, ReelEncoder } from './types';

type WebCodecsPath = Extract<RenderPathId, 'webcodecs-aac' | 'webcodecs-opus' | 'silent'>;

const MICROSECONDS = 1_000_000;
// Audio is fed a little ahead of the video so the MP4 muxer interleaves the two tracks evenly.
const AUDIO_LEAD_SECONDS = 0.5;
// Progress: setup, then frames, then the muxer's final write.
const SETUP_SHARE = 0.03;
const FRAMES_SHARE = 0.94;

const AUDIO_FOR_PATH: Record<
  WebCodecsPath,
  { codec: 'aac' | 'opus'; config: AudioEncoderConfig } | null
> = {
  'webcodecs-aac': { codec: 'aac', config: AAC_PROBE_CONFIG },
  'webcodecs-opus': { codec: 'opus', config: OPUS_PROBE_CONFIG },
  silent: null,
};

// WebCodecs H.264 (+ AAC or Opus) muxed to MP4 by mediabunny. Runs inside the render worker:
// frames, decode, encode and mux all stay off the main thread. The encoders are configured with
// exactly the configs the probe accepted.
export function createWebCodecsEncoder(path: WebCodecsPath): ReelEncoder {
  return { path, encode: (job) => encodeWithWebCodecs(path, job) };
}

async function encodeWithWebCodecs(path: WebCodecsPath, job: EncodeJob): Promise<EncodeOutput> {
  const { plan, signal, onProgress } = job;
  assertPhotosPresent(plan, job.photos);
  throwIfAborted(signal);

  const audioSpec = AUDIO_FOR_PATH[path];
  const pcm = audioSpec ? job.audio : null;
  if (audioSpec && !pcm)
    throw new RenderError('track-decode-failed', 'no decoded music was supplied');
  onProgress(SETUP_SHARE);

  const store = new PhotoStore(job.photos);
  const generator = new FrameGenerator(plan, store, createRenderCanvas('offscreen'));
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
    target: new BufferTarget(),
  });
  const videoSource = new EncodedVideoPacketSource('avc');
  output.addVideoTrack(videoSource, { frameRate: FPS });
  const audioSource = audioSpec ? new EncodedAudioPacketSource(audioSpec.codec) : null;
  if (audioSource) output.addAudioTrack(audioSource);

  let failure: unknown = null;
  let rejectFailure: (error: unknown) => void = () => {};
  const failed = new Promise<never>((_, reject) => {
    rejectFailure = reject;
  });
  failed.catch(() => {});
  const fail = (error: unknown): void => {
    failure ??= error;
    rejectFailure(error);
  };

  // Packets reach the muxer strictly in order; awaiting each add() honours its backpressure.
  let muxQueue: Promise<void> = Promise.resolve();
  const toMuxer = (write: () => Promise<void>): void => {
    muxQueue = muxQueue.then(write);
    muxQueue.catch(fail);
  };

  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) =>
      toMuxer(() => videoSource.add(EncodedPacket.fromEncodedChunk(chunk), meta)),
    error: fail,
  });
  const primingShift = audioSpec?.codec === 'aac' ? primingShiftSeconds(aacPrimingSamples()) : 0;
  const audioEncoder =
    audioSource && audioSpec
      ? new AudioEncoder({
          output: (chunk, meta) =>
            toMuxer(() =>
              audioSource.add(
                // The priming shift makes the first timestamps negative; the muxer turns that into
                // the edit list that hides the encoder's priming.
                EncodedPacket.fromEncodedChunk(chunk).clone({
                  timestamp: chunk.timestamp / MICROSECONDS - primingShift,
                }),
                audioSpec.codec === 'aac' ? withValidAacDescription(meta) : meta,
              ),
            ),
          error: fail,
        })
      : null;

  const untilDequeued = (encoder: VideoEncoder | AudioEncoder): Promise<unknown> =>
    Promise.race([
      new Promise<void>((resolve) =>
        encoder.addEventListener('dequeue', () => resolve(), { once: true }),
      ),
      failed,
    ]);

  try {
    videoEncoder.configure(H264_PROBE_CONFIG);
    if (audioEncoder && audioSpec) audioEncoder.configure(audioSpec.config);
    await output.start();

    let audioFed = 0;
    const feedAudio = async (untilFrame: number): Promise<void> => {
      if (!pcm || !audioEncoder) return;
      const total = pcm.channels[0].length;
      while (audioFed < Math.min(total, untilFrame)) {
        const frames = Math.min(AUDIO_CHUNK_FRAMES, total - audioFed);
        const planar = new Float32Array(frames * 2);
        planar.set(pcm.channels[0].subarray(audioFed, audioFed + frames), 0);
        planar.set(pcm.channels[1].subarray(audioFed, audioFed + frames), frames);
        const data = new AudioData({
          format: 'f32-planar',
          sampleRate: pcm.sampleRate,
          numberOfFrames: frames,
          numberOfChannels: 2,
          timestamp: Math.round((audioFed / pcm.sampleRate) * MICROSECONDS),
          data: planar,
        });
        try {
          audioEncoder.encode(data);
        } finally {
          data.close();
        }
        audioFed += frames;
        while (audioEncoder.encodeQueueSize > ENCODER_QUEUE_LIMIT)
          await untilDequeued(audioEncoder);
      }
    };

    const frameDuration = Math.round(MICROSECONDS / FPS);
    for (let i = 0; i < generator.frameCount; i++) {
      throwIfAborted(signal);
      if (failure) throw failure;
      await generator.drawFrame(i);
      const frame = new VideoFrame(generator.canvas, {
        timestamp: Math.round((i * MICROSECONDS) / FPS),
        duration: frameDuration,
      });
      try {
        videoEncoder.encode(frame, { keyFrame: i % KEYFRAME_INTERVAL_FRAMES === 0 });
      } finally {
        frame.close();
      }
      while (videoEncoder.encodeQueueSize > ENCODER_QUEUE_LIMIT) await untilDequeued(videoEncoder);
      if (pcm) await feedAudio(Math.round(((i + 1) / FPS + AUDIO_LEAD_SECONDS) * pcm.sampleRate));
      onProgress(SETUP_SHARE + FRAMES_SHARE * ((i + 1) / generator.frameCount));
    }
    if (pcm) await feedAudio(pcm.channels[0].length);

    await Promise.race([Promise.all([videoEncoder.flush(), audioEncoder?.flush()]), failed]);
    await Promise.race([muxQueue, failed]);
    videoSource.close();
    audioSource?.close();
    await output.finalize();

    const buffer = (output.target as BufferTarget).buffer;
    if (!buffer) throw new RenderError('encoder-failed', 'the MP4 muxer produced no data');
    onProgress(1);
    const audio: AudioOutcome = audioSpec ? audioSpec.codec : 'none';
    return {
      blob: new Blob([buffer], { type: 'video/mp4' }),
      audio,
      frameCount: generator.frameCount,
    };
  } catch (error) {
    await output.cancel().catch(() => {});
    if (isAbortError(error)) throw error;
    // An encoder that failed asynchronously closes itself, so the call that notices is usually an
    // InvalidStateError on a closed codec. The encoder's own error is the one worth reporting.
    const cause = failure ?? error;
    if (cause instanceof RenderError) throw cause;
    throw new RenderError('encoder-failed', `${path}: ${errorMessage(cause)}`, { cause });
  } finally {
    for (const encoder of [videoEncoder, audioEncoder]) {
      if (encoder && encoder.state !== 'closed') encoder.close();
    }
    generator.dispose();
  }
}
