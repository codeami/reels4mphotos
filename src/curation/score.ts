import type { DropReason, ExposureVerdict, Thresholds } from './types';

export const DEFAULT_THRESHOLDS: Thresholds = {
  blurVariance: 60,
  duplicateHamming: 10,
  spreadWeight: 0.35,
};

export function mergeThresholds(overrides: Partial<Thresholds> | undefined): Thresholds {
  return { ...DEFAULT_THRESHOLDS, ...overrides };
}

const SHARPNESS_WEIGHT = 0.6;

/** One 0..1 quality figure from the two per-photo scores (each already 0..1). */
export function qualityScore(sharpness: number, exposure: number): number {
  return SHARPNESS_WEIGHT * sharpness + (1 - SHARPNESS_WEIGHT) * exposure;
}

/**
 * Hard quality filters. Exposure is checked before blur: a blown-out or crushed
 * frame has no edges left, so it would always read as blurry and hide the real cause.
 */
export function classify(
  features: { sharpness: number; exposure: { verdict: ExposureVerdict } },
  thresholds: Thresholds,
): Extract<DropReason, 'blurry' | 'underexposed' | 'overexposed'> | null {
  if (features.exposure.verdict === 'overexposed') return 'overexposed';
  if (features.exposure.verdict === 'underexposed') return 'underexposed';
  if (features.sharpness < thresholds.blurVariance) return 'blurry';
  return null;
}
