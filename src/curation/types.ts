import type { ReelPlan } from '../types/reel-plan';

/** RGBA pixels, same layout as ImageData. Only ever held in memory. */
export interface PixelBuffer {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** Mirrors the beatmap.json the music workstream ships. */
export interface BeatMap {
  version: 1;
  trackId: string;
  durationMs: number;
  bpm: number;
  beatsMs: number[];
}

export type TimeSource = 'exif' | 'lastModified' | 'pickOrder';

export type DropReason =
  | 'decode-failed'
  | 'blurry'
  | 'underexposed'
  | 'overexposed'
  | 'near-duplicate'
  | 'not-selected';

export type ExposureVerdict = 'ok' | 'underexposed' | 'overexposed';

export interface Thresholds {
  /** Laplacian variance (luma 0..255) below which a photo counts as blurry. */
  blurVariance: number;
  /** Hamming distance (of 64) at or below which two photos are near-duplicates. Negative disables the check. */
  duplicateHamming: number;
  /** Weight of time spread against quality when picking the top N, 0..1. */
  spreadWeight: number;
}

export interface CurateOptions {
  beatmap: BeatMap;
  /** How many photos to keep. Default 10. */
  targetCount?: number;
  /** Desired reel length, clamped to 15-30 s. Default 20 s. */
  targetDurationMs?: number;
  /** Longest side of the downscaled working image. Default 512. */
  workingSize?: number;
  /** Stable ids, one per file. Default `photo-<index>`. */
  photoIds?: string[];
  thresholds?: Partial<Thresholds>;
  onProgress?: (p: CurateProgress) => void;
}

export type CurateStage = 'analysing' | 'selecting' | 'done';

export interface CurateProgress {
  stage: CurateStage;
  done: number;
  total: number;
  /** Set while analysing: the photo just finished. */
  photoId?: string;
}

export interface PhotoScore {
  photoId: string;
  /** Index into the `files` array handed to `curate`. */
  index: number;
  selected: boolean;
  dropReason: DropReason | null;
  /** For `near-duplicate`: the kept photo this one collapsed into. */
  duplicateOf?: string;
  /** For `decode-failed`: what the browser said. */
  decodeError?: string;
  /** Original pixel size, when the file decoded. */
  width?: number;
  height?: number;
  /** Raw Laplacian variance. */
  sharpness?: number;
  /** Raw exposure stats. */
  exposure?: { meanLuma: number; shadowClip: number; highlightClip: number; verdict: ExposureVerdict };
  /** 0..1 combined quality, before the spread adjustment. */
  quality?: number;
  dHash?: string;
  /** Epoch ms used for ordering: EXIF, else lastModified, else pick index. */
  timeMs: number;
  timeSource: TimeSource;
}

export interface TimelineSummary {
  /** Dominant source, or 'mixed' when photos disagreed. */
  source: TimeSource | 'mixed';
  exif: number;
  lastModified: number;
  pickOrder: number;
}

export interface CurateResult {
  plan: ReelPlan;
  scores: PhotoScore[];
  timeline: TimelineSummary;
  ranIn: 'worker' | 'main-thread';
}
