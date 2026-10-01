import { AUDIO_CHANNELS, AUDIO_SAMPLE_RATE } from '../constants';

// ISO/IEC 14496-3 sampling frequency table, indexed by samplingFrequencyIndex.
const SAMPLE_RATES = [
  96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350,
];
const AAC_LC = 2;

function toBytes(data: AllowSharedBufferSource): Uint8Array {
  return ArrayBuffer.isView(data)
    ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    : new Uint8Array(data);
}

// The two-byte AudioSpecificConfig of AAC-LC: 5 bits object type, 4 bits sample rate index,
// 4 bits channel configuration, 3 bits zero.
export function buildAacLcConfig(sampleRate: number, channels: number): Uint8Array {
  const index = SAMPLE_RATES.indexOf(sampleRate);
  if (index < 0) throw new RangeError(`no AAC sampling frequency index for ${sampleRate} Hz`);
  const bits = (AAC_LC << 11) | (index << 7) | (channels << 3);
  return Uint8Array.of(bits >> 8, bits & 0xff);
}

export function isValidAacConfig(description: AllowSharedBufferSource | undefined): boolean {
  if (!description) return false;
  const bytes = toBytes(description);
  if (bytes.length < 2) return false;
  const bits = ((bytes[0] ?? 0) << 8) | (bytes[1] ?? 0);
  const objectType = bits >> 11;
  const rateIndex = (bits >> 7) & 0xf;
  const channelConfig = (bits >> 3) & 0xf;
  return (
    objectType >= 1 &&
    objectType <= 5 &&
    rateIndex < SAMPLE_RATES.length &&
    channelConfig >= 1 &&
    channelConfig <= 7
  );
}

// WebKit's AudioEncoder returns, as the AAC `description`, a whole MPEG-4 ES descriptor (CoreAudio's
// magic cookie) rather than the bare AudioSpecificConfig WebCodecs specifies
// (https://bugs.webkit.org/show_bug.cgi?id=302253). Written into an MP4 as it is, that nests an
// esds inside the esds and strict players cannot open the audio. Anything that does not parse as
// an AudioSpecificConfig is replaced with the AAC-LC config this export is configured for.
export function withValidAacDescription(
  meta: EncodedAudioChunkMetadata | undefined,
  sampleRate: number = AUDIO_SAMPLE_RATE,
  channels: number = AUDIO_CHANNELS,
): EncodedAudioChunkMetadata | undefined {
  const config = meta?.decoderConfig;
  if (!meta || !config || isValidAacConfig(config.description)) return meta;
  return {
    ...meta,
    decoderConfig: { ...config, description: buildAacLcConfig(sampleRate, channels) },
  };
}
