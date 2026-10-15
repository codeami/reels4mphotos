import { must } from './must';
import type { PlanPhoto } from './types';

/** New versions offered per set after a low rating. */
export const MAX_RETRIES = 3;

/** A photo the planner may use: the ones in the reel now, plus good ones that were left out. */
export interface RerollCandidate extends PlanPhoto {
  /** 0..1 quality from curation. */
  quality: number;
  timeMs: number;
}

/** A reel the user has already seen. */
export interface Attempt {
  order: string[];
  transitionOffset: number;
}

export interface Reroll {
  chosen: PlanPhoto[];
  transitionOffset: number;
}

const TRIES = 60;
const TRANSITION_STYLES = 3;
const SWAPS = 3;
const NOISE = 0.4;
const REUSE_PENALTY = 0.15;
const PENALTY_WEIGHT = 2;
// Same photo at the same position counts most, then the same opener, then the same set.
const W_POSITION = 1;
const W_OPENER = 0.5;
const W_SET = 0.3;

function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** How alike two reels look, 0 (nothing shared) to 1.8 (the same reel). */
export function similarity(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const inB = new Set(b);
  const shared = a.filter((id) => inB.has(id)).length;
  const sameSpot = a.filter((id, i) => b[i] === id).length;
  return (
    W_POSITION * (sameSpot / Math.max(a.length, b.length)) +
    W_OPENER * (a[0] === b[0] ? 1 : 0) +
    W_SET * (shared / (a.length + b.length - shared))
  );
}

function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => b[i] === id);
}

/**
 * Plans another reel of `count` photos that differs from every reel in `past`. Each try picks
 * photos by quality plus a little seeded noise (photos from the last reel pay a small penalty,
 * so a spare can take a place), puts them in time order, then swaps a few. A try scores its
 * quality minus how much it resembles the reels already seen, and the best try wins. The same
 * seed and history always give the same reel.
 */
export function rerollReel(
  pool: readonly RerollCandidate[],
  count: number,
  past: readonly Attempt[],
  seed: number,
): Reroll {
  const rand = seededRandom(seed);
  const n = Math.min(count, pool.length);
  const last = past[past.length - 1];
  const lastUsed = new Set(last?.order);
  const transitionOffset = ((last?.transitionOffset ?? 0) + 1 + (seed % 2)) % TRANSITION_STYLES;

  let best: { order: RerollCandidate[]; score: number } | null = null;
  for (let t = 0; t < TRIES; t++) {
    const picked = pool
      .map((c) => ({
        c,
        w: c.quality + rand() * NOISE - (lastUsed.has(c.photoId) ? REUSE_PENALTY : 0),
      }))
      .sort((a, b) => b.w - a.w)
      .slice(0, n)
      .map((x) => x.c)
      .sort((a, b) => a.timeMs - b.timeMs);
    const order = [...picked];
    for (let k = 0; k < SWAPS && n > 1; k++) {
      const i = Math.floor(rand() * n);
      const j = Math.floor(rand() * n);
      [order[i], order[j]] = [must(order[j]), must(order[i])];
    }
    const ids = order.map((c) => c.photoId);
    if (past.some((p) => sameOrder(p.order, ids))) continue;
    const quality = order.reduce((sum, c) => sum + c.quality, 0) / Math.max(1, n);
    const score = quality - PENALTY_WEIGHT * past.reduce((s, p) => s + similarity(ids, p.order), 0);
    if (!best || score > best.score) best = { order, score };
  }

  // Every try repeated a reel seen before (only possible with a tiny pool): rotate by one place.
  const fallback = [...pool].sort((a, b) => a.timeMs - b.timeMs).slice(0, n);
  const order = best?.order ?? [...fallback.slice(1), ...fallback.slice(0, 1)];
  return {
    chosen: order.map(({ photoId, width, height }) => ({ photoId, width, height })),
    transitionOffset,
  };
}
