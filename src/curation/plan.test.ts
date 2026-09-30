import { describe, expect, it } from 'vitest';
import { kenBurnsFor, buildPlan } from './plan';
import { syntheticBeatMap } from './__fixtures__/beatmap';

const chosen = (n: number, width = 4000, height = 3000) =>
  Array.from({ length: n }, (_, i) => ({ photoId: `p${i}`, width, height }));

describe('buildPlan', () => {
  const beatmap = syntheticBeatMap(120, 60_000); // a beat every 500 ms

  it('fills the ReelPlan header from the shared contract', () => {
    const plan = buildPlan(chosen(10), beatmap, 20_000);
    expect(plan).toMatchObject({ version: 1, width: 1080, height: 1920, fps: 30, trackId: beatmap.trackId });
  });

  it('makes one contiguous shot per photo, in the order given', () => {
    const plan = buildPlan(chosen(10), beatmap, 20_000);
    expect(plan.shots.map((s) => s.photoId)).toEqual(chosen(10).map((c) => c.photoId));
    let cursor = 0;
    for (const s of plan.shots) {
      expect(s.startMs).toBe(cursor);
      expect(s.durationMs).toBeGreaterThan(0);
      cursor += s.durationMs;
    }
    expect(plan.totalMs).toBe(cursor);
  });

  it('cuts on beats', () => {
    const plan = buildPlan(chosen(10), beatmap, 20_000);
    for (const s of plan.shots) expect(s.startMs % 500).toBe(0);
    expect(plan.totalMs % 500).toBe(0);
  });

  it('cuts only on real beats, on a map that is off the 500 ms grid', () => {
    const offGrid = syntheticBeatMap(110, 60_000); // 545.45 ms beats: even spacing would miss them
    const plan = buildPlan(chosen(10), offGrid, 20_000);
    const beats = new Set(offGrid.beatsMs);
    for (const s of plan.shots.slice(1)) expect(beats.has(s.startMs)).toBe(true);
    expect(beats.has(plan.totalMs)).toBe(true);
  });

  it.each([60, 90, 100, 110, 128, 140])('never lands under 15 s at %i bpm, even when asked for the minimum', (bpm) => {
    const { totalMs } = buildPlan(chosen(10), syntheticBeatMap(bpm, 60_000), 15_000);
    expect(totalMs).toBeGreaterThanOrEqual(15_000);
    expect(totalMs).toBeLessThanOrEqual(30_000);
  });

  it('lands the length inside the 15-30 s window', () => {
    for (const n of [5, 8, 10, 14]) {
      const { totalMs } = buildPlan(chosen(n), beatmap, 20_000);
      expect(totalMs).toBeGreaterThanOrEqual(15_000);
      expect(totalMs).toBeLessThanOrEqual(30_000);
    }
  });

  it('clamps an out-of-range duration request', () => {
    expect(buildPlan(chosen(10), beatmap, 3_000).totalMs).toBeGreaterThanOrEqual(15_000);
    expect(buildPlan(chosen(10), beatmap, 120_000).totalMs).toBeLessThanOrEqual(30_000);
  });

  it('never runs past the end of the track', () => {
    const short = syntheticBeatMap(120, 12_000);
    expect(buildPlan(chosen(10), short, 20_000).totalMs).toBeLessThanOrEqual(12_000);
  });

  it('opens with a cut and uses both transition styles', () => {
    const plan = buildPlan(chosen(10), beatmap, 20_000);
    expect(plan.shots[0]!.transition).toBe('cut');
    expect(new Set(plan.shots.map((s) => s.transition))).toEqual(new Set(['cut', 'crossfade']));
  });

  it('still produces an even plan when the beat map has no beats', () => {
    const plan = buildPlan(chosen(4), { ...beatmap, beatsMs: [] }, 20_000);
    expect(plan.shots).toHaveLength(4);
    expect(plan.totalMs).toBeGreaterThanOrEqual(15_000);
  });

  it('returns an empty plan for no photos', () => {
    const plan = buildPlan([], beatmap, 20_000);
    expect(plan.shots).toEqual([]);
    expect(plan.totalMs).toBe(0);
  });

  it('gives every shot a Ken Burns move inside the photo', () => {
    for (const s of buildPlan(chosen(10), beatmap, 20_000).shots) {
      for (const r of [s.kenBurns.from, s.kenBurns.to]) {
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.y).toBeGreaterThanOrEqual(0);
        expect(r.x + r.w).toBeLessThanOrEqual(1 + 1e-9);
        expect(r.y + r.h).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });
});

describe('kenBurnsFor', () => {
  it.each([
    ['landscape', 4000, 3000],
    ['portrait', 3000, 4000],
    ['already 9:16', 1080, 1920],
    ['panorama', 8000, 2000],
  ])('keeps the crop at 9:16 in pixels for a %s photo', (_name, w, h) => {
    for (const index of [0, 1, 2, 3]) {
      const { from, to } = kenBurnsFor(index, w, h);
      for (const r of [from, to]) expect((r.w * w) / (r.h * h)).toBeCloseTo(9 / 16, 3);
    }
  });

  it('actually moves: the start and end windows differ', () => {
    const { from, to } = kenBurnsFor(0, 4000, 3000);
    expect(from).not.toEqual(to);
  });

  it('alternates zoom direction between neighbouring shots', () => {
    const a = kenBurnsFor(0, 4000, 3000);
    const b = kenBurnsFor(1, 4000, 3000);
    expect(a.to.w).toBeLessThan(a.from.w);
    expect(b.to.w).toBeGreaterThan(b.from.w);
  });

  it('falls back to a centred 9:16 window when the size is unknown', () => {
    const { from, to } = kenBurnsFor(0, undefined, undefined);
    for (const r of [from, to]) {
      expect(r.w).toBeGreaterThan(0);
      expect(r.x + r.w).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
});
