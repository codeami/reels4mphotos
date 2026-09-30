import { hamming } from './dhash';

export interface DedupeItem {
  id: string;
  quality: number;
  hash: string;
}

export interface DedupeResult {
  /** Survivors, best quality first. */
  kept: string[];
  /** Dropped id -> the kept id it collapsed into. */
  duplicateOf: Map<string, string>;
}

/**
 * Greedy near-duplicate collapse. Walk best-first; an item joins the first kept
 * item within `threshold` bits, otherwise it is kept. Ties go to the earlier item.
 */
export function collapseDuplicates(items: DedupeItem[], threshold: number): DedupeResult {
  const ordered = items
    .map((item, order) => ({ item, order }))
    .sort((a, b) => b.item.quality - a.item.quality || a.order - b.order)
    .map((x) => x.item);
  const kept: DedupeItem[] = [];
  const duplicateOf = new Map<string, string>();
  for (const item of ordered) {
    const twin = kept.find((k) => hamming(k.hash, item.hash) <= threshold);
    if (twin) duplicateOf.set(item.id, twin.id);
    else kept.push(item);
  }
  return { kept: kept.map((k) => k.id), duplicateOf };
}
