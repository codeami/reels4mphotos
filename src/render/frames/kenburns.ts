import { RenderError } from '../errors';
import type { Rect, ReelShot } from '../../types/reel-plan';
import { FRAME_HEIGHT, FRAME_WIDTH } from '../constants';

// A crop of the source photo, in source pixels.
export interface PixelRect {
  readonly sx: number;
  readonly sy: number;
  readonly sw: number;
  readonly sh: number;
}

const FRAME_ASPECT = FRAME_WIDTH / FRAME_HEIGHT;
// Curation rounds its rects, so a crop may miss 9:16 by a hair.
const ASPECT_TOLERANCE = 0.02;

export function smoothstep(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

export function interpolateRect(from: Rect, to: Rect, t: number): Rect {
  const mix = (a: number, b: number): number => a + (b - a) * t;
  return { x: mix(from.x, to.x), y: mix(from.y, to.y), w: mix(from.w, to.w), h: mix(from.h, to.h) };
}

// The plan contract (src/types/reel-plan.ts): every kenBurns rect is a crop of the photo that is
// already 9:16 in the photo's own pixels, so it is drawn straight into the 1080x1920 frame with no
// fitting. This asserts that contract instead of quietly repairing a violation: stretching a photo
// would be a wrong reel the user cannot see the cause of.
export function assertCropAspect(
  rect: Rect,
  photoWidth: number,
  photoHeight: number,
  label: string,
): void {
  const aspect = (rect.w * photoWidth) / (rect.h * photoHeight);
  if (Math.abs(aspect / FRAME_ASPECT - 1) > ASPECT_TOLERANCE) {
    throw new RenderError(
      'invalid-plan',
      `${label} is ${aspect.toFixed(3)} wide-to-tall in the photo's pixels, not 9:16 (${FRAME_ASPECT.toFixed(3)})`,
    );
  }
}

export function sourceRectFor(
  shot: ReelShot,
  progress: number,
  photoWidth: number,
  photoHeight: number,
): PixelRect {
  assertCropAspect(
    shot.kenBurns.from,
    photoWidth,
    photoHeight,
    `photo "${shot.photoId}" kenBurns.from`,
  );
  assertCropAspect(
    shot.kenBurns.to,
    photoWidth,
    photoHeight,
    `photo "${shot.photoId}" kenBurns.to`,
  );
  const rect = interpolateRect(shot.kenBurns.from, shot.kenBurns.to, smoothstep(progress));
  return {
    sx: rect.x * photoWidth,
    sy: rect.y * photoHeight,
    sw: rect.w * photoWidth,
    sh: rect.h * photoHeight,
  };
}
