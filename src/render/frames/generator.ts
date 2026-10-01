import { FPS, FRAME_HEIGHT, FRAME_WIDTH } from '../constants';
import type { ReelPlan } from '../../types/reel-plan';
import { getRenderContext, type RenderCanvas, type RenderContext } from './canvas';
import { drawFrame } from './draw';
import type { DecodedPhoto } from './draw';
import type { PhotoProvider } from './photo-store';
import { buildTimeline, type Timeline } from './timeline';
import { at } from '../util';

// Plan + decoded photos -> frames. Frame i is a pure function of (plan, photos, i): it never
// consults a clock, so the same plan renders the same frames however fast the machine runs.
export class FrameGenerator {
  readonly timeline: Timeline;
  readonly frameCount: number;
  readonly fps = FPS;
  private readonly ctx: RenderContext;

  constructor(
    private readonly plan: ReelPlan,
    private readonly photos: PhotoProvider,
    readonly canvas: RenderCanvas,
    // How carefully photos are resampled into the frame; a real-time caller may lower it.
    public smoothing: ImageSmoothingQuality = 'high',
  ) {
    this.timeline = buildTimeline(plan);
    this.frameCount = this.timeline.frameCount;
    this.ctx = getRenderContext(canvas);
  }

  // Paints frame `index` onto `canvas`.
  async drawFrame(index: number): Promise<void> {
    const descriptor = this.timeline.describeFrame(index);
    const loaded = new Map<number, DecodedPhoto>();
    for (const layer of descriptor.layers) {
      loaded.set(
        layer.shotIndex,
        await this.photos.get(at(this.plan.shots, layer.shotIndex).photoId),
      );
    }
    drawFrame(
      this.ctx,
      this.plan,
      descriptor,
      (shotIndex) => {
        const photo = loaded.get(shotIndex);
        if (!photo) throw new RangeError(`shot ${shotIndex} has no decoded photo`);
        return photo;
      },
      this.smoothing,
    );
  }

  // Frame `index` as RGBA bytes, 1080x1920x4.
  async renderRgba(index: number): Promise<Uint8ClampedArray> {
    await this.drawFrame(index);
    return this.ctx.getImageData(0, 0, FRAME_WIDTH, FRAME_HEIGHT).data;
  }

  dispose(): void {
    this.photos.dispose();
  }
}
