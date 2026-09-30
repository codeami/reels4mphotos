import { describe, expect, it } from 'vitest';
import { boxBlur, flat, makeScene } from './__fixtures__/scenes';
import { laplacianVariance, sharpnessScore } from './sharpness';
import { must } from './must';

describe('laplacianVariance', () => {
  it('scores a blurred photo below the sharp original', () => {
    const sharp = makeScene(1);
    const blurry = boxBlur(sharp, 4);
    expect(laplacianVariance(blurry)).toBeLessThan(laplacianVariance(sharp));
  });

  it('keeps getting lower as the blur grows', () => {
    const sharp = makeScene(2);
    expect(laplacianVariance(boxBlur(sharp, 6))).toBeLessThan(laplacianVariance(boxBlur(sharp, 2)));
  });

  it('is zero for a flat frame', () => {
    expect(laplacianVariance(flat(64, 64, 128))).toBe(0);
  });

  it('returns 0 instead of throwing for an image too small to convolve', () => {
    expect(laplacianVariance(flat(2, 2, 10))).toBe(0);
  });
});

describe('sharpnessScore', () => {
  it('maps variance to 0..1 and increases monotonically', () => {
    const values = [0, 10, 50, 200, 1000, 50000].map(sharpnessScore);
    expect(values[0]).toBe(0);
    for (let i = 1; i < values.length; i++)
      expect(must(values[i])).toBeGreaterThan(must(values[i - 1]));
    expect(must(values[values.length - 1])).toBeLessThanOrEqual(1);
  });

  it('ranks a sharp scene above its blurred copy', () => {
    const sharp = makeScene(3);
    expect(sharpnessScore(laplacianVariance(sharp))).toBeGreaterThan(
      sharpnessScore(laplacianVariance(boxBlur(sharp, 4))),
    );
  });
});
