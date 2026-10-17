import type { Glitch } from '../../looks';
import type { RenderCanvas, RenderContext } from './canvas';
import { mulberry32, type DestRect } from './effects';

// Glitch slice: horizontal strips that slide sideways, with red, green and blue pulled apart, on
// the cut, then snap back. Every number comes from the frame age and the shot, never a clock.

// How far into the glitch a frame is: 1 on the cut, easing to 0 over `frames`, 0 before and after.
export function glitchAmount(frameAge: number, look: Glitch): number {
  if (frameAge < 0 || frameAge >= look.frames) return 0;
  return (1 - frameAge / look.frames) ** 2;
}

export interface Band {
  readonly y: number;
  readonly h: number;
}

// `count` bands of whole rows that tile the height exactly.
export function bands(height: number, count: number): Band[] {
  const out: Band[] = [];
  for (let i = 0; i < count; i++) {
    const y = Math.round((i * height) / count);
    out.push({ y, h: Math.round(((i + 1) * height) / count) - y });
  }
  return out;
}

export interface StripShift {
  // Sideways slide in pixels (0 for a strip that stays).
  readonly dx: number;
  // How far red and blue pull apart for this strip, in pixels each way.
  readonly split: number;
}

// The slide of every strip. Which strips move and by how much is drawn from a seeded generator
// that changes every two frames (a glitch flickers) and with the shot (each cut tears differently),
// and shrinks with the glitch amount. A strip that moves always splits its colours at least a
// little, so the effect shows even when its slide is small.
export function stripShifts(
  shotIndex: number,
  frameAge: number,
  amount: number,
  width: number,
  look: Glitch,
): StripShift[] {
  const random = mulberry32(Math.imul(shotIndex + 1, 7919) + Math.floor(frameAge / 2) * 104729);
  return Array.from({ length: look.strips }, () => {
    const moves = random() < look.share;
    const slide = (random() * 2 - 1) * look.peak * amount * width;
    if (amount <= 0 || !moves) return { dx: 0, split: 0 };
    return {
      dx: slide,
      split:
        Math.max(0.25, Math.abs(slide) / (look.peak * width)) *
        look.chroma *
        look.peak *
        amount *
        width,
    };
  });
}

const CHANNELS = [
  { color: '#f00', side: -1 },
  { color: '#0f0', side: 0 },
  { color: '#00f', side: 1 },
] as const;

// Draws the photo, then redraws each moving strip as three one-colour copies added together with
// 'lighter': red a little to one side, blue to the other, green in between. No pixel loops, and the
// still strips cost nothing beyond the single draw of the whole photo.
export function drawGlitch(
  ctx: RenderContext,
  scratch: RenderCanvas,
  image: CanvasImageSource,
  source: { sx: number; sy: number; sw: number; sh: number },
  dest: DestRect,
  shifts: readonly StripShift[],
  frame: { width: number; height: number },
): void {
  const draw = (target: RenderContext, x: number, y: number): void => {
    target.drawImage(
      image,
      source.sx,
      source.sy,
      source.sw,
      source.sh,
      dest.x + x,
      dest.y + y,
      dest.w,
      dest.h,
    );
  };
  draw(ctx, 0, 0);
  const sctx = scratch.getContext('2d') as RenderContext | null;
  if (!sctx) return;
  bands(frame.height, shifts.length).forEach((band, i) => {
    const shift = shifts[i];
    if (!shift || (shift.dx === 0 && shift.split === 0) || band.h <= 0) return;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, band.y, frame.width, band.h);
    for (const channel of CHANNELS) {
      sctx.globalCompositeOperation = 'source-over';
      sctx.fillStyle = '#000';
      sctx.fillRect(0, 0, frame.width, band.h);
      draw(sctx, shift.dx + channel.side * shift.split, -band.y);
      sctx.globalCompositeOperation = 'multiply';
      sctx.fillStyle = channel.color;
      sctx.fillRect(0, 0, frame.width, band.h);
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(
        scratch as CanvasImageSource,
        0,
        0,
        frame.width,
        band.h,
        0,
        band.y,
        frame.width,
        band.h,
      );
    }
  });
  ctx.globalCompositeOperation = 'source-over';
}
