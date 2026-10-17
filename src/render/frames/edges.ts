import type { EdgePulse } from '../../looks';
import { at } from '../util';
import { ease } from './effects';
import type { RenderCanvas, RenderContext } from './canvas';
import type { ScratchFactory } from './backdrop';
import type { DecodedPhoto } from './draw';

// Plain image maths, no model: a grey copy of the photo, the Sobel operator over it, a threshold.
// The result is a small canvas of light lines on nothing, found once per photo and then only drawn.

export interface EdgeMapOptions {
  threshold: number;
  softness: number;
  thicken: number;
}

// The strongest edges of a photo set the scale, so a bright flash in one corner does not mute the
// rest: the 99th percentile of the edge strengths, not the maximum.
const STRONG_EDGE_PERCENTILE = 0.99;

// Grey level (Rec. 601 weights) of every pixel of an RGBA buffer.
export function lumaOf(rgba: Uint8ClampedArray, pixels: number): Float32Array {
  const luma = new Float32Array(pixels);
  for (let i = 0; i < pixels; i++) {
    luma[i] = 0.299 * at(rgba, i * 4) + 0.587 * at(rgba, i * 4 + 1) + 0.114 * at(rgba, i * 4 + 2);
  }
  return luma;
}

// Length of the Sobel gradient at every pixel; the one-pixel border has no full neighbourhood and is 0.
export function sobelMagnitude(luma: Float32Array, width: number, height: number): Float32Array {
  const out = new Float32Array(width * height);
  const l = (x: number, y: number): number => at(luma, y * width + x);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const gx =
        l(x + 1, y - 1) +
        2 * l(x + 1, y) +
        l(x + 1, y + 1) -
        l(x - 1, y - 1) -
        2 * l(x - 1, y) -
        l(x - 1, y + 1);
      const gy =
        l(x - 1, y + 1) +
        2 * l(x, y + 1) +
        l(x + 1, y + 1) -
        l(x - 1, y - 1) -
        2 * l(x, y - 1) -
        l(x + 1, y - 1);
      out[y * width + x] = Math.hypot(gx, gy);
    }
  }
  return out;
}

// The strength a "strong" edge has in this photo; 0 for a flat photo.
export function strongEdgeLevel(magnitude: Float32Array): number {
  const sorted = Float32Array.from(magnitude).sort();
  return at(
    sorted,
    Math.min(sorted.length - 1, Math.floor(sorted.length * STRONG_EDGE_PERCENTILE)),
  );
}

// Line strength 0..255 per pixel: nothing below `threshold` of the strong-edge level, full
// `softness` above it, a ramp between so the line has soft sides.
export function edgeStrength(
  magnitude: Float32Array,
  strong: number,
  threshold: number,
  softness: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(magnitude.length);
  if (strong <= 0) return out;
  const span = Math.max(1e-6, softness);
  for (let i = 0; i < magnitude.length; i++) {
    const t = (at(magnitude, i) / strong - threshold) / span;
    out[i] = Math.round(255 * Math.min(1, Math.max(0, t)));
  }
  return out;
}

// Each pixel takes the largest value within `radius` pixels (a square), which makes lines thicker.
export function thicken(
  strength: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
): Uint8ClampedArray {
  if (radius <= 0) return strength;
  const out = new Uint8ClampedArray(strength.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let best = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          best = Math.max(best, at(strength, ny * width + nx));
        }
      }
      out[y * width + x] = best;
    }
  }
  return out;
}

