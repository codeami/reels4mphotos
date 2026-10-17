import { describe, expect, it } from 'vitest';
import {
  BACKDROP_STEPS,
  BackdropCache,
  backdropKey,
  buildBackdrop,
  centreCrop,
  type ScratchFactory,
} from './backdrop';
import type { RenderCanvas } from './canvas';

// A scratch canvas that only records how it was drawn on.
interface Draw {
  args: number[];
}
function fakeScratch(): {
  make: ScratchFactory;
  canvases: { w: number; h: number; draws: Draw[] }[];
} {
  const canvases: { w: number; h: number; draws: Draw[] }[] = [];
  const make: ScratchFactory = (w, h) => {
    const draws: Draw[] = [];
    canvases.push({ w, h, draws });
    const ctx = {
      imageSmoothingEnabled: false,
      imageSmoothingQuality: 'low',
      drawImage: (_image: unknown, ...args: number[]) => draws.push({ args }),
    };
    return { getContext: () => ctx } as unknown as RenderCanvas;
  };
  return { make, canvases };
}

describe('backdropKey', () => {
  it('names a photo and a kind, so a blur and a colour fill of one photo do not collide', () => {
    expect(backdropKey('p1', 'blur')).toBe('blur:p1');
    expect(backdropKey('p1', 'blur')).not.toBe(backdropKey('p1', 'colour'));
    expect(backdropKey('p1', 'blur')).not.toBe(backdropKey('p2', 'blur'));
  });
});

describe('BackdropCache', () => {
  const canvas = (): RenderCanvas => ({}) as RenderCanvas;

  it('builds a fill once per key, however many frames ask', () => {
    const cache = new BackdropCache();
    for (let frame = 0; frame < 100; frame++) cache.get(backdropKey('p1', 'blur'), canvas);
    expect(cache.builds).toBe(1);
    cache.get(backdropKey('p2', 'blur'), canvas);
    expect(cache.builds).toBe(2);
    expect(cache.size).toBe(2);
  });

  it('returns the same canvas it built', () => {
    const cache = new BackdropCache();
    const first = cache.get('k', canvas);
    expect(cache.get('k', () => canvas())).toBe(first);
  });

  it('forgets the least recently used fill past its capacity', () => {
    const cache = new BackdropCache(2);
    cache.get('a', canvas);
    cache.get('b', canvas);
    cache.get('a', canvas); // a is now the newest
    cache.get('c', canvas); // evicts b
    expect(cache.size).toBe(2);
    const builds = cache.builds;
    cache.get('a', canvas);
    expect(cache.builds).toBe(builds);
    cache.get('b', canvas);
    expect(cache.builds).toBe(builds + 1);
  });
});

describe('centreCrop', () => {
  it('takes the largest centred part with the wanted aspect', () => {
    expect(centreCrop(4000, 3000, 9 / 16)).toEqual({ sx: 1156.25, sy: 0, sw: 1687.5, sh: 3000 });
    const tall = centreCrop(1000, 4000, 9 / 16);
    expect(tall.sw).toBe(1000);
    expect(tall.sh).toBeCloseTo(1777.78, 2);
    expect(tall.sy).toBeCloseTo((4000 - tall.sh) / 2, 9);
  });
});

describe('buildBackdrop', () => {
  const photo = { image: {} as CanvasImageSource, width: 4000, height: 3000 };

  it('shrinks the photo in steps and scales it back up: no ctx.filter involved', () => {
    const { make, canvases } = fakeScratch();
    const out = buildBackdrop(photo, 'blur', make);
    expect(canvases.map((c) => [c.w, c.h])).toEqual(
      BACKDROP_STEPS.blur.map((s) => [s.width, s.height]),
    );
    expect(canvases.every((c) => c.draws.length <= 1)).toBe(true);
    // the first hop draws a cover crop of the photo, the later ones the previous canvas whole
    const crop = centreCrop(4000, 3000, 96 / 170);
    expect(canvases[0]?.draws[0]?.args).toEqual([
      crop.sx,
      crop.sy,
      crop.sw,
      crop.sh,
      0,
      0,
      96,
      170,
    ]);
    expect(canvases[2]?.draws[0]?.args).toEqual([0, 0, 108, 192]);
    expect(out).toBeDefined();
  });

  it('ends at one pixel for a colour fill', () => {
    const { make, canvases } = fakeScratch();
    buildBackdrop(photo, 'colour', make);
    const last = canvases[canvases.length - 1];
    expect([last?.w, last?.h]).toEqual([1, 1]);
  });
});
