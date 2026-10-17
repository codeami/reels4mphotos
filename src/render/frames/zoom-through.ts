import type { ZoomThrough } from '../../looks';
import type { RenderContext } from './canvas';
import type { DestRect } from './effects';
import { scaledAbout } from './edges';

// Zoom-through: the photo inside itself. Level k is the photo at `inner` to the power k of the
// frame, and the whole stack grows by one level over the length of the shot, so at the end level 1
// sits exactly where level 0 started and the next shot's first frame looks like this one's first.

// Scales (as a multiple of the frame) of the levels to draw, biggest first. Level 0 is always at
// least frame-sized, so no part of the frame is ever bare.
export function zoomLevels(progress: number, look: ZoomThrough): number[] {
  const p = Math.min(1, Math.max(0, progress));
  const scales: number[] = [];
  for (let k = 0; ; k++) {
    const scale = look.inner ** (k - p);
    if (k > 0 && scale < look.minScale) break;
    scales.push(scale);
    if (k > 64) break;
  }
  return scales;
}

// Draws the stack. `dest` is the frame-sized place of level 1 at progress 0; each level is that
// rectangle scaled about its centre.
export function drawZoomThrough(
  ctx: RenderContext,
  image: CanvasImageSource,
  source: { sx: number; sy: number; sw: number; sh: number },
  frame: DestRect,
  progress: number,
  look: ZoomThrough,
): void {
  const border = Math.max(1, Math.round(look.border * frame.w));
  const quality = ctx.imageSmoothingQuality;
  for (const scale of zoomLevels(progress, look)) {
    const dest = scaledAbout(frame, scale);
    // the small copies are shrunk a lot: 'medium' uses a reduced copy of the photo, which is much
    // cheaper than 'high' and looks the same at that size
    ctx.imageSmoothingQuality = scale < 1 ? 'medium' : quality;
    ctx.drawImage(
      image,
      source.sx,
      source.sy,
      source.sw,
      source.sh,
      dest.x,
      dest.y,
      dest.w,
      dest.h,
    );
    if (scale < 1) {
      // a thin white frame so each copy reads as a picture inside the picture
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = border;
      ctx.strokeRect(dest.x, dest.y, dest.w, dest.h);
    }
  }
  ctx.imageSmoothingQuality = quality;
}
