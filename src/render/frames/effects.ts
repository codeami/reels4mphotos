import type { Easing, Flash, Punch } from '../../looks';
import { FPS } from '../constants';

// The maths behind a look's effects. All pure: a frame still depends on nothing but (plan, photos,
// index), so the same reel renders the same pixels however fast the machine runs.

export const GRAIN_TILE = 256;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

export function ease(easing: Easing, t: number): number {
  const c = clamp01(t);
  if (easing === 'ease-out-cubic') return 1 - (1 - c) ** 3;
  if (easing === 'smoothstep') return c * c * (3 - 2 * c);
  return c;
}

// Scale of the photo `frameAge` frames after a cut: moves from `from` to `to` over `frames`
// frames, then drifts. Before the cut (a fade-in) and for a look without a punch it is 1.
export function punchScale(frameAge: number, punch: Punch | null): number {
  if (!punch || frameAge < 0) return 1;
  const t = frameAge / punch.frames;
  const base = punch.from + (punch.to - punch.from) * ease(punch.easing, t);
  return t <= 1 ? base : base + (punch.driftPerSec * (frameAge - punch.frames)) / FPS;
}

// Alpha of the white flash `frameAge` frames after a cut: `peak` on the cut, linear to nothing.
export function flashAlpha(frameAge: number, flash: Flash | null): number {
  if (!flash || frameAge < 0 || frameAge >= flash.frames) return 0;
  return flash.peak * (1 - frameAge / flash.frames);
}

// Height in pixels of one letterbox bar.
export function letterboxBarHeight(frameHeight: number, fraction: number): number {
  return Math.round(frameHeight * Math.max(0, Math.min(0.5, fraction)));
}

// Small deterministic handheld drift in pixels: two slow sines at unrelated rates, so it wanders
// instead of jittering, and never leaves +-amplitude (a fraction of frame width).
export function shakeOffset(
  frameIndex: number,
  amplitude: number,
  frameWidth: number,
): { dx: number; dy: number } {
  const peak = amplitude * frameWidth;
  return {
    dx: peak * Math.sin(frameIndex * 0.83 + 1.3),
    dy: peak * Math.sin(frameIndex * 1.07 + 0.4),
  };
}

// Mulberry32: a tiny seeded generator. Grain noise and grain offsets come from it, never Math.random.
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Where the tiled noise starts on `frameIndex`: a fresh offset every frame, the same every render.
export function grainOffset(frameIndex: number, tile: number): { x: number; y: number } {
  const random = mulberry32(Math.imul(frameIndex + 1, 0x9e3779b1));
  return { x: Math.floor(random() * tile), y: Math.floor(random() * tile) };
}

// Grey noise, one byte per channel, for a square tile; alpha 255 (it is drawn at a low globalAlpha).
export function noiseTile(size: number, seed = 1): Uint8ClampedArray {
  const random = mulberry32(seed);
  const data = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const v = Math.floor(random() * 256);
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  return data;
}

// The vignette is a radial gradient: clear inside `inner` of the way to a corner, `strength` at it.
export const VIGNETTE_INNER = 0.55;

export function vignetteGeometry(
  width: number,
  height: number,
): { cx: number; cy: number; inner: number; outer: number } {
  const outer = Math.hypot(width, height) / 2;
  return { cx: width / 2, cy: height / 2, inner: outer * VIGNETTE_INNER, outer };
}

// Fits a source of sw x sh inside a frame, centred, then scales it about the frame centre.
// `cover` fills the frame (the source is already 9:16, so this is the whole frame).
export interface DestRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function destRect(
  fit: 'cover' | 'contain',
  source: { sw: number; sh: number },
  frame: { width: number; height: number },
  scale: number,
  shift: { dx: number; dy: number },
): DestRect {
  const k = fit === 'cover' ? 1 : Math.min(frame.width / source.sw, frame.height / source.sh);
  const w = (fit === 'cover' ? frame.width : source.sw * k) * scale;
  const h = (fit === 'cover' ? frame.height : source.sh * k) * scale;
  return {
    x: (frame.width - w) / 2 + shift.dx,
    y: (frame.height - h) / 2 + shift.dy,
    w,
    h,
  };
}

// The parts of the frame a photo at `dest` leaves bare, as up to four rects that do not overlap
// (full-width bands above and below, then the sides between them). Only these need a backdrop.
export function exposedStrips(
  dest: DestRect,
  frame: { width: number; height: number },
): DestRect[] {
  const top = Math.min(frame.height, Math.max(0, dest.y));
  const bottom = Math.min(frame.height, Math.max(top, dest.y + dest.h));
  const left = Math.min(frame.width, Math.max(0, dest.x));
  const right = Math.min(frame.width, Math.max(left, dest.x + dest.w));
  const strips: DestRect[] = [
    { x: 0, y: 0, w: frame.width, h: top },
    { x: 0, y: bottom, w: frame.width, h: frame.height - bottom },
    { x: 0, y: top, w: left, h: bottom - top },
    { x: right, y: top, w: frame.width - right, h: bottom - top },
  ];
  return strips.filter((r) => r.w > 0 && r.h > 0);
}
