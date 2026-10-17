import type { Look } from '../../looks';
import type { DecodedPhoto } from './draw';
import type { RenderCanvas, RenderContext } from './canvas';

export type BackdropKind = Exclude<Look['backdrop'], 'black'>;

// A scratch canvas the backdrop is drawn on; the caller decides what kind (OffscreenCanvas in a
// worker, a detached <canvas> otherwise).
export type ScratchFactory = (width: number, height: number) => RenderCanvas;

// The blur: shrink the photo to a few pixels, then scale it back up with smoothing. This is the
// whole effect, so it never depends on ctx.filter (Safari support is doubtful).
export const BACKDROP_STEPS = {
  blur: [
    { width: 96, height: 170 },
    { width: 24, height: 43 },
    { width: 108, height: 192 },
  ],
  colour: [
    { width: 96, height: 170 },
    { width: 12, height: 21 },
    { width: 1, height: 1 },
  ],
} as const;

// One entry per photo and kind. Cached so the shrinking happens once per photo, not once per frame.
export function backdropKey(photoId: string, kind: BackdropKind): string {
  return `${kind}:${photoId}`;
}

// Least recently used, bounded: ten shots never keep more than a few small canvases alive.
export class BackdropCache {
  private readonly entries = new Map<string, RenderCanvas>();
  builds = 0;

  constructor(private readonly capacity = 8) {}

  get(key: string, build: () => RenderCanvas): RenderCanvas {
    const hit = this.entries.get(key);
    if (hit) {
      this.entries.delete(key);
      this.entries.set(key, hit);
      return hit;
    }
    const made = build();
    this.builds++;
    this.entries.set(key, made);
    while (this.entries.size > this.capacity) {
      const oldest = this.entries.keys().next().value as string;
      this.entries.delete(oldest);
    }
    return made;
  }

  get size(): number {
    return this.entries.size;
  }
}

function contextOf(canvas: RenderCanvas): RenderContext {
  const ctx = canvas.getContext('2d') as RenderContext | null;
  if (!ctx) throw new Error('2d canvas context unavailable');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return ctx;
}

// The largest centred 9:16 part of the photo, in photo pixels: what a cover fit would show.
export function centreCrop(
  width: number,
  height: number,
  aspect: number,
): { sx: number; sy: number; sw: number; sh: number } {
  const sw = Math.min(width, height * aspect);
  const sh = Math.min(height, width / aspect);
  return { sx: (width - sw) / 2, sy: (height - sh) / 2, sw, sh };
}

export function buildBackdrop(
  photo: DecodedPhoto,
  kind: BackdropKind,
  makeScratch: ScratchFactory,
): RenderCanvas {
  const steps = BACKDROP_STEPS[kind];
  const first = steps[0];
  let canvas = makeScratch(first.width, first.height);
  const crop = centreCrop(photo.width, photo.height, first.width / first.height);
  contextOf(canvas).drawImage(
    photo.image,
    crop.sx,
    crop.sy,
    crop.sw,
    crop.sh,
    0,
    0,
    first.width,
    first.height,
  );
  for (const step of steps.slice(1)) {
    const next = makeScratch(step.width, step.height);
    contextOf(next).drawImage(canvas as CanvasImageSource, 0, 0, step.width, step.height);
    canvas = next;
  }
  return canvas;
}
