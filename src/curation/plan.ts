import type { Rect, ReelPlan, ReelShot, Transition } from '../types/reel-plan';
import type { BeatMap } from './types';
import { must } from './must';

export interface PlanPhoto {
  photoId: string;
  /** Original pixel size; omit when unknown. */
  width?: number;
  height?: number;
}

export const MIN_REEL_MS = 15_000;
export const MAX_REEL_MS = 30_000;

const FRAME_ASPECT = 9 / 16;
const ZOOM_IN_TO = 1.2;
const PAN = 0.12;
const CROSSFADE_EVERY = 3;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** A 9:16 crop of the photo at the given zoom, centred on (cx, cy) and kept inside the photo. */
function cropWindow(fullW: number, fullH: number, zoom: number, cx: number, cy: number): Rect {
  const w = fullW / zoom;
  const h = fullH / zoom;
  return { x: clamp(cx - w / 2, 0, 1 - w), y: clamp(cy - h / 2, 0, 1 - h), w, h };
}

/**
 * A deterministic Ken Burns move for the shot at `index`: zoom in on even
 * shots and out on odd ones, panning in a direction that rotates shot to shot.
 * Both windows are 9:16 in pixels so the renderer can draw them straight into the frame.
 */
export function kenBurnsFor(
  index: number,
  width?: number,
  height?: number,
): { from: Rect; to: Rect } {
  const aspect = width && height ? width / height : FRAME_ASPECT;
  const fullW = aspect > FRAME_ASPECT ? FRAME_ASPECT / aspect : 1;
  const fullH = aspect > FRAME_ASPECT ? 1 : aspect / FRAME_ASPECT;

  const sx = index % 2 === 0 ? -1 : 1;
  const sy = Math.floor(index / 2) % 2 === 0 ? -1 : 1;
  const start = cropWindow(
    fullW,
    fullH,
    index % 2 === 0 ? 1 : ZOOM_IN_TO,
    0.5 + sx * PAN,
    0.5 + sy * PAN * 0.5,
  );
  const end = cropWindow(
    fullW,
    fullH,
    index % 2 === 0 ? ZOOM_IN_TO : 1,
    0.5 - sx * PAN,
    0.5 - sy * PAN * 0.5,
  );
  return { from: start, to: end };
}

/** Index of the value in `sorted` nearest to `target`, clamped into [lo, hi]. */
function nearestIndex(sorted: number[], target: number, lo: number, hi: number): number {
  let best = lo;
  for (let i = lo; i <= hi; i++) {
    if (Math.abs(must(sorted[i]) - target) < Math.abs(must(sorted[best]) - target)) best = i;
  }
  return best;
}

/**
 * Shot end times, one per photo: on beats when the map has enough of them, else
 * evenly spaced (a map with fewer beats than photos cannot carry every cut).
 * The last cut lands on the first beat at or after `floorMs`, so beat snapping
 * cannot pull the reel under the minimum length.
 */
function shotEnds(
  count: number,
  targetMs: number,
  ceilingMs: number,
  floorMs: number,
  beatsMs: number[],
): number[] {
  const beats = [...new Set(beatsMs)].filter((b) => b > 0 && b <= ceilingMs).sort((a, b) => a - b);
  const ideal = targetMs / count;
  if (beats.length < count)
    return Array.from({ length: count }, (_, k) => Math.round((k + 1) * ideal));
  const floorIdx = Math.max(
    0,
    beats.findIndex((b) => b >= floorMs),
  );
  const ends: number[] = [];
  let prev = -1;
  for (let k = 1; k <= count; k++) {
    const hi = beats.length - (count - k) - 1;
    const lo = Math.min(hi, k === count ? Math.max(prev + 1, floorIdx) : prev + 1);
    const idx = nearestIndex(beats, k * ideal, lo, hi);
    ends.push(must(beats[idx]));
    prev = idx;
  }
  return ends;
}

/**
 * Chosen photos (already in reel order) plus a beat map become a ReelPlan.
 * Shots start and end on beats (when the map has enough), the total lands inside
 * 15-30 s (or the track length, if shorter), and every shot gets a Ken Burns move.
 */
export function buildPlan(
  chosen: PlanPhoto[],
  beatmap: BeatMap,
  targetDurationMs: number,
): ReelPlan {
  const header = {
    version: 1,
    width: 1080,
    height: 1920,
    fps: 30,
    trackId: beatmap.trackId,
  } as const;
  if (chosen.length === 0) return { ...header, totalMs: 0, shots: [] };

  const ceiling = Math.min(MAX_REEL_MS, beatmap.durationMs);
  const target = Math.min(clamp(targetDurationMs, MIN_REEL_MS, MAX_REEL_MS), ceiling);
  const ends = shotEnds(
    chosen.length,
    target,
    ceiling,
    Math.min(MIN_REEL_MS, ceiling),
    beatmap.beatsMs,
  );

  const shots: ReelShot[] = chosen.map((photo, i) => {
    const startMs = i === 0 ? 0 : must(ends[i - 1]);
    const transition: Transition =
      i % CROSSFADE_EVERY === CROSSFADE_EVERY - 1 ? 'crossfade' : 'cut';
    return {
      photoId: photo.photoId,
      startMs,
      durationMs: must(ends[i]) - startMs,
      transition,
      kenBurns: kenBurnsFor(i, photo.width, photo.height),
    };
  });
  return { ...header, totalMs: must(ends[ends.length - 1]), shots };
}
