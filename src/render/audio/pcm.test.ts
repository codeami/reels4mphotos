import { describe, expect, it } from 'vitest';
import { clonePcm, fitAudioToDuration, toStereo, type Samples } from './pcm';

const ones = (n: number): Samples => new Float32Array(n).fill(1);

describe('toStereo', () => {
  it('duplicates a mono source into both channels', () => {
    const mono = ones(480);
    const pcm = toStereo([mono], 48_000);
    expect(pcm.channels[0]).toBe(mono);
    expect(pcm.channels[1]).toBe(mono);
  });

  it('keeps only the first two channels of a surround source', () => {
    const channels = [0, 1, 2, 3, 4, 5].map((c) => new Float32Array(480).fill(c));
    const pcm = toStereo(channels, 48_000);
    expect(pcm.channels[0][0]).toBe(0);
    expect(pcm.channels[1][0]).toBe(1);
  });

  it('refuses audio with no channels', () => {
    expect(() => toStereo([], 48_000)).toThrow(RangeError);
  });
});

describe('fitAudioToDuration', () => {
  it('makes exactly the reel length, trimming a longer track', () => {
    const fitted = fitAudioToDuration(
      { sampleRate: 48_000, channels: [ones(48_000 * 40), ones(48_000 * 40)] },
      20_000,
    );
    expect(fitted.channels[0].length).toBe(48_000 * 20);
    expect(fitted.channels[1].length).toBe(48_000 * 20);
  });

  it('zero-pads a shorter track', () => {
    const fitted = fitAudioToDuration(
      { sampleRate: 48_000, channels: [ones(48_000 * 10), ones(48_000 * 10)] },
      20_000,
    );
    expect(fitted.channels[0].length).toBe(48_000 * 20);
    expect(fitted.channels[0][48_000 * 15]).toBe(0);
  });

  it('fades in from silence and out to silence, leaving the middle alone', () => {
    const fitted = fitAudioToDuration(
      { sampleRate: 48_000, channels: [ones(48_000 * 30), ones(48_000 * 30)] },
      20_000,
    );
    const left = fitted.channels[0];
    expect(left[0]).toBe(0);
    expect(left[left.length - 1]).toBe(0);
    expect(left[48_000 * 10]).toBe(1);
    expect(left[left.length - 1 - 24_000]).toBeGreaterThan(0.4);
    expect(left[left.length - 1 - 24_000]).toBeLessThan(0.9);
  });

  it('does not mutate the source', () => {
    const source = ones(48_000);
    fitAudioToDuration({ sampleRate: 48_000, channels: [source, source] }, 1000);
    expect(source[0]).toBe(1);
  });
});

describe('clonePcm', () => {
  it('copies the samples so transferring one copy leaves the other usable', () => {
    const original = { sampleRate: 48_000, channels: [ones(8), ones(8)] as const };
    const copy = clonePcm(original);
    expect(copy.channels[0]).not.toBe(original.channels[0]);
    expect(copy.channels[0]).toEqual(original.channels[0]);
    structuredClone(copy, { transfer: [copy.channels[0].buffer, copy.channels[1].buffer] });
    expect(original.channels[0].length).toBe(8);
  });

  it('keeps a mono source mono so it is transferred once', () => {
    const mono = ones(8);
    const copy = clonePcm({ sampleRate: 48_000, channels: [mono, mono] });
    expect(copy.channels[0]).toBe(copy.channels[1]);
  });
});
