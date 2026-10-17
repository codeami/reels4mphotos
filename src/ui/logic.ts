import type { DropReason } from '../curation/types';
import type { BeatMap, PhotoScore, ReelPlan } from './seams/types';

import { DEFAULT_MIN_PHOTOS, FEWEST_PHOTOS } from '../looks';

// Most looks need five photos; the single-photo looks need FEWEST_PHOTOS (one).
export const MIN_PHOTOS = DEFAULT_MIN_PHOTOS;
export { FEWEST_PHOTOS };
export const MAX_PHOTOS = 50;
export const BEAT_TOLERANCE_MS = 60;

/** Returns a new array with the item at `from` moved to `to`. */
export function move<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length)
    return [...list];
  const next = [...list];
  const item = next.splice(from, 1);
  next.splice(to, 0, ...item);
  return next;
}

export function toggle(order: readonly string[], all: readonly string[], id: string): string[] {
  if (order.includes(id)) return order.filter((x) => x !== id);
  // Keep a re-added photo where it sat in the original ordering.
  const rank = (x: string) => all.indexOf(x);
  const next = [...order];
  const at = next.findIndex((x) => rank(x) > rank(id));
  next.splice(at === -1 ? next.length : at, 0, id);
  return next;
}

export type CountCheck = { ok: true } | { ok: false; message: string };
export function checkCount(n: number, min: number = MIN_PHOTOS): CountCheck {
  if (n < min)
    return {
      ok: false,
      message: `Add at least ${min} ${min === 1 ? 'photo' : 'photos'} (you have ${n}).`,
    };
  if (n > MAX_PHOTOS)
    return { ok: false, message: `That is ${n} photos. Pick ${MAX_PHOTOS} or fewer.` };
  return { ok: true };
}

const DROP_TEXT: Record<DropReason, string> = {
  'decode-failed': 'Could not be read',
  blurry: 'Might be a little soft',
  underexposed: 'On the dark side',
  overexposed: 'On the bright side',
  'near-duplicate': 'Similar to a photo in your reel',
  'not-selected': 'Good, but no room',
};

/** Plain-language reason a photo was left out of the reel. */
export const dropReasonText = (reason: DropReason | null): string =>
  DROP_TEXT[reason ?? 'not-selected'];

/** A left-out photo was either dropped by curation or taken out by the user. */
export type LeftOutKind = DropReason | 'removed';

// Photos the user might actually want back come first.
const LEFT_OUT_ORDER: LeftOutKind[] = [
  'not-selected',
  'removed',
  'near-duplicate',
  'blurry',
  'underexposed',
  'overexposed',
  'decode-failed',
];

export interface LeftOutGroup<T> {
  kind: LeftOutKind;
  items: T[];
}

const qualityOf = (p: { score: PhotoScore }) => p.score.quality ?? -1;

/**
 * Groups left-out photos by why they are out, "good but no room" first, best photo first within a
 * group. A photo curation chose but the user removed is `removed`, not "ranked lower".
 */
export function groupLeftOut<T extends { score: PhotoScore }>(
  out: readonly T[],
): LeftOutGroup<T>[] {
  const kindOf = (p: T): LeftOutKind =>
    p.score.selected ? 'removed' : (p.score.dropReason ?? 'not-selected');
  return LEFT_OUT_ORDER.flatMap((kind) => {
    const items = out
      .filter((p) => kindOf(p) === kind)
      .sort((a, b) => qualityOf(b) - qualityOf(a) || a.score.index - b.score.index);
    return items.length > 0 ? [{ kind, items }] : [];
  });
}

export interface LengthOption {
  id: 'short' | 'standard' | 'long';
  label: string;
  ms: number;
}
// Mirror MIN / DEFAULT / MAX_REEL_MS in src/curation/plan.ts, which clamps whatever is asked for.
export const LENGTHS: readonly LengthOption[] = [
  { id: 'short', label: 'Short', ms: 15_000 },
  { id: 'standard', label: 'Standard', ms: 20_000 },
  { id: 'long', label: 'Long', ms: 30_000 },
];
export const DEFAULT_LENGTH_MS = 20_000;

export const isHeic = (f: File) => /^image\/hei[cf]/i.test(f.type) || /\.hei[cf]$/i.test(f.name);

export function shotIndexAt(plan: ReelPlan, ms: number): number {
  let idx = 0;
  for (let i = 0; i < plan.shots.length; i++)
    if ((plan.shots[i]?.startMs ?? Infinity) <= ms) idx = i;
  return idx;
}

/** How many shot boundaries fall within tolerance of a beat. */
export function cutsOnBeat(plan: ReelPlan, beatmap: BeatMap): { onBeat: number; cuts: number } {
  const cuts = plan.shots.slice(1).map((s) => s.startMs);
  const onBeat = cuts.filter((c) =>
    beatmap.beatsMs.some((b) => Math.abs(b - c) <= BEAT_TOLERANCE_MS),
  ).length;
  return { onBeat, cuts: cuts.length };
}

export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}
