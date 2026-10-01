import { AUDIO_FADE_IN_MS, AUDIO_FADE_OUT_MS } from '../constants';

export type Samples = Float32Array<ArrayBuffer>;

export interface PcmAudio {
  readonly sampleRate: number;
  // Always stereo; a mono source has the same samples in both channels.
  readonly channels: readonly [Samples, Samples];
}

// Stereo out of whatever the decoder produced: a mono source is doubled, extra channels dropped.
export function toStereo(channels: readonly Samples[], sampleRate: number): PcmAudio {
  const left = channels[0];
  if (!left) throw new RangeError('audio has no channels');
  return { sampleRate, channels: [left, channels[1] ?? left] };
}

// Trims or zero-pads to exactly the reel's length, with a short fade-in (no click at the first
// sample) and a fade-out so the music does not stop dead at the last frame.
export function fitAudioToDuration(audio: PcmAudio, totalMs: number): PcmAudio {
  const length = Math.round((totalMs / 1000) * audio.sampleRate);
  const fadeIn = Math.min(length, Math.round((AUDIO_FADE_IN_MS / 1000) * audio.sampleRate));
  const fadeOut = Math.min(length, Math.round((AUDIO_FADE_OUT_MS / 1000) * audio.sampleRate));

  const fit = (source: Samples): Samples => {
    const out = new Float32Array(length);
    out.set(source.subarray(0, Math.min(length, source.length)));
    for (let i = 0; i < fadeIn; i++) out[i] = (out[i] ?? 0) * (i / fadeIn);
    for (let i = 0; i < fadeOut; i++)
      out[length - 1 - i] = (out[length - 1 - i] ?? 0) * (i / fadeOut);
    return out;
  };

  const [sourceLeft, sourceRight] = audio.channels;
  const left = fit(sourceLeft);
  const right = sourceRight === sourceLeft ? left : fit(sourceRight);
  return { sampleRate: audio.sampleRate, channels: [left, right] };
}

// Independent copies of the sample buffers, so a path can transfer them away and a later path
// still has audio to use.
export function clonePcm(audio: PcmAudio): PcmAudio {
  const [left, right] = audio.channels;
  const leftCopy = left.slice();
  return {
    sampleRate: audio.sampleRate,
    channels: [leftCopy, right === left ? leftCopy : right.slice()],
  };
}
