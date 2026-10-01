import { AUDIO_SAMPLE_RATE } from '../constants';

// The AAC encoder on Apple platforms (iOS, macOS Safari and Chrome alike: AudioToolbox) emits 2112
// samples of priming before the first real sample. An MP4 needs an edit list to say "skip these";
// without one the sound plays about 44 ms late against the picture, nearly a frame and a half. The
// delay is a property of the platform's encoder and WebCodecs does not report it, so it is applied
// only where it has been measured. Elsewhere the file is left as the encoder wrote it.
export const APPLE_AAC_PRIMING_SAMPLES = 2112;

export function aacPrimingSamples(
  userAgent: string = globalThis.navigator?.userAgent ?? '',
): number {
  return /Macintosh|Mac OS X|iPhone|iPad|iPod/.test(userAgent) ? APPLE_AAC_PRIMING_SAMPLES : 0;
}

// Seconds to move every AAC packet earlier by. Timestamps before 0 become the MP4's edit list.
export function primingShiftSeconds(
  samples: number,
  sampleRate: number = AUDIO_SAMPLE_RATE,
): number {
  return samples / sampleRate;
}
