import { describe, expect, it } from 'vitest';
import { makeScene, nearDuplicate } from './__fixtures__/scenes';
import { dHash, hamming } from './dhash';

describe('dHash', () => {
  it('is a 64-bit hash written as 16 hex digits', () => {
    expect(dHash(makeScene(1))).toMatch(/^[0-9a-f]{16}$/);
  });

  it('is identical for identical pixels', () => {
    expect(hamming(dHash(makeScene(1)), dHash(makeScene(1)))).toBe(0);
  });

  it('keeps a noisy, slightly brighter copy within a few bits', () => {
    const scene = makeScene(1);
    expect(hamming(dHash(scene), dHash(nearDuplicate(scene, 99)))).toBeLessThanOrEqual(8);
  });

  it('puts unrelated scenes far apart', () => {
    expect(hamming(dHash(makeScene(1)), dHash(makeScene(2)))).toBeGreaterThan(16);
  });

  it('does not depend on the working resolution', () => {
    expect(hamming(dHash(makeScene(1, 256, 256)), dHash(makeScene(1, 512, 512)))).toBeLessThanOrEqual(8);
  });
});

describe('hamming', () => {
  it('counts differing bits', () => {
    expect(hamming('0000000000000000', 'ffffffffffffffff')).toBe(64);
    expect(hamming('0000000000000000', '0000000000000007')).toBe(3);
    expect(hamming('8000000000000001', '8000000000000001')).toBe(0);
  });
});
