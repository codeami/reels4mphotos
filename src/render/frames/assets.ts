import { createScratchCanvas, type RenderCanvas } from './canvas';
import { BackdropCache, type ScratchFactory } from './backdrop';
import { makeGrainTile, paintVignette } from './overlays';
import type { RenderContext } from './canvas';

// What a look keeps between frames: the blurred fills (one per photo) and the noise tile. One of
// these lives as long as one renderer (an export, or a preview player).
export class LookAssets {
  readonly backdrops = new BackdropCache();
  private grain: RenderCanvas | null = null;

  constructor(readonly makeScratch: ScratchFactory = createScratchCanvas) {}

  private readonly vignettes = new Map<string, RenderCanvas>();

  // The vignette drawn once for this frame size and strength.
  vignette(width: number, height: number, strength: number): RenderCanvas {
    const key = `${width}x${height}:${strength}`;
    let canvas = this.vignettes.get(key);
    if (!canvas) {
      canvas = this.makeScratch(width, height);
      const ctx = canvas.getContext('2d') as RenderContext | null;
      if (!ctx) throw new Error('2d canvas context unavailable');
      paintVignette(ctx, width, height, strength);
      this.vignettes.set(key, canvas);
    }
    return canvas;
  }

  grainTile(): RenderCanvas {
    this.grain ??= makeGrainTile(this.makeScratch);
    return this.grain;
  }
}
