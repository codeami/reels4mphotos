import { FRAME_HEIGHT, FRAME_WIDTH } from '../constants';
import type { ReelPlan } from '../../types/reel-plan';
import type { RenderContext } from './canvas';
import { sourceRectFor } from './kenburns';
import type { FrameDescriptor } from './timeline';
import { at } from '../util';

export interface DecodedPhoto {
  readonly image: CanvasImageSource;
  readonly width: number;
  readonly height: number;
}

// Paints one frame: the bottom layer opaque, a crossfading layer on top at its alpha. It reads
// nothing but its arguments, so a descriptor always yields the same pixels.
export function drawFrame(
  ctx: RenderContext,
  plan: ReelPlan,
  descriptor: FrameDescriptor,
  photoFor: (shotIndex: number) => DecodedPhoto,
  smoothing: ImageSmoothingQuality = 'high',
): void {
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = smoothing;

  for (const layer of descriptor.layers) {
    const photo = photoFor(layer.shotIndex);
    const { sx, sy, sw, sh } = sourceRectFor(
      at(plan.shots, layer.shotIndex),
      layer.progress,
      photo.width,
      photo.height,
    );
    ctx.globalAlpha = layer.alpha;
    ctx.drawImage(photo.image, sx, sy, sw, sh, 0, 0, FRAME_WIDTH, FRAME_HEIGHT);
  }
  ctx.globalAlpha = 1;
}
