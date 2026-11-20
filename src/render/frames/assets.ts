import { createScratchCanvas, type RenderCanvas } from './canvas';
import { BackdropCache, LruCache, type ScratchFactory } from './backdrop';
import type { EdgeSet } from './edges';
import { makeGrainTile, paintVignette } from './overlays';
import type { RenderContext } from './canvas';
import type { GalleryStage } from './gallery';

// What a look keeps between frames: the blurred fills (one per photo), the noise tile, and for the
// gallery look its 3D stage. One of these lives as long as one renderer (an export, or a preview
// player), and is disposed with it.
export class LookAssets {
  readonly backdrops = new BackdropCache();
  // One edge map per photo (neon edge pulse): found once, then only drawn.
  readonly edges = new LruCache<EdgeSet>(4);
  // The gallery look's room, with every photo hung; prepareGallery() (./gallery) sets it up.
  gallery: GalleryStage | null = null;
  private grain: RenderCanvas | null = null;

  constructor(readonly makeScratch: ScratchFactory = createScratchCanvas) {}

  // Frees what holds GPU memory: the gallery's WebGL context. Canvases are left to the collector.
  dispose(): void {
    this.gallery?.dispose();
    this.gallery = null;
  }

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

  private readonly strips = new Map<string, RenderCanvas>();

  // A frame-wide canvas as tall as the tallest glitch strip, drawn into and thrown away per strip.
  glitchScratch(width: number, height: number): RenderCanvas {
    const key = `${width}x${height}`;
    let canvas = this.strips.get(key);
    if (!canvas) {
      canvas = this.makeScratch(width, height);
      this.strips.set(key, canvas);
    }
    return canvas;
  }

  grainTile(): RenderCanvas {
    this.grain ??= makeGrainTile(this.makeScratch);
    return this.grain;
  }
}
