import { describe, expect, it } from 'vitest';
import { clippedHighlights, crushedShadows, flat, makeScene } from './__fixtures__/scenes';
import { analyzeExposure } from './exposure';

describe('analyzeExposure', () => {
  it('rates a well-exposed scene high and ok', () => {
    const e = analyzeExposure(makeScene(1));
    expect(e.verdict).toBe('ok');
    expect(e.score).toBeGreaterThan(0.8);
    expect(e.shadowClip).toBeLessThan(0.02);
    expect(e.highlightClip).toBeLessThan(0.02);
  });

  it('scores a clipped-highlight frame below a well-exposed one', () => {
    const scene = makeScene(1);
    const good = analyzeExposure(scene);
    const blown = analyzeExposure(clippedHighlights(scene));
    expect(blown.score).toBeLessThan(good.score);
    expect(blown.highlightClip).toBeGreaterThan(0.3);
    expect(blown.verdict).toBe('overexposed');
  });

  it('scores crushed shadows below a well-exposed frame', () => {
    const scene = makeScene(1);
    const dark = analyzeExposure(crushedShadows(scene));
    expect(dark.score).toBeLessThan(analyzeExposure(scene).score);
    expect(dark.shadowClip).toBeGreaterThan(0.3);
    expect(dark.verdict).toBe('underexposed');
  });

  it('reports the mean luma on a 0..255 scale', () => {
    expect(analyzeExposure(flat(32, 32, 100)).meanLuma).toBeCloseTo(100, 0);
  });

  it('treats an all-white and an all-black frame as unusable', () => {
    expect(analyzeExposure(flat(32, 32, 255)).verdict).toBe('overexposed');
    expect(analyzeExposure(flat(32, 32, 0)).verdict).toBe('underexposed');
  });
});
