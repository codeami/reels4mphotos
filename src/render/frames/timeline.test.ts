/* eslint-disable @typescript-eslint/no-non-null-assertion -- the fixtures indexed here always exist */
import { describe, expect, it } from 'vitest';
import { CROSSFADE_FRAMES, FPS } from '../constants';
import type { ReelPlan } from '../../types/reel-plan';
import { buildFixtureReel } from '../testing/fixture-plan';
import { buildTimeline } from './timeline';

const FRAME_MS = 1000 / FPS;

describe('buildTimeline', () => {
  const { plan, beatmap } = buildFixtureReel();
  const timeline = buildTimeline(plan);

  it('produces duration x fps frames', () => {
    expect(timeline.frameCount).toBe((plan.totalMs / 1000) * FPS);
    expect(timeline.frameCount).toBe(600);
  });

  it('starts every shot on the frame of its beat', () => {
    plan.shots.forEach((shot, k) => {
      expect(timeline.shotStartFrames[k]).toBe(Math.round((shot.startMs * FPS) / 1000));
      expect(beatmap.beatsMs).toContain(shot.startMs);
    });
  });

  it('keeps shot boundaries within half a frame of the beat when beats fall between frames', () => {
    const offGrid = buildFixtureReel({ bpm: 128, beatsPerShot: 3, shotCount: 12 });
    const offGridTimeline = buildTimeline(offGrid.plan);
    offGrid.plan.shots.forEach((shot, k) => {
      const frameTimeMs = (offGridTimeline.shotStartFrames[k]! * 1000) / FPS;
      expect(Math.abs(frameTimeMs - shot.startMs)).toBeLessThanOrEqual(FRAME_MS / 2 + 1e-9);
    });
  });

  it('partitions the frames so the shot frame counts sum to the total', () => {
    const sum = timeline.shotFrameCounts.reduce((a, b) => a + b, 0);
    expect(sum).toBe(timeline.frameCount);
    timeline.shotFrameCounts.forEach((n) => expect(n).toBeGreaterThan(0));
  });

  it('shows a single opaque layer for a cut, switching exactly on the boundary frame', () => {
    const cutShot = plan.shots.findIndex((s, k) => k > 0 && s.transition === 'cut');
    const boundary = timeline.shotStartFrames[cutShot]!;
    const before = timeline.describeFrame(boundary - 1);
    const at = timeline.describeFrame(boundary);
    expect(before.layers).toEqual([{ shotIndex: cutShot - 1, progress: 1, alpha: 1 }]);
    expect(at.layers).toEqual([{ shotIndex: cutShot, progress: 0, alpha: 1 }]);
  });

  it('gives the first and last frame of a shot the from and to poses', () => {
    const k = 1;
    const first = timeline.describeFrame(timeline.shotStartFrames[k]!).layers[0]!;
    const last = timeline.describeFrame(timeline.shotStartFrames[k + 1]! - 1).layers[0]!;
    expect(first.progress).toBe(0);
    expect(last.progress).toBe(1);
  });

  it('occupies exactly CROSSFADE_FRAMES frames per crossfade, centred on the beat', () => {
    const crossfades = plan.shots.flatMap((s, k) =>
      k > 0 && s.transition === 'crossfade' ? [k] : [],
    );
    expect(crossfades.length).toBeGreaterThan(0);
    expect(timeline.transitions.map((t) => t.shotIndex)).toEqual(crossfades);

    for (const k of crossfades) {
      const boundary = timeline.shotStartFrames[k]!;
      const window = timeline.transitions.find((t) => t.shotIndex === k)!;
      expect(window.frameCount).toBe(CROSSFADE_FRAMES);
      expect(window.startFrame).toBe(boundary - CROSSFADE_FRAMES / 2);

      const blended = Array.from({ length: timeline.frameCount }, (_, i) => i).filter(
        (i) =>
          timeline.describeFrame(i).layers.length === 2 &&
          timeline.describeFrame(i).layers[1]!.shotIndex === k,
      );
      expect(blended).toHaveLength(CROSSFADE_FRAMES);
      expect(blended[0]).toBe(window.startFrame);
      expect(blended.at(-1)).toBe(window.startFrame + CROSSFADE_FRAMES - 1);
    }
  });

  it('fades the incoming shot in strictly between 0 and 1, rising, symmetric about the beat', () => {
    const k = timeline.transitions[0]!.shotIndex;
    const { startFrame, frameCount } = timeline.transitions[0]!;
    const alphas = Array.from(
      { length: frameCount },
      (_, n) => timeline.describeFrame(startFrame + n).layers[1]!.alpha,
    );
    alphas.forEach((a) => {
      expect(a).toBeGreaterThan(0);
      expect(a).toBeLessThan(1);
    });
    expect([...alphas].sort((a, b) => a - b)).toEqual(alphas);
    const half = frameCount / 2;
    expect(alphas[half - 1]! + alphas[half]!).toBeCloseTo(1, 10);
    expect(timeline.describeFrame(startFrame).layers[0]!.shotIndex).toBe(k - 1);
  });

  it('never blends a shot that is not adjacent to a crossfade', () => {
    for (let i = 0; i < timeline.frameCount; i++) {
      const { layers } = timeline.describeFrame(i);
      expect(layers.length).toBeLessThanOrEqual(2);
      expect(layers[0]!.alpha).toBe(1);
    }
  });

  it('is deterministic: the same plan describes the same frames', () => {
    const again = buildTimeline(structuredClone(plan));
    for (const i of [0, 59, 60, 61, 119, 300, 599]) {
      expect(again.describeFrame(i)).toEqual(timeline.describeFrame(i));
    }
  });

  it('shrinks a crossfade between shots too short to hold it, or drops it below 2 frames', () => {
    const shortPlan: ReelPlan = {
      ...plan,
      totalMs: 1000,
      shots: [
        { ...plan.shots[0]!, startMs: 0, durationMs: 500 },
        { ...plan.shots[1]!, startMs: 500, durationMs: 300, transition: 'crossfade' },
        { ...plan.shots[2]!, startMs: 800, durationMs: 200, transition: 'crossfade' },
      ],
    };
    const short = buildTimeline(shortPlan);
    for (const w of short.transitions) {
      const k = w.shotIndex;
      expect(w.frameCount).toBeLessThanOrEqual(
        Math.min(short.shotFrameCounts[k - 1]!, short.shotFrameCounts[k]!),
      );
    }
    const blendedFrames = Array.from({ length: short.frameCount }, (_, i) =>
      short.describeFrame(i),
    ).filter((d) => d.layers.length === 2);
    blendedFrames.forEach((d) => expect(d.layers[1]!.alpha).toBeGreaterThan(0));
    // crossfade windows never overlap
    const claimed = short.transitions.flatMap((w) =>
      Array.from({ length: w.frameCount }, (_, n) => w.startFrame + n),
    );
    expect(new Set(claimed).size).toBe(claimed.length);
  });

  it('ignores a crossfade requested on the first shot', () => {
    const first = buildTimeline({
      ...plan,
      shots: plan.shots.map((s, k) => (k === 0 ? { ...s, transition: 'crossfade' } : s)),
    });
    expect(first.describeFrame(0).layers).toHaveLength(1);
  });
});