export function parseHex(color: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) throw new Error(`not a #rrggbb colour: ${color}`);
  const n = parseInt(at(m, 1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// RGBA bytes: one colour, with the line strength as its alpha.
export function tintStrength(
  strength: Uint8ClampedArray,
  color: readonly [number, number, number],
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(strength.length * 4);
  for (let i = 0; i < strength.length; i++) {
    out[i * 4] = color[0];
    out[i * 4 + 1] = color[1];
    out[i * 4 + 2] = color[2];
    out[i * 4 + 3] = at(strength, i);
  }
  return out;
}

// The whole of it: RGBA pixels of a photo's copy in, line pixels out.
export function edgeLines(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: EdgeMapOptions,
  color: readonly [number, number, number],
): Uint8ClampedArray {
  const magnitude = sobelMagnitude(lumaOf(rgba, width * height), width, height);
  const strength = edgeStrength(
    magnitude,
    strongEdgeLevel(magnitude),
    options.threshold,
    options.softness,
  );
  return tintStrength(thicken(strength, width, height, options.thicken), color);
}

// The edges of one photo as two canvases: the crisp lines, and a much smaller copy of them that is
// scaled up with smoothing to make the glow around them.
export interface EdgeSet {
  readonly line: RenderCanvas;
  readonly glow: RenderCanvas;
}

const GLOW_WIDTH = 40;

function contextOf(canvas: RenderCanvas, reads = false): RenderContext {
  const ctx = canvas.getContext(
    '2d',
    reads ? { willReadFrequently: true } : undefined,
  ) as RenderContext | null;
  if (!ctx) throw new Error('2d canvas context unavailable');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return ctx;
}

// The photo at `width` x `height`, shrunk in halves so a 3000 px photo is not squeezed into 256 px
// in one go.
function shrink(
  photo: DecodedPhoto,
  width: number,
  height: number,
  make: ScratchFactory,
): RenderCanvas {
  let w = photo.width;
  let h = photo.height;
  let source: CanvasImageSource = photo.image;
  while (w > width * 2) {
    w = Math.max(width, Math.round(w / 2));
    h = Math.max(height, Math.round(h / 2));
    const next = make(w, h);
    contextOf(next).drawImage(source, 0, 0, w, h);
    source = next as CanvasImageSource;
  }
  const last = make(width, height);
  contextOf(last, true).drawImage(source, 0, 0, width, height);
  return last;
}

function paint(
  make: ScratchFactory,
  width: number,
  height: number,
  pixels: Uint8ClampedArray,
): RenderCanvas {
  const canvas = make(width, height);
  const ctx = contextOf(canvas);
  const image = ctx.createImageData(width, height);
  image.data.set(pixels);
  ctx.putImageData(image, 0, 0);
  return canvas;
}

export function buildEdgeSet(photo: DecodedPhoto, look: EdgePulse, make: ScratchFactory): EdgeSet {
  const width = look.mapWidth;
  const height = Math.max(1, Math.round((width * photo.height) / photo.width));
  const { data } = contextOf(shrink(photo, width, height, make), true).getImageData(
    0,
    0,
    width,
    height,
  );
  const options = { threshold: look.threshold, softness: look.softness, thicken: look.thicken };

  const line = paint(
    make,
    width,
    height,
    edgeLines(data, width, height, options, parseHex(look.lineColor)),
  );
  // the glow: the same lines in the glow colour, averaged down to a few pixels
  const tinted = paint(
    make,
    width,
    height,
    edgeLines(data, width, height, options, parseHex(look.glowColor)),
  );
  const glowHeight = Math.max(1, Math.round((GLOW_WIDTH * height) / width));
  const glow = make(GLOW_WIDTH, glowHeight);
  contextOf(glow).drawImage(tinted as CanvasImageSource, 0, 0, GLOW_WIDTH, glowHeight);
  return { line, glow };
}

// ---- the pulse, in numbers ----

export interface PulseRing {
  readonly scale: number;
  readonly alpha: number;
}

// The outline as it is `frameAge` frames after a cut: first the steady one (it brightens on the
// cut and settles), then each expanding copy that has started and not yet faded out. Frame 0 is
// the cut; before it (a fade-in) there is no pulse.
export function pulseRings(frameAge: number, look: EdgePulse): PulseRing[] {
  const settle = frameAge < 0 ? 1 : Math.min(1, frameAge / look.ringFrames);
  const bright = (1 - settle) ** 2;
  const rings: PulseRing[] = [
    { scale: 1, alpha: look.baseAlpha + (look.peakAlpha - look.baseAlpha) * bright },
  ];
  if (frameAge < 0) return rings;
  for (let i = 0; i < look.rings; i++) {
    const t = (frameAge - i * look.ringDelayFrames) / look.ringFrames;
    if (t < 0 || t >= 1) continue;
    rings.push({
      scale: 1 + look.maxExpand * ease('ease-out-cubic', t),
      alpha: look.ringPeak * (1 - t) ** 2 * (1 - i / (look.rings + 1)),
    });
  }
  return rings;
}

// A rectangle scaled about its own centre.
export function scaledAbout(
  rect: { x: number; y: number; w: number; h: number },
  scale: number,
): { x: number; y: number; w: number; h: number } {
  const w = rect.w * scale;
  const h = rect.h * scale;
  return { x: rect.x + (rect.w - w) / 2, y: rect.y + (rect.h - h) / 2, w, h };
}
