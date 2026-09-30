import { toLuma } from './luma';
import type { ExposureVerdict, PixelBuffer } from './types';

/** Luma at or below this counts as a clipped shadow. */
const SHADOW_MAX = 12;
/** Luma at or above this counts as a clipped highlight. */
const HIGHLIGHT_MIN = 243;
/** Clipped share of the frame (shadows plus highlights) that zeroes the score. */
const CLIP_BUDGET = 0.4;

const UNDEREXPOSED_MEAN = 45;
const OVEREXPOSED_MEAN = 210;
const UNDEREXPOSED_CLIP = 0.6;
const OVEREXPOSED_CLIP = 0.3;

export interface ExposureStats {
  meanLuma: number;
  /** Share of pixels in the clipped shadows, 0..1. */
  shadowClip: number;
  /** Share of pixels in the clipped highlights, 0..1. */
  highlightClip: number;
  /** 0..1, higher is better exposed. */
  score: number;
  verdict: ExposureVerdict;
}

/** Histogram-based exposure check: penalises clipped shadows and highlights and a mean far from mid-grey. */
export function analyzeExposure(px: PixelBuffer): ExposureStats {
  const luma = toLuma(px);
  const histogram = new Uint32Array(256);
  let total = 0;
  for (let i = 0; i < luma.length; i++) {
    const v = luma[i]!;
    histogram[v] = histogram[v]! + 1;
    total += v;
  }
  const n = Math.max(1, luma.length);
  let shadows = 0;
  let highlights = 0;
  for (let v = 0; v <= SHADOW_MAX; v++) shadows += histogram[v]!;
  for (let v = HIGHLIGHT_MIN; v < 256; v++) highlights += histogram[v]!;

  const meanLuma = total / n;
  const shadowClip = shadows / n;
  const highlightClip = highlights / n;

  const clipPenalty = Math.min(1, (shadowClip + highlightClip) / CLIP_BUDGET);
  const meanPenalty = Math.abs(meanLuma - 128) / 128;
  const score = Math.max(0, (1 - clipPenalty) * (1 - 0.4 * meanPenalty));

  let verdict: ExposureVerdict = 'ok';
  if (highlightClip > OVEREXPOSED_CLIP || meanLuma > OVEREXPOSED_MEAN) verdict = 'overexposed';
  else if (shadowClip > UNDEREXPOSED_CLIP || meanLuma < UNDEREXPOSED_MEAN) verdict = 'underexposed';

  return { meanLuma, shadowClip, highlightClip, score, verdict };
}
