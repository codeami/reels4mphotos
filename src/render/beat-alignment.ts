import { FPS } from './constants';
import type { ReelPlan } from '../types/reel-plan';
import type { BeatMap } from './beat-map';
import { at } from './util';

export interface BeatAlignment {
  // Shot boundaries checked (every shot after the first).
  boundaries: number;
  // Largest distance from a boundary to its nearest beat.
  maxErrorMs: number;
  // Indexes of shots that start more than one frame from any beat.
  offBeat: number[];
}

function nearestDistance(sorted: readonly number[], value: number): number {
  let lo = 0;
  let hi = sorted.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (at(sorted, mid) < value) lo = mid + 1;
    else hi = mid;
  }
  const after = sorted[lo];
  const before = sorted[lo - 1];
  const candidates = [after, before].filter((b): b is number => b !== undefined);
  return candidates.length === 0
    ? Infinity
    : Math.min(...candidates.map((b) => Math.abs(b - value)));
}

// Evidence for "cuts land on beats": how far each shot boundary sits from the nearest beat in the
// track's beat map. Informational, since the plan stays authoritative for what gets rendered.
export function measureBeatAlignment(plan: ReelPlan, beatmap: BeatMap): BeatAlignment {
  const beats = [...beatmap.beatsMs].sort((a, b) => a - b);
  const frameMs = 1000 / FPS;
  const offBeat: number[] = [];
  let maxErrorMs = 0;
  plan.shots.forEach((shot, k) => {
    if (k === 0) return;
    const error = nearestDistance(beats, shot.startMs);
    maxErrorMs = Math.max(maxErrorMs, error);
    if (error > frameMs) offBeat.push(k);
  });
  return { boundaries: Math.max(0, plan.shots.length - 1), maxErrorMs, offBeat };
}
