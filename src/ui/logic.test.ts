import { describe, expect, it } from 'vitest';
import {
  checkCount,
  crossfadeAlpha,
  cutsOnBeat,
  dropReasonText,
  groupLeftOut,
  isHeic,
  move,
  rectAt,
  shotIndexAt,
  toggle,
} from './logic';
import type { PhotoScore, ReelPlan, ReelShot } from './seams/types';

const r = { x: 0, y: 0, w: 1, h: 1 };
const plan = (starts: number[]): ReelPlan => ({
  version: 1,
  width: 1080,
  height: 1920,
  fps: 30,
  trackId: 't',
  totalMs: 9000,
  shots: starts.map((startMs, i) => ({
    photoId: `p${i}`,
    startMs,
    durationMs: 1000,
    transition: i === 1 ? 'crossfade' : 'cut',
    kenBurns: { from: r, to: r },
  })),
});

describe('move', () => {
  it('moves an item forward and back without mutating the input', () => {
    const a = ['a', 'b', 'c', 'd'];
    expect(move(a, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(move(a, 3, 1)).toEqual(['a', 'd', 'b', 'c']);
    expect(a).toEqual(['a', 'b', 'c', 'd']);
  });
  it('ignores out-of-range moves', () => {
    expect(move(['a', 'b'], 0, 5)).toEqual(['a', 'b']);
  });
});

describe('toggle', () => {
  const all = ['a', 'b', 'c', 'd'];
  it('removes a selected photo', () =>
    expect(toggle(['a', 'b', 'c'], all, 'b')).toEqual(['a', 'c']));
  it('re-adds a photo at its original rank', () =>
    expect(toggle(['a', 'c'], all, 'b')).toEqual(['a', 'b', 'c']));
  it('appends when it ranks last', () => expect(toggle(['a'], all, 'd')).toEqual(['a', 'd']));
});

describe('checkCount', () => {
  it('states the 5-50 range instead of failing silently', () => {
    expect(checkCount(4)).toMatchObject({ ok: false });
    expect(checkCount(51)).toMatchObject({ ok: false });
    expect(checkCount(5)).toEqual({ ok: true });
    expect(checkCount(50)).toEqual({ ok: true });
  });
});

describe('isHeic', () => {
  it('detects by mime type or extension', () => {
    expect(isHeic(new File([], 'a.HEIC'))).toBe(true);
    expect(isHeic(new File([], 'a', { type: 'image/heif' }))).toBe(true);
    expect(isHeic(new File([], 'a.jpg', { type: 'image/jpeg' }))).toBe(false);
  });
});

describe('playback maths', () => {
  it('interpolates ken burns with ease in/out', () => {
    const half = rectAt({ x: 0, y: 0, w: 1, h: 1 }, { x: 0.4, y: 0.2, w: 0.5, h: 0.5 }, 0.5);
    expect(half.x).toBeCloseTo(0.2);
    expect(rectAt(r, { ...r, x: 1 }, -3).x).toBe(0);
    expect(rectAt(r, { ...r, x: 1 }, 9).x).toBe(1);
  });
  it('finds the active shot', () => {
    const p = plan([0, 2000, 4000]);
    expect(shotIndexAt(p, 0)).toBe(0);
    expect(shotIndexAt(p, 2000)).toBe(1);
    expect(shotIndexAt(p, 8000)).toBe(2);
  });
  it('fades the previous shot only for crossfades', () => {
    const p = plan([0, 2000, 4000]);
    expect(crossfadeAlpha(p.shots[1] as ReelShot, 2000)).toBe(1);
    expect(crossfadeAlpha(p.shots[1] as ReelShot, 2300)).toBe(0);
    expect(crossfadeAlpha(p.shots[2] as ReelShot, 4000)).toBe(0);
  });
  it('counts cuts that land within tolerance of a beat', () => {
    const beatmap = {
      version: 1 as const,
      trackId: 't',
      durationMs: 9000,
      bpm: 120,
      beatsMs: [0, 500, 1000, 1500, 2000, 4040],
    };
    expect(cutsOnBeat(plan([0, 2000, 4000, 5200]), beatmap)).toEqual({ onBeat: 2, cuts: 3 });
  });
});

describe('dropReasonText', () => {
  it('gives every drop reason words, and treats a missing one as ranked lower', () => {
    const reasons = [
      'decode-failed',
      'blurry',
      'underexposed',
      'overexposed',
      'near-duplicate',
      'not-selected',
    ] as const;
    const texts = reasons.map(dropReasonText);
    expect(texts.every((t) => t.length > 0)).toBe(true);
    expect(new Set(texts).size).toBe(reasons.length);
    expect(dropReasonText(null)).toBe(dropReasonText('not-selected'));
  });
});

describe('groupLeftOut', () => {
  const photo = (index: number, over: Partial<PhotoScore>) => ({
    score: {
      photoId: `p${index}`,
      index,
      selected: false,
      dropReason: null,
      timeMs: index,
      timeSource: 'pickOrder',
      ...over,
    } satisfies PhotoScore,
  });
  const ids = (g: ReturnType<typeof groupLeftOut>[number]) => g.items.map((p) => p.score.photoId);

  it('puts "good but no room" first, then user removals, then the quality drops', () => {
    const groups = groupLeftOut([
      photo(0, { dropReason: 'blurry' }),
      photo(1, { dropReason: 'near-duplicate', duplicateOf: 'p9' }),
      photo(2, { selected: true }),
      photo(3, { dropReason: 'not-selected' }),
      photo(4, { dropReason: 'decode-failed' }),
      photo(5, { dropReason: 'overexposed' }),
      photo(6, { dropReason: 'underexposed' }),
    ]);
    expect(groups.map((g) => g.kind)).toEqual([
      'not-selected',
      'removed',
      'near-duplicate',
      'blurry',
      'underexposed',
      'overexposed',
      'decode-failed',
    ]);
  });

  it('lists the best photo first within a group, and photos without a score last', () => {
    const [group] = groupLeftOut([
      photo(0, { dropReason: 'not-selected', quality: 0.4 }),
      photo(1, { dropReason: 'not-selected' }),
      photo(2, { dropReason: 'not-selected', quality: 0.9 }),
    ]);
    expect(group && ids(group)).toEqual(['p2', 'p0', 'p1']);
  });

  it('calls a photo the user removed "removed", not "ranked lower", and skips empty groups', () => {
    const groups = groupLeftOut([photo(0, { selected: true })]);
    expect(groups.map((g) => g.kind)).toEqual(['removed']);
    expect(groupLeftOut([])).toEqual([]);
  });

  it('treats a missing drop reason on an unselected photo as no room', () => {
    expect(groupLeftOut([photo(0, {})]).map((g) => g.kind)).toEqual(['not-selected']);
  });
});

describe('left-out wording', () => {
  it('never says "blurry" and shows no raw number', () => {
    expect(dropReasonText('blurry')).not.toMatch(/blurry/i);
    expect(dropReasonText('blurry')).not.toMatch(/\d/);
  });
});
