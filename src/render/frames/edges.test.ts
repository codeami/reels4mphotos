import { describe, expect, it } from 'vitest';
import { LOOKS } from '../../looks';
import type { RenderCanvas } from './canvas';
import {
  buildEdgeSet,
  edgeLines,
  edgeStrength,
  lumaOf,
  parseHex,
  pulseRings,
  scaledAbout,
  sobelMagnitude,
  strongEdgeLevel,
  tintStrength,
  thicken,
} from './edges';

const PULSE = LOOKS['neon-edge-pulse'].edgePulse;
if (!PULSE) throw new Error('neon-edge-pulse has no edge pulse');

// A grey image with a bright square in the middle: RGBA bytes, width x height.
function squareImage(width: number, height: number, from: number, to: number): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inside = x >= from && x < to && y >= from && y < to;
      const v = inside ? 255 : 20;
      rgba.set([v, v, v, 255], (y * width + x) * 4);
    }
  }
  return rgba;
}

describe('lumaOf', () => {
  it('weights green most and keeps white at 255', () => {
    const luma = lumaOf(
      new Uint8ClampedArray([255, 255, 255, 255, 255, 0, 0, 255, 0, 255, 0, 255]),
      3,
    );
    expect(luma[0]).toBeCloseTo(255, 3);
    expect(luma[1]).toBeCloseTo(0.299 * 255, 3);
    expect(luma[2]).toBeCloseTo(0.587 * 255, 3);
  });
});

describe('sobelMagnitude', () => {
  it('is 0 on a flat image and at the border', () => {
    const flat = new Float32Array(25).fill(90);
    expect([...sobelMagnitude(flat, 5, 5)].every((v) => v === 0)).toBe(true);
  });

  it('is strong along the side of a step and 0 away from it', () => {
    // left half dark, right half bright, 6 wide
    const luma = new Float32Array(6 * 6);
    for (let y = 0; y < 6; y++) for (let x = 3; x < 6; x++) luma[y * 6 + x] = 100;
    const mag = sobelMagnitude(luma, 6, 6);
    expect(mag[2 * 6 + 2]).toBe(400); // (1+2+1) * 100, on the dark side of the step
    expect(mag[2 * 6 + 3]).toBe(400);
    expect(mag[2 * 6 + 1]).toBe(0);
  });
});

describe('edgeStrength', () => {
  it('is 0 below the threshold, 255 above threshold + softness, a ramp between', () => {
    const out = edgeStrength(new Float32Array([0, 0.2, 0.35, 0.5, 1, 3]), 1, 0.2, 0.3);
    expect([...out].filter((_, i) => i !== 2)).toEqual([0, 0, 255, 255, 255]);
    expect(out[2]).toBeGreaterThanOrEqual(126);
    expect(out[2]).toBeLessThanOrEqual(129);
  });

  it('gives nothing for a flat photo, whose strong-edge level is 0', () => {
    expect([...edgeStrength(new Float32Array([0, 0]), 0, 0.2, 0.3)]).toEqual([0, 0]);
    expect(strongEdgeLevel(new Float32Array(100))).toBe(0);
  });

  it('takes the 99th percentile as the strong level, so one hot pixel does not mute the rest', () => {
    const mag = new Float32Array(1000).fill(10);
    mag[0] = 100_000;
    expect(strongEdgeLevel(mag)).toBe(10);
  });
});

describe('thicken', () => {
  it('spreads a single line pixel to its neighbours and leaves radius 0 alone', () => {
    const one = new Uint8ClampedArray(25);
    one[12] = 200;
    expect(thicken(one, 5, 5, 0)).toBe(one);
    const wide = thicken(one, 5, 5, 1);
    expect([...wide].filter((v) => v === 200)).toHaveLength(9);
    expect(wide[0]).toBe(0);
  });
});

describe('edge lines of a picture', () => {
  const options = { threshold: 0.22, softness: 0.3, thicken: 0 };
  const width = 40;
  const lines = edgeLines(squareImage(width, width, 10, 30), width, width, options, [10, 20, 30]);
  const alpha = (x: number, y: number): number => lines[(y * width + x) * 4 + 3] ?? -1;

  it('draws lines along the border of a bright square, nowhere in its middle or the empty corners', () => {
    expect(Math.max(alpha(10, 20), alpha(9, 20))).toBe(255);
    expect(Math.max(alpha(20, 10), alpha(20, 9))).toBe(255);
    expect(alpha(20, 20)).toBe(0);
    expect(alpha(3, 3)).toBe(0);
  });

  it('paints the lines in the colour asked for, whatever the photo colours were', () => {
    const base = (10 * width + 20) * 4;
    expect([...lines.slice(base, base + 3)]).toEqual([10, 20, 30]);
  });

  it('finds nothing in a photo with no edges', () => {
    const flat = edgeLines(squareImage(width, width, 0, 0), width, width, options, [255, 255, 255]);
    expect([...flat].filter((v, i) => i % 4 === 3 && v > 0)).toEqual([]);
  });

  it('keeps more of the faint lines when the threshold is lower', () => {
    const count = (threshold: number): number =>
      [
        ...edgeLines(
          squareImage(width, width, 10, 30),
          width,
          width,
          { ...options, threshold },
          [0, 0, 0],
        ),
      ].filter((v, i) => i % 4 === 3 && v > 0).length;
    expect(count(0.05)).toBeGreaterThanOrEqual(count(0.6));
  });
});

