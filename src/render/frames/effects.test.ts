import { describe, expect, it } from 'vitest';
import { LOOKS } from '../../looks';
import { FRAME_HEIGHT, FRAME_WIDTH } from '../constants';
import {
  GRAIN_TILE,
  destRect,
  exposedStrips,
  ease,
  flashAlpha,
  grainOffset,
  letterboxBarHeight,
  mulberry32,
  noiseTile,
  punchScale,
  shakeOffset,
  vignetteGeometry,
} from './effects';

const ZOOM = LOOKS['zoom-punch'].punch;
const FLASH_PUNCH = LOOKS['flash-cut'].punch;
const FLASH = LOOKS['flash-cut'].flash;

describe('ease', () => {
  it('runs from 0 to 1 and clamps outside', () => {
    for (const easing of ['linear', 'ease-out-cubic', 'smoothstep'] as const) {
      expect(ease(easing, 0)).toBe(0);
      expect(ease(easing, 1)).toBe(1);
      expect(ease(easing, -3)).toBe(0);
      expect(ease(easing, 9)).toBe(1);
    }
  });

  it('ease-out-cubic is fast first, smoothstep is symmetric', () => {
    expect(ease('ease-out-cubic', 0.5)).toBeCloseTo(0.875, 12);
    expect(ease('smoothstep', 0.5)).toBe(0.5);
    expect(ease('linear', 0.25)).toBe(0.25);
  });
});

describe('punchScale', () => {
  it('is 1 for a look with no punch and before the cut', () => {
    expect(punchScale(3, null)).toBe(1);
    expect(punchScale(-2, ZOOM)).toBe(1);
  });

  it('pushes in from 1.00 to 1.12 over 6 frames, ease-out (zoom-punch recipe)', () => {
    expect(punchScale(0, ZOOM)).toBe(1);
    expect(punchScale(3, ZOOM)).toBeCloseTo(1 + 0.12 * 0.875, 12);
    expect(punchScale(6, ZOOM)).toBeCloseTo(1.12, 12);
  });

  it('never goes backwards while it pushes in, then drifts slowly', () => {
    const scales = Array.from({ length: 7 }, (_, age) => punchScale(age, ZOOM));
    expect([...scales].sort((a, b) => a - b)).toEqual(scales);
    expect(punchScale(36, ZOOM)).toBeCloseTo(1.12 + 0.02, 12); // one second later
  });

  it('settles from 1.05 back to 1.0 over 4 frames for flash-cut, with no drift', () => {
    expect(punchScale(0, FLASH_PUNCH)).toBeCloseTo(1.05, 12);
    expect(punchScale(2, FLASH_PUNCH)).toBeCloseTo(1.025, 12);
    expect(punchScale(4, FLASH_PUNCH)).toBeCloseTo(1, 12);
    expect(punchScale(40, FLASH_PUNCH)).toBeCloseTo(1, 12);
  });
});

describe('flashAlpha', () => {
  it('starts at the peak on the cut and fades linearly to nothing (flash-cut recipe)', () => {
    expect([0, 1, 2, 3].map((age) => flashAlpha(age, FLASH))).toEqual(
      [0.8, 0.6, 0.4, 0.2].map((v) => expect.closeTo(v, 12)),
    );
  });

  it('is off before the cut, after its frames, and for looks without a flash', () => {
    expect(flashAlpha(-1, FLASH)).toBe(0);
    expect(flashAlpha(4, FLASH)).toBe(0);
    expect(flashAlpha(0, null)).toBe(0);
  });
});

describe('letterboxBarHeight', () => {
  it('is a fraction of the frame height, rounded to a pixel', () => {
    expect(letterboxBarHeight(FRAME_HEIGHT, 0.1)).toBe(192);
    expect(letterboxBarHeight(960, 0.1)).toBe(96);
  });

  it('never grows past half the frame or below nothing', () => {
    expect(letterboxBarHeight(1000, 0.9)).toBe(500);
    expect(letterboxBarHeight(1000, -1)).toBe(0);
    expect(letterboxBarHeight(1000, 0)).toBe(0);
  });
});

describe('shakeOffset', () => {
  it('is the same every time for a frame, and stays within the amplitude', () => {
    for (let frame = 0; frame < 300; frame++) {
      const a = shakeOffset(frame, 0.004, FRAME_WIDTH);
      expect(shakeOffset(frame, 0.004, FRAME_WIDTH)).toEqual(a);
      expect(Math.abs(a.dx)).toBeLessThanOrEqual(0.004 * FRAME_WIDTH + 1e-9);
      expect(Math.abs(a.dy)).toBeLessThanOrEqual(0.004 * FRAME_WIDTH + 1e-9);
    }
  });

  it('wanders instead of standing still, and is zero for amplitude 0', () => {
    const xs = new Set(Array.from({ length: 30 }, (_, f) => shakeOffset(f, 0.004, FRAME_WIDTH).dx));
    expect(xs.size).toBeGreaterThan(20);
    expect(shakeOffset(7, 0, FRAME_WIDTH).dx).toBeCloseTo(0, 12);
  });
});

