import { describe, expect, it } from 'vitest';
import { buildPlan } from './plan';
import { orderForStructure, structuredCut } from './structure';
import { syntheticBeatMap } from './__fixtures__/beatmap';
import { LOOKS, type Structure } from '../looks';
import type { PlanPhoto } from './types';

const STRUCTURE: Structure = {
  hook: { unit: 'beats', length: 4, beatsPerPhoto: 1, bestPhoto: true },
  beats: [
    { name: 'build', beatsPerPhoto: 2, photos: 3 },
    { name: 'settle', beatsPerPhoto: 4 },
  ],
  payoff: { beatsPerPhoto: 6, bestPhoto: true },
  textSlots: [],
};

const photos = (qualities: (number | undefined)[]): PlanPhoto[] =>
  qualities.map((quality, i) => ({ photoId: `p${i}`, width: 3000, height: 4000, quality }));
const ids = (list: PlanPhoto[]) => list.map((p) => p.photoId);

describe('orderForStructure', () => {
  it('puts the best photo first and the next best last when the recipe asks for both', () => {
    const order = orderForStructure(photos([0.5, 0.9, 0.2, 0.8, 0.4]), STRUCTURE);
    expect(ids(order)).toEqual(['p1', 'p0', 'p2', 'p4', 'p3']);
  });

  it('keeps the reel order when no score is known, and for a flag left off', () => {
    expect(ids(orderForStructure(photos([0.5, undefined, 0.2]), STRUCTURE))).toEqual([
      'p0',
      'p1',
      'p2',
    ]);
    const hookOnly = { ...STRUCTURE, payoff: { beatsPerPhoto: 6 } };
    expect(ids(orderForStructure(photos([0.5, 0.9, 0.2, 0.8]), hookOnly))).toEqual([
      'p1',
      'p0',
      'p2',
      'p3',
    ]);
  });
});

describe('structuredCut', () => {
  it('runs hook, sections and payoff in order with their beats per photo', () => {
    const cut = structuredCut(photos([0.1, 0.9, 0.5, 0.4, 0.3, 0.2]), STRUCTURE, 500, 40, 3);
    expect(cut?.beatsPerShot.slice(0, 4)).toEqual([1, 1, 1, 1]); // hook: 4 beats
    expect(cut?.beatsPerShot.slice(4, 7)).toEqual([2, 2, 2]); // build: 3 photos
    expect(cut?.beatsPerShot.slice(7, -1).every((n) => n === 4)).toBe(true); // settle: the rest
    expect(cut?.beatsPerShot.at(-1)).toBe(6); // payoff
    expect(cut?.photos[0]?.photoId).toBe('p1');
    expect(cut?.photos.at(-1)?.photoId).toBe('p2');
  });

  it('measures a hook given in seconds against the beat length', () => {
    const seconds = {
      ...STRUCTURE,
      hook: { ...STRUCTURE.hook, unit: 'seconds' as const, length: 3 },
    };
    const cut = structuredCut(photos([0.1, 0.9, 0.5, 0.4, 0.3, 0.2]), seconds, 500, 40, 3);
    expect(cut?.beatsPerShot.slice(0, 6)).toEqual([1, 1, 1, 1, 1, 1]); // 3 s = 6 beats of 500 ms
    expect(cut?.beatsPerShot[6]).toBe(2);
  });

  it('has nothing to cut without photos', () => {
    expect(structuredCut([], STRUCTURE, 500, 40, 3)).toBeNull();
  });
});

describe('buildPlan with a structure', () => {
  const beatmap = syntheticBeatMap(120, 60_000); // a beat every 500 ms
  const structured = { ...LOOKS['zoom-punch'], structure: STRUCTURE };

  it('uses beats per photo, lands near the length asked for, and ends on the payoff', () => {
    const original = LOOKS['zoom-punch'];
    (LOOKS as Record<string, unknown>)['zoom-punch'] = structured;
    try {
      const plan = buildPlan(
        photos([0.1, 0.9, 0.5, 0.4, 0.3, 0.2]),
        beatmap,
        20_000,
        0,
        'zoom-punch',
      );
      const beats = plan.shots.map((s) => s.durationMs / 500);
      expect(beats.slice(0, 4)).toEqual([1, 1, 1, 1]);
      expect(beats.at(-1)).toBe(6);
      expect(plan.shots[0]?.photoId).toBe('p1');
      expect(plan.shots.at(-1)?.photoId).toBe('p2');
      expect(plan.totalMs).toBeGreaterThanOrEqual(12_000);
      expect(plan.totalMs).toBeLessThanOrEqual(30_000);
      for (const s of plan.shots) expect(s.startMs % 500).toBe(0);
    } finally {
      (LOOKS as Record<string, unknown>)['zoom-punch'] = original;
    }
  });

  it('falls back to the look as it always was when the beats cannot carry it', () => {
    const sparse = { ...beatmap, beatsMs: [0, 4000, 8000] };
    const original = LOOKS['zoom-punch'];
    const plain = buildPlan(
      photos([0.1, 0.9, 0.5, 0.4, 0.3, 0.2]),
      sparse,
      20_000,
      0,
      'zoom-punch',
    );
    (LOOKS as Record<string, unknown>)['zoom-punch'] = structured;
    try {
      const plan = buildPlan(
        photos([0.1, 0.9, 0.5, 0.4, 0.3, 0.2]),
        sparse,
        20_000,
        0,
        'zoom-punch',
      );
      expect(plan).toEqual(plain);
    } finally {
      (LOOKS as Record<string, unknown>)['zoom-punch'] = original;
    }
  });

  it('changes nothing for a look without a structure', () => {
    const a = buildPlan(photos([0.1, 0.9, 0.5, 0.4, 0.3, 0.2]), beatmap, 20_000, 0, 'zoom-punch');
    const b = buildPlan(photos([0.9, 0.1, 0.2, 0.4, 0.3, 0.5]), beatmap, 20_000, 0, 'zoom-punch');
    expect(a.shots.map((s) => s.photoId)).toEqual(b.shots.map((s) => s.photoId));
  });
});
