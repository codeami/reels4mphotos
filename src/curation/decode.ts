import type { PixelBuffer } from './types';

/** Raised when the browser cannot turn a file into pixels (unsupported format, corrupt file, no decoder). */
export class DecodeError extends Error {
  override name = 'DecodeError';
}

export interface Bitmap {
  width: number;
  height: number;
  close(): void;
}

export interface DecodeDeps {
  load?: (file: Blob) => Promise<Bitmap>;
  draw?: (bitmap: Bitmap, width: number, height: number) => PixelBuffer;
}

export interface Decoded {
  pixels: PixelBuffer;
  original: { width: number; height: number };
}

/** Scale to fit the longest side within `max`, keeping the aspect ratio. Never upscales. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function browserLoad(file: Blob): Promise<Bitmap> {
  if (typeof createImageBitmap === 'undefined') {
    return Promise.reject(new DecodeError('This browser cannot decode images here (no createImageBitmap).'));
  }
  return createImageBitmap(file, { imageOrientation: 'from-image' });
}

type Canvas2D = { drawImage: CanvasRenderingContext2D['drawImage']; getImageData: CanvasRenderingContext2D['getImageData'] };

/** An OffscreenCanvas where there is one, else a detached <canvas> (main thread only). */
function scratchContext(width: number, height: number): Canvas2D {
  let ctx: Canvas2D | null = null;
  if (typeof OffscreenCanvas !== 'undefined') {
    ctx = new OffscreenCanvas(width, height).getContext('2d', { willReadFrequently: true }) as Canvas2D | null;
  } else if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    ctx = canvas.getContext('2d', { willReadFrequently: true });
  } else {
    throw new DecodeError('This browser has no canvas to downscale photos with.');
  }
  if (!ctx) throw new DecodeError('Could not get a 2D context to downscale the photo.');
  return ctx;
}

function browserDraw(bitmap: Bitmap, width: number, height: number): PixelBuffer {
  const ctx = scratchContext(width, height);
  ctx.drawImage(bitmap as unknown as ImageBitmap, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);
  return { width, height, data };
}

/** Decode a photo and downscale it to a working size on an OffscreenCanvas. */
export async function decodePhoto(file: Blob, maxSize: number, deps: DecodeDeps = {}): Promise<Decoded> {
  const load = deps.load ?? browserLoad;
  const draw = deps.draw ?? browserDraw;
  let bitmap: Bitmap;
  try {
    bitmap = await load(file);
  } catch (err) {
    throw err instanceof DecodeError ? err : new DecodeError(err instanceof Error ? err.message : String(err));
  }
  try {
    const size = fitWithin(bitmap.width, bitmap.height, maxSize);
    return { pixels: draw(bitmap, size.width, size.height), original: { width: bitmap.width, height: bitmap.height } };
  } catch (err) {
    throw err instanceof DecodeError ? err : new DecodeError(err instanceof Error ? err.message : String(err));
  } finally {
    bitmap.close();
  }
}
