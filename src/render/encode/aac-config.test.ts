import { describe, expect, it } from 'vitest';
import { buildAacLcConfig, isValidAacConfig, withValidAacDescription } from './aac-config';

// What Safari 26.6's AudioEncoder returned as the AAC description: a complete ES_Descriptor
// (tag 0x03 ... DecoderConfigDescriptor 0x04 ... DecoderSpecificInfo 0x05 -> 11 90 ...).
const WEBKIT_ES_DESCRIPTOR = Uint8Array.of(
  0x03,
  0x80,
  0x80,
  0x80,
  0x22,
  0x00,
  0x00,
  0x00,
  0x04,
  0x80,
  0x80,
  0x80,
  0x14,
  0x40,
  0x14,
  0x00,
  0x18,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0x05,
  0x80,
  0x80,
  0x80,
  0x02,
  0x11,
  0x90,
  0x06,
  0x80,
  0x80,
  0x80,
  0x01,
  0x02,
);

function metaWith(description: AllowSharedBufferSource | undefined): EncodedAudioChunkMetadata {
  return {
    decoderConfig: { codec: 'mp4a.40.2', sampleRate: 48_000, numberOfChannels: 2, description },
  };
}

describe('buildAacLcConfig', () => {
  it('builds the AudioSpecificConfig of AAC-LC at 48 kHz stereo: 11 90', () => {
    expect([...buildAacLcConfig(48_000, 2)]).toEqual([0x11, 0x90]);
  });

  it('builds 44.1 kHz stereo and 48 kHz mono', () => {
    expect([...buildAacLcConfig(44_100, 2)]).toEqual([0x12, 0x10]);
    expect([...buildAacLcConfig(48_000, 1)]).toEqual([0x11, 0x88]);
  });

  it('refuses a sample rate AAC has no index for', () => {
    expect(() => buildAacLcConfig(47_999, 2)).toThrow(RangeError);
  });
});

describe('isValidAacConfig', () => {
  it('accepts a real AudioSpecificConfig', () => {
    expect(isValidAacConfig(Uint8Array.of(0x11, 0x90))).toBe(true);
    expect(isValidAacConfig(Uint8Array.of(0x12, 0x10).buffer)).toBe(true);
  });

  it('rejects a missing, empty or one-byte description', () => {
    expect(isValidAacConfig(undefined)).toBe(false);
    expect(isValidAacConfig(new Uint8Array(0))).toBe(false);
    expect(isValidAacConfig(Uint8Array.of(0x11))).toBe(false);
  });

  it("rejects WebKit's ES descriptor, which reads as audio object type 0", () => {
    expect(isValidAacConfig(WEBKIT_ES_DESCRIPTOR)).toBe(false);
  });
});

describe('withValidAacDescription', () => {
  it('leaves a valid description alone', () => {
    const meta = metaWith(Uint8Array.of(0x11, 0x90));
    expect(withValidAacDescription(meta)).toBe(meta);
  });

  it("replaces WebKit's ES descriptor with the export's AAC-LC config, keeping the rest", () => {
    const fixed = withValidAacDescription(metaWith(WEBKIT_ES_DESCRIPTOR));
    expect([...new Uint8Array(fixed?.decoderConfig?.description as Uint8Array)]).toEqual([
      0x11, 0x90,
    ]);
    expect(fixed?.decoderConfig).toMatchObject({
      codec: 'mp4a.40.2',
      sampleRate: 48_000,
      numberOfChannels: 2,
    });
  });

  it('supplies a description when the encoder gave none', () => {
    const fixed = withValidAacDescription(metaWith(undefined));
    expect([...new Uint8Array(fixed?.decoderConfig?.description as Uint8Array)]).toEqual([
      0x11, 0x90,
    ]);
  });

  it('passes through chunks that carry no decoder config (every packet after the first)', () => {
    expect(withValidAacDescription(undefined)).toBeUndefined();
    const plain: EncodedAudioChunkMetadata = {};
    expect(withValidAacDescription(plain)).toBe(plain);
  });

  it('does not modify the metadata it was given', () => {
    const meta = metaWith(WEBKIT_ES_DESCRIPTOR);
    withValidAacDescription(meta);
    expect(meta.decoderConfig?.description).toBe(WEBKIT_ES_DESCRIPTOR);
  });
});
