export interface Candidate {
  id: string;
  quality: number;
  /** Position on the timeline, 0..1. */
  t: number;
}

/**
 * Pick `n` candidates by quality while keeping them spread over the timeline.
 * The best photo goes first; each later pick maximises
 * `(1 - w) * quality + w * gap`, where `gap` is the distance to the nearest
 * already-picked photo, scaled so an even spread (1/n apart) counts as full.
 * With `w = 0` this is exactly the top N by quality.
 */
export function selectSpread(candidates: Candidate[], n: number, spreadWeight: number): string[] {
  if (n <= 0 || candidates.length === 0) return [];
  if (candidates.length <= n) return candidates.map((c) => c.id);

  const remaining = candidates
    .map((c, order) => ({ ...c, order }))
    .sort((a, b) => b.quality - a.quality || a.order - b.order);
  const picked = [remaining.shift()!];
  const evenGap = 1 / n;

  while (picked.length < n) {
    let bestAt = 0;
    let bestValue = -Infinity;
    remaining.forEach((c, at) => {
      const nearest = Math.min(...picked.map((p) => Math.abs(p.t - c.t)));
      const gap = Math.min(1, nearest / evenGap);
      const value = (1 - spreadWeight) * c.quality + spreadWeight * gap;
      if (value > bestValue) {
        bestValue = value;
        bestAt = at;
      }
    });
    picked.push(remaining.splice(bestAt, 1)[0]!);
  }
  return picked.map((p) => p.id);
}
