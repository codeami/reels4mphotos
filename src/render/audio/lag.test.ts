import { describe, expect, it } from 'vitest';
import { estimateLagMs } from './lag';

// Deterministic noise, so the tests do not depend on Math.random.
function noise(length: number, seed = 1): Float32Array {
  const out = new Float32Array(length);
  let state = seed;
  for (let i = 0; i < length; i++) {
    state = (state * 1664525 + 1013904223) >>> 0;
    out[i] = state / 2 ** 31 - 1;
  }
  return out;
}

function delayed(signal: Float32Array, samples: number): Float32Array {
  const out = new Float32Array(signal.length);
  for (let i = 0; i < out.length; i++) out[i] = signal[i - samples] ?? 0;
  return out;
}

describe('estimateLagMs', () => {
  const rate = 48_000;
  const reference = noise(rate * 2);

  it('reads zero for identical signals', () => {
    expect(estimateLagMs(reference, reference, rate)).toBe(0);
  });

  it('finds a late signal: 2112 samples (the AAC priming) is 44 ms', () => {
    expect(estimateLagMs(reference, delayed(reference, 2112), rate)).toBeCloseTo(44, 0);
  });

  it('finds an early signal as a negative lag', () => {
    expect(estimateLagMs(reference, delayed(reference, -960), rate)).toBeCloseTo(-20, 0);
  });

  it('survives added noise', () => {
    const late = delayed(reference, 1440);
    const hiss = noise(late.length, 7);
    const noisy = late.map((v, i) => v + 0.3 * (hiss[i] ?? 0));
    expect(estimateLagMs(reference, noisy, rate)).toBeCloseTo(30, 0);
  });

  it('only looks within the lag window', () => {
    const far = estimateLagMs(reference, delayed(reference, 12_000), rate, 100);
    expect(Math.abs(far)).toBeLessThanOrEqual(100);
  });
});
