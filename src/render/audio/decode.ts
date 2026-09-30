import { AUDIO_CHANNELS, AUDIO_SAMPLE_RATE } from '../constants';
import { RenderError, errorMessage } from '../errors';
import { toStereo, type PcmAudio } from './pcm';

type OfflineContextCtor = new (
  channels: number,
  length: number,
  sampleRate: number,
) => OfflineAudioContext;

function offlineContextCtor(): OfflineContextCtor | null {
  const scope = globalThis as {
    OfflineAudioContext?: OfflineContextCtor;
    webkitOfflineAudioContext?: OfflineContextCtor;
  };
  return scope.OfflineAudioContext ?? scope.webkitOfflineAudioContext ?? null;
}

export function canDecodeTrack(): boolean {
  return offlineContextCtor() !== null;
}

// Decodes the bundled track (AAC in M4A) to stereo PCM at the encoder's 48 kHz. Uses the
// platform's decodeAudioData, which every browser that plays the file supports and which
// resamples to the context's rate itself. That keeps the export off WebCodecs' AudioDecoder,
// whose AAC support on iOS nobody has verified. The decode itself runs off the main thread.
export async function decodeTrack(bytes: ArrayBuffer): Promise<PcmAudio> {
  const Ctor = offlineContextCtor();
  if (!Ctor) throw new RenderError('unsupported', 'OfflineAudioContext is unavailable');
  try {
    // decodeAudioData detaches its input, and later paths may need the same bytes.
    const buffer = await new Ctor(
      AUDIO_CHANNELS,
      AUDIO_SAMPLE_RATE,
      AUDIO_SAMPLE_RATE,
    ).decodeAudioData(bytes.slice(0));
    const channels = Array.from(
      { length: Math.min(AUDIO_CHANNELS, buffer.numberOfChannels) },
      (_, c) => buffer.getChannelData(c).slice(),
    );
    return toStereo(channels, buffer.sampleRate);
  } catch (error) {
    throw new RenderError(
      'track-decode-failed',
      `could not decode the music track: ${errorMessage(error)}`,
      {
        cause: error,
      },
    );
  }
}
