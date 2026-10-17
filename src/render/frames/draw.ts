import { FRAME_HEIGHT, FRAME_WIDTH } from '../constants';
import { lookOf, type Look } from '../../looks';
import type { ReelPlan } from '../../types/reel-plan';
import { LookAssets } from './assets';
import { backdropKey, buildBackdrop } from './backdrop';
import type { RenderContext } from './canvas';
import { destRect, exposedStrips, flashAlpha, punchScale, shakeOffset } from './effects';
import { sourceRectFor } from './kenburns';
import { drawFlash, drawGrade, drawGrain, drawLetterbox } from './overlays';
import type { FrameDescriptor, FrameLayer } from './timeline';
import { at } from '../util';

export interface DecodedPhoto {
  readonly image: CanvasImageSource;
  readonly width: number;
  readonly height: number;
}

// Where a frame is drawn: its size (the export is 1080x1920, a preview is smaller) and what the
// look keeps between frames.
export interface DrawSurface {
  readonly width: number;
  readonly height: number;
  readonly assets: LookAssets;
}

let exportSurface: DrawSurface | null = null;

// The export-sized surface callers get when they pass none. Made on first use, because a classic
// frame needs no assets and some callers have no canvas to make them with.
function defaultSurface(): DrawSurface {
  exportSurface ??= {
    width: FRAME_WIDTH,
    height: FRAME_HEIGHT,
    get assets() {
      return sharedAssets();
    },
  };
  return exportSurface;
}

let shared: LookAssets | null = null;
function sharedAssets(): LookAssets {
  shared ??= new LookAssets();
  return shared;
}

// Paints one frame: the bottom layer opaque, a crossfading layer on top at its alpha, then the
// look's overlays. It reads nothing but its arguments, so a descriptor always yields the same
// pixels.
export function drawFrame(
  ctx: RenderContext,
  plan: ReelPlan,
  descriptor: FrameDescriptor,
  photoFor: (shotIndex: number) => DecodedPhoto,
  smoothing: ImageSmoothingQuality = 'high',
  surface: DrawSurface = defaultSurface(),
): void {
  const look = lookOf(plan);
  const { width, height } = surface;
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = smoothing;

  const top = at(descriptor.layers, descriptor.layers.length - 1).shotIndex;
  for (const layer of descriptor.layers) {
    const isTop = layer.shotIndex === top;
    drawLayer(ctx, plan, look, layer, isTop ? descriptor : null, photoFor, surface);
  }
  ctx.globalAlpha = 1;

  drawGrade(ctx, width, height, look.grade);
  if (look.vignette > 0) {
    ctx.drawImage(surface.assets.vignette(width, height, look.vignette) as CanvasImageSource, 0, 0);
  }
  if (look.grain > 0) {
    drawGrain(
      ctx,
      surface.assets.grainTile(),
      width,
      height,
      descriptor.index,
      look.grain,
      FRAME_WIDTH,
    );
  }
  drawLetterbox(ctx, width, height, look.letterbox);
  drawFlash(ctx, width, height, flashAlpha(descriptor.sinceCut, look.flash));
}

// One photo: its backdrop if it does not fill the frame, then the photo itself, scaled by the
// punch and nudged by the shake. `timed` is the frame's descriptor for the newest layer only,
// because the per-beat effects belong to the shot that has just cut in.
function drawLayer(
  ctx: RenderContext,
  plan: ReelPlan,
  look: Look,
  layer: FrameLayer,
  timed: FrameDescriptor | null,
  photoFor: (shotIndex: number) => DecodedPhoto,
  surface: DrawSurface,
): void {
  const shot = at(plan.shots, layer.shotIndex);
  const photo = photoFor(layer.shotIndex);
  const source = sourceRectFor(shot, layer.progress, photo.width, photo.height, look.fit);
  const scale = timed ? punchScale(timed.sinceCut, look.punch) : 1;
  const shift = timed ? shakeOffset(timed.index, look.shake, surface.width) : { dx: 0, dy: 0 };
  const dest = destRect(look.fit, { sw: source.sw, sh: source.sh }, surface, scale, shift);

  ctx.globalAlpha = layer.alpha;
  if (look.fit === 'contain' && look.backdrop !== 'black') {
    const kind = look.backdrop;
    const fill = surface.assets.backdrops.get(backdropKey(shot.photoId, kind), () =>
      buildBackdrop(photo, kind, surface.assets.makeScratch),
    );
    // only the bare parts of the frame: the photo covers the rest
    const sx = fill.width / surface.width;
    const sy = fill.height / surface.height;
    for (const r of exposedStrips(dest, surface)) {
      ctx.drawImage(
        fill as CanvasImageSource,
        r.x * sx,
        r.y * sy,
        r.w * sx,
        r.h * sy,
        r.x,
        r.y,
        r.w,
        r.h,
      );
    }
  }
  ctx.drawImage(
    photo.image,
    source.sx,
    source.sy,
    source.sw,
    source.sh,
    dest.x,
    dest.y,
    dest.w,
    dest.h,
  );
  ctx.globalAlpha = 1;
}
