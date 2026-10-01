import { describe, expect, it } from 'vitest';
import { measureBeatAlignment } from './beat-alignment';
import { buildFixtureReel } from './testing/fixture-plan';

describe('measureBeatAlignment', () => {
  it('reports zero error when every shot starts on a beat', () => {
    const { plan, beatmap } = buildFixtureReel();
    expect(measureBeatAlignment(plan, beatmap)).toEqual({
      boundaries: 9,
      maxErrorMs: 0,
      offBeat: [],
    });
  });

  it('flags a shot more than a frame from any beat', () => {
    const { plan, beatmap } = buildFixtureReel();
    const nudged = {
      ...plan,
      shots: plan.shots.map((s, k) => (k === 3 ? { ...s, startMs: s.startMs + 100 } : s)),
    };
    const result = measureBeatAlignment(nudged, beatmap);
    expect(result.offBeat).toEqual([3]);
    expect(result.maxErrorMs).toBe(100);
  });

  it('tolerates a sub-frame offset', () => {
    const { plan, beatmap } = buildFixtureReel();
    const nudged = {
      ...plan,
      shots: plan.shots.map((s, k) => (k === 2 ? { ...s, startMs: s.startMs + 10 } : s)),
    };
    expect(measureBeatAlignment(nudged, beatmap).offBeat).toEqual([]);
  });
});