describe('grain', () => {
  it('draws the same offset for a frame every render, and a new one for the next frame', () => {
    expect(grainOffset(12, GRAIN_TILE)).toEqual(grainOffset(12, GRAIN_TILE));
    const offsets = new Set(
      Array.from({ length: 60 }, (_, f) => JSON.stringify(grainOffset(f, GRAIN_TILE))),
    );
    expect(offsets.size).toBeGreaterThan(55);
  });

  it('keeps the offset inside the tile', () => {
    for (let f = 0; f < 500; f++) {
      const { x, y } = grainOffset(f, GRAIN_TILE);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(GRAIN_TILE);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThan(GRAIN_TILE);
    }
  });

  it('makes a fixed grey noise tile with a spread of values', () => {
    const tile = noiseTile(GRAIN_TILE);
    expect(Buffer.from(tile).equals(Buffer.from(noiseTile(GRAIN_TILE)))).toBe(true);
    expect(tile.length).toBe(GRAIN_TILE * GRAIN_TILE * 4);
    let min = 255;
    let max = 0;
    let greyAndOpaque = true;
    for (let i = 0; i < tile.length; i += 4) {
      const v = tile[i] ?? 0;
      if (v !== tile[i + 1] || v !== tile[i + 2] || tile[i + 3] !== 255) greyAndOpaque = false;
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    expect(greyAndOpaque).toBe(true);
    expect(min).toBeLessThan(10);
    expect(max).toBeGreaterThan(245);
  });

  it('mulberry32 repeats for a seed and stays in [0, 1)', () => {
    const a = mulberry32(5);
    const b = mulberry32(5);
    for (let i = 0; i < 100; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('vignetteGeometry', () => {
  it('is centred, clear in the middle and full strength at the corners', () => {
    const g = vignetteGeometry(1080, 1920);
    expect(g.cx).toBe(540);
    expect(g.cy).toBe(960);
    expect(g.outer).toBeCloseTo(Math.hypot(1080, 1920) / 2, 9);
    expect(g.inner).toBeGreaterThan(0);
    expect(g.inner).toBeLessThan(g.outer);
  });
});

describe('destRect', () => {
  const frame = { width: FRAME_WIDTH, height: FRAME_HEIGHT };
  const none = { dx: 0, dy: 0 };

  it('cover fills the whole frame at scale 1', () => {
    expect(destRect('cover', { sw: 1687, sh: 3000 }, frame, 1, none)).toEqual({
      x: 0,
      y: 0,
      w: FRAME_WIDTH,
      h: FRAME_HEIGHT,
    });
  });

  it('contain fits a landscape crop to the frame width and centres it', () => {
    const d = destRect('contain', { sw: 4000, sh: 3000 }, frame, 1, none);
    expect(d.w).toBe(1080);
    expect(d.h).toBe(810);
    expect(d.x).toBe(0);
    expect(d.y).toBe((1920 - 810) / 2);
  });

  it('contain fits a tall crop to the frame height', () => {
    const d = destRect('contain', { sw: 1000, sh: 4000 }, frame, 1, none);
    expect(d.h).toBe(1920);
    expect(d.w).toBe(480);
    expect(d.x).toBe((1080 - 480) / 2);
  });

  it('scales about the centre of the frame, then shifts', () => {
    const d = destRect('contain', { sw: 4000, sh: 3000 }, frame, 1.12, { dx: 4, dy: -3 });
    expect(d.w).toBeCloseTo(1080 * 1.12, 9);
    expect(d.x + d.w / 2).toBeCloseTo(540 + 4, 9);
    expect(d.y + d.h / 2).toBeCloseTo(960 - 3, 9);
  });
});

describe('exposedStrips', () => {
  const frame = { width: 1080, height: 1920 };
  const area = (rs: { w: number; h: number }[]) => rs.reduce((a, r) => a + r.w * r.h, 0);

  it('is the bands above and below a landscape photo', () => {
    const dest = { x: 0, y: 555, w: 1080, h: 810 };
    expect(exposedStrips(dest, frame)).toEqual([
      { x: 0, y: 0, w: 1080, h: 555 },
      { x: 0, y: 1365, w: 1080, h: 555 },
    ]);
  });

  it('is the sides of a narrow photo', () => {
    const strips = exposedStrips({ x: 300, y: 0, w: 480, h: 1920 }, frame);
    expect(strips).toEqual([
      { x: 0, y: 0, w: 300, h: 1920 },
      { x: 780, y: 0, w: 300, h: 1920 },
    ]);
  });

  it('adds up with the photo to exactly the frame, with no overlap, when the photo is inside it', () => {
    const dest = { x: 100, y: 400, w: 700, h: 900 };
    expect(area(exposedStrips(dest, frame)) + dest.w * dest.h).toBe(1080 * 1920);
  });

  it('is empty once the photo covers the frame, and clips a photo that overflows it', () => {
    expect(exposedStrips({ x: -50, y: -80, w: 1200, h: 2100 }, frame)).toEqual([]);
    expect(exposedStrips({ x: -50, y: 500, w: 1200, h: 900 }, frame)).toEqual([
      { x: 0, y: 0, w: 1080, h: 500 },
      { x: 0, y: 1400, w: 1080, h: 520 },
    ]);
  });
});
