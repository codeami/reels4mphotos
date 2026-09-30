import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS, classify, mergeThresholds, qualityScore } from './score';

const okExposure = { meanLuma: 128, shadowClip: 0, highlightClip: 0, verdict: 'ok' as const, score: 1 };

describe('qualityScore', () => {
  it('ranks sharp and well exposed above blurry and well exposed', () => {
    expect(qualityScore(0.9, 1)).toBeGreaterThan(qualityScore(0.1, 1));
  });

  it('ranks well exposed above clipped at equal sharpness', () => {
    expect(qualityScore(0.8, 1)).toBeGreaterThan(qualityScore(0.8, 0.2));
  });

  it('stays within 0..1', () => {
    expect(qualityScore(0, 0)).toBe(0);
    expect(qualityScore(1, 1)).toBeLessThanOrEqual(1);
  });
});

describe('classify', () => {
  it('passes a sharp, well-exposed photo', () => {
    expect(classify({ sharpness: 500, exposure: okExposure }, DEFAULT_THRESHOLDS)).toBeNull();
  });

  it('flags blur below the variance threshold', () => {
    expect(classify({ sharpness: DEFAULT_THRESHOLDS.blurVariance - 1, exposure: okExposure }, DEFAULT_THRESHOLDS)).toBe('blurry');
  });

  it('flags exposure verdicts', () => {
    expect(classify({ sharpness: 500, exposure: { ...okExposure, verdict: 'overexposed' } }, DEFAULT_THRESHOLDS)).toBe('overexposed');
    expect(classify({ sharpness: 500, exposure: { ...okExposure, verdict: 'underexposed' } }, DEFAULT_THRESHOLDS)).toBe('underexposed');
  });

  // A blown-out or crushed frame has lost its edges, so it always reads as blurry too.
  // Exposure is the cause the user can act on, so it is reported first.
  it('reports exposure first when a photo is both badly exposed and low-variance', () => {
    expect(
      classify({ sharpness: 1, exposure: { ...okExposure, verdict: 'overexposed' } }, DEFAULT_THRESHOLDS),
    ).toBe('overexposed');
    expect(
      classify({ sharpness: 1, exposure: { ...okExposure, verdict: 'underexposed' } }, DEFAULT_THRESHOLDS),
    ).toBe('underexposed');
  });
});

describe('mergeThresholds', () => {
  it('overrides only what was given', () => {
    const t = mergeThresholds({ duplicateHamming: 4 });
    expect(t.duplicateHamming).toBe(4);
    expect(t.blurVariance).toBe(DEFAULT_THRESHOLDS.blurVariance);
  });
});
