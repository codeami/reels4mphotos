import { describe, expect, it } from 'vitest';
import { rerollReel, similarity, type Attempt, type RerollCandidate } from './reroll';

const pool = (n: number): RerollCandidate[] =>
  Array.from({ length: n }, (_, i) => ({
    photoId: `p${i}`,
    width: 3000,
    height: 4000,
    quality: 0.5 + ((i * 7) % 10) / 25,
    timeMs: i * 1000,
  }));
const ids = (r: { chosen: { photoId: string }[] }) => r.chosen.map((c) => c.photoId);

describe('similarity', () => {
  it('is highest for the same reel and 0 for nothing shared', () => {
    expect(similarity(['a', 'b'], ['a', 'b'])).toBeGreaterThan(similarity(['a', 'b'], ['b', 'a']));
    expect(similarity(['a', 'b'], ['c', 'd'])).toBe(0);
  });
  it('counts the same opener and the same position more than the same set alone', () => {
    const base = ['a', 'b', 'c', 'd'];
    expect(similarity(base, ['a', 'c', 'b', 'd'])).toBeGreaterThan(
      similarity(base, ['d', 'c', 'b', 'a']),
    );
  });
});

describe('rerollReel', () => {
  const first: Attempt = { order: pool(10).map((c) => c.photoId), transitionOffset: 0 };

  it('plans a different order from the reel it replaces', () => {
    const next = rerollReel(pool(10), 10, [first], 1);
    expect(ids(next)).not.toEqual(first.order);
  });

  it('keeps the same number of photos, all from the pool, none twice', () => {
    const next = rerollReel(pool(14), 10, [first], 1);
    expect(next.chosen).toHaveLength(10);
    expect(new Set(ids(next)).size).toBe(10);
    const known = new Set(pool(14).map((c) => c.photoId));
    expect(ids(next).every((id) => known.has(id))).toBe(true);
  });

  it('carries the photo size so the planner can crop to 9:16', () => {
    expect(rerollReel(pool(6), 5, [], 1).chosen[0]).toMatchObject({ width: 3000, height: 4000 });
  });

  it('changes the transition style', () => {
    expect(rerollReel(pool(10), 10, [first], 1).transitionOffset).not.toBe(0);
    const seen = { order: ['x'], transitionOffset: 2 };
    expect(rerollReel(pool(10), 10, [seen], 2).transitionOffset).not.toBe(2);
  });

  it('gives three retries that differ from each other and from the original', () => {
    const past: Attempt[] = [first];
    for (let retry = 1; retry <= 3; retry++) {
      const next = rerollReel(pool(10), 10, past, retry);
      expect(past.some((p) => p.order.join() === ids(next).join())).toBe(false);
      past.push({ order: ids(next), transitionOffset: next.transitionOffset });
    }
    expect(new Set(past.map((p) => p.order.join())).size).toBe(4);
  });

  it('moves the opener on the first retry for a ten photo reel', () => {
    expect(ids(rerollReel(pool(10), 10, [first], 1))[0]).not.toBe(first.order[0]);
  });

  it('brings a left-out photo in when the pool has spares', () => {
    const swapped = [1, 2, 3].some((seed) =>
      ids(rerollReel(pool(16), 10, [first], seed)).some((id) => !first.order.includes(id)),
    );
    expect(swapped).toBe(true);
  });

  it('is repeatable: same history and seed give the same reel', () => {
    expect(rerollReel(pool(12), 10, [first], 2)).toEqual(rerollReel(pool(12), 10, [first], 2));
  });

  it('still returns a reel when the pool is as small as the reel', () => {
    const five = pool(5);
    const past: Attempt = { order: five.map((c) => c.photoId), transitionOffset: 0 };
    const next = rerollReel(five, 5, [past], 1);
    expect(next.chosen).toHaveLength(5);
    expect(ids(next)).not.toEqual(past.order);
  });
});
