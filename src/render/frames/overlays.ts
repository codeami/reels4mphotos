import type { GradeFill } from '../../looks';
import {
  GRAIN_TILE,
  grainOffset,
  letterboxBarHeight,
  noiseTile,
  vignetteGeometry,
} from './effects';
import type { RenderCanvas, RenderContext } from './canvas';
import type { ScratchFactory } from './backdrop';

// The small drawing helpers a look is made of. Each reads only its arguments and leaves the
// context state (alpha, blend mode) as it found it.

export function drawFlash(ctx: RenderContext, width: number, height: number, alpha: number): void {
  if (alpha <= 0) return;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = 1;
}

export function drawLetterbox(
  ctx: RenderContext,
  width: number,
  height: number,
  fraction: number,
): void {
  const bar = letterboxBarHeight(height, fraction);
  if (bar <= 0) return;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, bar);
  ctx.fillRect(0, height - bar, width, bar);
}

// Paints the vignette once, onto a canvas the size of the frame, for the cache in LookAssets: the
// radial gradient is the expensive part, a cached copy is one plain draw per frame.
export function paintVignette(
  ctx: RenderContext,
  width: number,
  height: number,
  strength: number,
): void {
  const { cx, cy, inner, outer } = vignetteGeometry(width, height);
  const gradient = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
  gradient.addColorStop(0, 'rgba(0,0,0,0)');
  gradient.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

export function drawGrade(
  ctx: RenderContext,
  width: number,
  height: number,
  fills: readonly GradeFill[],
): void {
  for (const fill of fills) {
    ctx.globalCompositeOperation = fill.op;
    ctx.globalAlpha = fill.alpha;
    ctx.fillStyle = fill.color;
    ctx.fillRect(0, 0, width, height);
  }
  if (fills.length > 0) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
}

// One 256 px noise tile, made once from a fixed seed.
export function makeGrainTile(makeScratch: ScratchFactory): RenderCanvas {
  const canvas = makeScratch(GRAIN_TILE, GRAIN_TILE);
  const ctx = canvas.getContext('2d') as RenderContext | null;
  if (!ctx) throw new Error('2d canvas context unavailable');
  const image = ctx.createImageData(GRAIN_TILE, GRAIN_TILE);
  image.data.set(noiseTile(GRAIN_TILE));
  ctx.putImageData(image, 0, 0);
  return canvas;
}

// The tile repeated across the frame by one pattern fill, starting at a different offset on every
// frame. The tile is scaled with the frame so grain looks the same size in the preview and the
// export.
export function drawGrain(
  ctx: RenderContext,
  tile: RenderCanvas,
  width: number,
  height: number,
  frameIndex: number,
  alpha: number,
  exportWidth: number,
): void {
  if (alpha <= 0) return;
  const pattern = ctx.createPattern(tile as CanvasImageSource, 'repeat');
  if (!pattern) return;
  const size = Math.max(1, Math.round((GRAIN_TILE * width) / exportWidth));
  const offset = grainOffset(frameIndex, size);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(-offset.x, -offset.y);
  ctx.scale(size / GRAIN_TILE, size / GRAIN_TILE);
  ctx.fillStyle = pattern;
  ctx.fillRect(
    0,
    0,
    (width + offset.x) * (GRAIN_TILE / size),
    (height + offset.y) * (GRAIN_TILE / size),
  );
  ctx.restore();
}
