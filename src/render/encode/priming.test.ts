import { describe, expect, it } from 'vitest';
import { aacPrimingSamples, primingShiftSeconds } from './priming';

describe('aacPrimingSamples', () => {
  it('compensates where the platform encoder is known: Apple', () => {
    expect(
      aacPrimingSamples(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1',
      ),
    ).toBe(2112);
    expect(
      aacPrimingSamples(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/153.0 Safari/537.36',
      ),
    ).toBe(2112);
  });

  it('leaves other platforms as the encoder wrote the file', () => {
    expect(
      aacPrimingSamples(
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/153.0 Safari/537.36',
      ),
    ).toBe(0);
    expect(aacPrimingSamples('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/153.0')).toBe(0);
    expect(aacPrimingSamples('')).toBe(0);
  });
});

describe('primingShiftSeconds', () => {
  it('turns 2112 samples at 48 kHz into 44 ms', () => {
    expect(primingShiftSeconds(2112, 48_000)).toBeCloseTo(0.044, 6);
  });
});
