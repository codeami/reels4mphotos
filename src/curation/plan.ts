import { DEFAULT_LOOK, LOOKS, type LookPlanning } from '../looks';
import type { LookId, Rect, ReelPlan, ReelShot, Transition } from '../types/reel-plan';
import type { BeatMap, PlanPhoto } from './types';
import { must } from './must';

export const MIN_REEL_MS = 15_000;
export const MAX_REEL_MS = 30_000;
export const DEFAULT_REEL_MS = 20_000;

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
  style: { fit: 'cover' | 'contain'; zoom: number } = { fit: 'cover', zoom: ZOOM_IN_TO },
): { from: Rect; to: Rect } {
  const aspect = width && height ? width / height : FRAME_ASPECT;
  // A look that fits the photo inside the frame moves over the whole photo, not a 9:16 part of it.
  const covers = style.fit === 'cover';
  const fullW = covers && aspect > FRAME_ASPECT ? FRAME_ASPECT / aspect : 1;
  const fullH = covers && aspect <= FRAME_ASPECT ? aspect / FRAME_ASPECT : 1;
  const zoomIn = style.zoom;

  const sx = index % 2 === 0 ? -1 : 1;
  const sy = Math.floor(index / 2) % 2 === 0 ? -1 : 1;
  const start = cropWindow(
    fullW,
    fullH,
    index % 2 === 0 ? 1 : zoomIn,
    0.5 + sx * PAN,
    0.5 + sy * PAN * 0.5,
  );
  const end = cropWindow(
    fullW,
    fullH,
    index % 2 === 0 ? zoomIn : 1,
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
 * Cuts for a look that counts in beats (looks.json `cutBeats`): each shot lasts a whole number of
 * beats from the look's range, picked so the reel lands near `targetMs`. When the photos alone are
 * too few to fill the target at that pace, the set is gone through again (up to `maxPasses`),
 * each time with new Ken Burns moves. Returns one end time per shot, or null when the beat map
 * has too few beats to cut on (the caller then spaces cuts evenly).
 */
function beatShotEnds(
  photoCount: number,
  targetMs: number,
  ceilingMs: number,
  beatsMs: number[],
  planning: LookPlanning,
): number[] | null {
  const [lo, hi] = must(planning.cutBeats);
  const beats = [...new Set(beatsMs)].filter((b) => b >= 0 && b <= ceilingMs).sort((a, b) => a - b);
  if (beats.length < photoCount + 1) return null;
  // Beat k of the grid is where the k-th beat's worth of the reel ends; index 0 is the start.
  const beatMs = (must(beats[beats.length - 1]) - must(beats[0])) / (beats.length - 1);
  const targetBeats = targetMs / beatMs;
  const shotCount = clamp(
    Math.round(targetBeats / ((lo + hi) / 2)),
    photoCount,
    photoCount * planning.maxPasses,
  );

  const ends: number[] = [];
  let cursor = 0;
  for (let k = 0; k < shotCount; k++) {
    const shotsLeft = shotCount - k;
    const wanted = clamp(Math.round((targetBeats - cursor) / shotsLeft), lo, hi);
    // Never run past the last beat, and leave one beat for every shot still to come.
    const room = beats.length - 1 - cursor - (shotsLeft - 1);
    const length = Math.min(wanted, room);
    if (length < 1) return null;
    cursor += length;
    ends.push(must(beats[cursor]));
  }
  return ends;
}

function transitionFor(planning: LookPlanning, index: number, offset: number): Transition {
  if (planning.crossfade === 'none') return 'cut';
  if (planning.crossfade === 'all') return index === 0 ? 'cut' : 'crossfade';
  return (index + offset) % CROSSFADE_EVERY === CROSSFADE_EVERY - 1 ? 'crossfade' : 'cut';
}

/**
 * Chosen photos (already in reel order) plus a beat map become a ReelPlan.
 * Shots start and end on beats (when the map has enough), the total lands inside
 * 15-30 s (or the track length, if shorter), and every shot gets a Ken Burns move.
 * `transitionOffset` moves which shots crossfade (every third, starting later by the offset),
 * so a retried reel can differ in more than photo order.
 * A look other than classic sets its own cut lengths (in beats), fades and Ken Burns zoom.
 */
export function buildPlan(
  chosen: PlanPhoto[],
  beatmap: BeatMap,
  targetDurationMs: number = DEFAULT_REEL_MS,
  transitionOffset = 0,
  lookId: LookId = DEFAULT_LOOK,
): ReelPlan {
  const header = {
    version: 1,
    width: 1080,
    height: 1920,
    fps: 30,
    trackId: beatmap.trackId,
  } as const;
  if (chosen.length === 0) return { ...header, totalMs: 0, shots: [] };

  const look = LOOKS[lookId];
  const ceiling = Math.min(MAX_REEL_MS, beatmap.durationMs);
  const target = Math.min(clamp(targetDurationMs, MIN_REEL_MS, MAX_REEL_MS), ceiling);
  const ends =
    (look.planning.cutBeats &&
      beatShotEnds(chosen.length, target, ceiling, beatmap.beatsMs, look.planning)) ||
    shotEnds(chosen.length, target, ceiling, Math.min(MIN_REEL_MS, ceiling), beatmap.beatsMs);

  // More cuts than photos means the set is gone through again, in the same order.
  const shots: ReelShot[] = ends.map((end, i) => {
    const photo = must(chosen[i % chosen.length]);
    const startMs = i === 0 ? 0 : must(ends[i - 1]);
    return {
      photoId: photo.photoId,
      startMs,
      durationMs: end - startMs,
      transition: transitionFor(look.planning, i, transitionOffset),
      kenBurns: kenBurnsFor(i, photo.width, photo.height, {
        fit: look.fit,
        zoom: look.planning.kenBurnsZoom,
      }),
    };
  });
  // Classic plans carry no look id, so they stay exactly as they were before looks existed.
  const lookField = lookId === 'classic' ? {} : { look: lookId };
  return { ...header, ...lookField, totalMs: must(ends[ends.length - 1]), shots };
}
