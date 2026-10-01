import { FRAME_HEIGHT, FRAME_WIDTH } from '../constants';
import { RenderError } from '../errors';

export type RenderCanvas = OffscreenCanvas | HTMLCanvasElement;
export type RenderContext = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

// OffscreenCanvas where it exists (workers, modern main threads); a detached <canvas> otherwise.
export function createRenderCanvas(kind: 'offscreen' | 'element' = 'offscreen'): RenderCanvas {
  if (kind === 'offscreen' && typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(FRAME_WIDTH, FRAME_HEIGHT);
  }
  if (typeof document === 'undefined') {
    throw new RenderError('unsupported', 'no canvas available in this scope');
  }
  const canvas = document.createElement('canvas');
  canvas.width = FRAME_WIDTH;
  canvas.height = FRAME_HEIGHT;
  return canvas;
}

export function getRenderContext(canvas: RenderCanvas): RenderContext {
  const ctx = canvas.getContext('2d', { alpha: false }) as RenderContext | null;
  if (!ctx) throw new RenderError('unsupported', '2d canvas context unavailable');
  return ctx;
}
