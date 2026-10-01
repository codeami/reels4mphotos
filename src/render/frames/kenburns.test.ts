import { describe, expect, it } from 'vitest';
import { FRAME_HEIGHT, FRAME_WIDTH } from '../constants';
import { RenderError } from '../errors';
import { assertCropAspect, interpolateRect, smoothstep, sourceRectFor } from './kenburns';

const ASPECT = FRAME_WIDTH / FRAME_HEIGHT;

// 9:16 crops of a 4000x3000 photo: 1687.5 x 3000 px, and a tighter 1265.625 x 2250 px.
const FULL_HEIGHT = { x: 0.25, y: 0, w: 0.421875, h: 1 };
const TIGHT = { x: 0.3, y: 0.1, w: 0.31640625, h: 0.75 };

describe('smoothstep', () => {
  it('eases between 0 and 1 and is symmetric', () => {
    expect(smoothstep(0)).toBe(0);
    expect(smoothstep(1)).toBe(1);
    expect(smoothstep(0.5)).toBe(0.5);
    expect(smoothstep(0.25) + smoothstep(0.75)).toBeCloseTo(1, 12);
  });

  it('clamps outside 0..1', () => {
    expect(smoothstep(-1)).toBe(0);
    expect(smoothstep(2)).toBe(1);
  });
});

describe('interpolateRect', () => {
  it('returns the endpoints at t = 0 and t = 1', () => {
    const from = { x: 0, y: 0, w: 1, h: 1 };
    const to = { x: 0.2, y: 0.3, w: 0.5, h: 0.4 };
    expect(interpolateRect(from, to, 0)).toEqual(from);
    expect(interpolateRect(from, to, 1)).toEqual(to);
    expect(interpolateRect(from, to, 0.5)).toEqual({ x: 0.1, y: 0.15, w: 0.75, h: 0.7 });
  });

  it('keeps the 9:16 aspect all the way between two 9:16 crops', () => {
    for (const t of [0, 0.1, 0.37, 0.5, 0.9, 1]) {
      const r = interpolateRect(FULL_HEIGHT, TIGHT, t);
      expect((r.w * 4000) / (r.h * 3000)).toBeCloseTo(ASPECT, 9);
    }
  });
});

describe('assertCropAspect', () => {
  it('accepts a crop that is 9:16 in the photo pixels, whatever the photo shape', () => {
    expect(() => assertCropAspect(FULL_HEIGHT, 4000, 3000, 'crop')).not.toThrow();
    // portrait 3:4 photo: a 9:16 crop is 0.75 wide and full height
    expect(() =>
      assertCropAspect({ x: 0.125, y: 0, w: 0.75, h: 1 }, 3000, 4000, 'crop'),
    ).not.toThrow();
  });

  it('tolerates the rounding a JSON plan carries', () => {
    expect(() =>
      assertCropAspect({ x: 0.25, y: 0, w: 0.4219, h: 1 }, 4000, 3000, 'crop'),
    ).not.toThrow();
  });

  it('refuses a crop of another shape rather than stretching the photo', () => {
    expect(() => assertCropAspect({ x: 0, y: 0, w: 1, h: 1 }, 4000, 3000, 'crop')).toThrow(
      RenderError,
    );
    expect(() => assertCropAspect({ x: 0, y: 0, w: 1, h: 1 }, 4000, 3000, 'crop')).toThrow(
      /not 9:16/,
    );
  });

  it('refuses a rect that was normalised against the wrong photo dimensions', () => {
    // a correct crop for a 4:3 landscape photo is not 9:16 on the same photo turned portrait
    expect(() => assertCropAspect(FULL_HEIGHT, 3000, 4000, 'crop')).toThrow(RenderError);
  });
});

describe('sourceRectFor', () => {
  const shot = {
    photoId: 'a',
    startMs: 0,
    durationMs: 2000,
    transition: 'cut' as const,
    kenBurns: { from: FULL_HEIGHT, to: TIGHT },
  };

  it('maps the crop straight onto source pixels', () => {
    expect(sourceRectFor(shot, 0, 4000, 3000)).toEqual({ sx: 1000, sy: 0, sw: 1687.5, sh: 3000 });
    expect(sourceRectFor(shot, 1, 4000, 3000)).toEqual({
      sx: 1200,
      sy: 300,
      sw: 1265.625,
      sh: 2250,
    });
  });

  it('eases: the first quarter of the progress covers well under a quarter of the move', () => {
    const start = sourceRectFor(shot, 0, 4000, 3000);
    const quarter = sourceRectFor(shot, 0.25, 4000, 3000);
    const end = sourceRectFor(shot, 1, 4000, 3000);
    const moved = (start.sh - quarter.sh) / (start.sh - end.sh);
    expect(moved).toBeGreaterThan(0);
    expect(moved).toBeLessThan(0.25);
  });

  it('draws every in-between crop at exactly the frame aspect', () => {
    for (const progress of [0, 0.2, 0.5, 0.8, 1]) {
      const r = sourceRectFor(shot, progress, 4000, 3000);
      expect(r.sw / r.sh).toBeCloseTo(ASPECT, 9);
    }
  });

  it('throws on a shot whose crops are not 9:16 for the decoded photo', () => {
    expect(() => sourceRectFor(shot, 0, 3000, 4000)).toThrow(/photo "a" kenBurns\.from/);
  });
});