describe('parseHex and tintStrength', () => {
  it('reads #rrggbb and refuses anything else', () => {
    expect(parseHex('#14b8ff')).toEqual([20, 184, 255]);
    expect(() => parseHex('cyan')).toThrow(/#rrggbb/);
  });

  it('puts the strength in the alpha channel', () => {
    expect([...tintStrength(new Uint8ClampedArray([0, 77]), [1, 2, 3])]).toEqual([
      1, 2, 3, 0, 1, 2, 3, 77,
    ]);
  });
});

describe('pulseRings', () => {
  it('has only the steady outline before the cut', () => {
    expect(pulseRings(-3, PULSE)).toEqual([{ scale: 1, alpha: PULSE.baseAlpha }]);
  });

  it('is at peak brightness on the cut and settles to the steady level', () => {
    expect(pulseRings(0, PULSE)[0]?.alpha).toBeCloseTo(PULSE.peakAlpha, 12);
    expect(pulseRings(PULSE.ringFrames, PULSE)[0]?.alpha).toBeCloseTo(PULSE.baseAlpha, 12);
  });

  it('starts one ring on the cut, adds the others a few frames apart, and keeps each one growing and fading', () => {
    expect(pulseRings(0, PULSE)).toHaveLength(2);
    expect(pulseRings(PULSE.ringDelayFrames * 2, PULSE)).toHaveLength(1 + PULSE.rings);
    const first = (age: number) => pulseRings(age, PULSE)[1];
    expect(first(8)?.scale).toBeGreaterThan(first(2)?.scale ?? 0);
    expect(first(8)?.alpha).toBeLessThan(first(2)?.alpha ?? 0);
    expect(first(2)?.scale).toBeGreaterThan(1);
    expect(first(2)?.scale).toBeLessThanOrEqual(1 + PULSE.maxExpand);
  });

  it('has nothing left but the steady outline once every ring has died', () => {
    const late = PULSE.ringDelayFrames * PULSE.rings + PULSE.ringFrames;
    expect(pulseRings(late, PULSE)).toHaveLength(1);
  });
});

describe('scaledAbout', () => {
  it('grows a rectangle around its own centre', () => {
    expect(scaledAbout({ x: 10, y: 20, w: 100, h: 200 }, 1.5)).toEqual({
      x: -15,
      y: -30,
      w: 150,
      h: 300,
    });
    expect(scaledAbout({ x: 10, y: 20, w: 100, h: 200 }, 1)).toEqual({
      x: 10,
      y: 20,
      w: 100,
      h: 200,
    });
  });
});

describe('buildEdgeSet', () => {
  // canvases that keep the pixels put on them and answer getImageData with a fixed picture
  function fakeCanvas(
    width: number,
    height: number,
    picture: Uint8ClampedArray | null,
  ): RenderCanvas {
    let put: Uint8ClampedArray | null = null;
    const ctx = {
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'low',
      drawImage: () => undefined,
      getImageData: () => ({ data: picture ?? new Uint8ClampedArray(width * height * 4) }),
      createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      putImageData: (image: { data: Uint8ClampedArray }) => {
        put = image.data;
      },
    };
    return {
      width,
      height,
      getContext: () => ctx,
      get put() {
        return put;
      },
    } as unknown as RenderCanvas;
  }

  it('finds the edges on a copy as wide as the look says and keeps the photo shape', () => {
    const made: [number, number][] = [];
    const width = PULSE.mapWidth;
    const picture = squareImage(width, Math.round((width * 3) / 4), 80, 170);
    const set = buildEdgeSet(
      { image: {} as CanvasImageSource, width: 4000, height: 3000 },
      PULSE,
      (w, h) => {
        made.push([w, h]);
        return fakeCanvas(w, h, picture);
      },
    );
    expect(set.line.width).toBe(width);
    expect(set.line.height).toBe(Math.round((width * 3) / 4));
    expect(set.glow.width).toBeLessThan(set.line.width);
    // 4000 px is shrunk in halves before it is squeezed into the map
    expect(made.filter(([w]) => w > width)).not.toHaveLength(0);
    const lines = (set.line as unknown as { put: Uint8ClampedArray | null }).put;
    expect(lines?.some((v, i) => i % 4 === 3 && v > 0)).toBe(true);
  });
});
