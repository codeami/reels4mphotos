import { toLuma } from './luma';
import type { PixelBuffer } from './types';

/**
 * Variance of the 4-neighbour Laplacian over the luma plane. Sharp edges give
 * large second derivatives, so blur pulls the variance down.
 */
export function laplacianVariance(px: PixelBuffer): number {
  const { width: w, height: h } = px;
  if (w < 3 || h < 3) return 0;
  const luma = toLuma(px);
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap = luma[i - w]! + luma[i + w]! + luma[i - 1]! + luma[i + 1]! - 4 * luma[i]!;
      sum += lap;
      sumSq += lap * lap;
      count++;
    }
  }
  const mean = sum / count;
  return sumSq / count - mean * mean;
}

/** Variance at which the score is 0.5. */
const HALF_SCORE_VARIANCE = 300;

/** Saturating 0..1 map of a Laplacian variance. */
export function sharpnessScore(variance: number): number {
  return variance <= 0 ? 0 : variance / (variance + HALF_SCORE_VARIANCE);
}
