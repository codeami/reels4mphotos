import { FPS } from '../render/constants';
import { LookAssets } from '../render/frames/assets';
import { drawFrame, type DecodedPhoto, type DrawSurface } from '../render/frames/draw';
import { buildTimeline, type Timeline } from '../render/frames/timeline';
import { at } from '../render/util';
import type { ReelPlan } from './seams/types';

/**
 * Plays a ReelPlan onto a canvas. It draws each frame with the render engine's own drawFrame and
 * timeline, at preview size, so a look previews the way it exports; the audio element is the clock
 * while it plays, so cuts stay on the track's beats. This is a preview, not the export path.
 */
export class Player {
  private raf = 0;
  private startedAt = 0;
  private offsetMs = 0;
  private playing = false;
  private ctx: CanvasRenderingContext2D;
  private readonly timeline: Timeline;
  private readonly surface: DrawSurface;

  constructor(
    private canvas: HTMLCanvasElement,
    private plan: ReelPlan,
    private bitmaps: Map<string, ImageBitmap>,
    private audio: HTMLAudioElement | null,
    private onTime: (ms: number, playing: boolean) => void,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available in this browser.');
    this.ctx = ctx;
    this.timeline = buildTimeline(plan);
    this.surface = { width: canvas.width, height: canvas.height, assets: new LookAssets() };
    this.seek(0);
    this.drawPoster();
  }

  get isPlaying() {
    return this.playing;
  }

  private now(): number {
    if (this.audio && !this.audio.paused && this.audio.readyState >= 2)
      return this.audio.currentTime * 1000;
    return this.offsetMs + (performance.now() - this.startedAt);
  }

  async play() {
    if (this.playing) return;
    if (this.offsetMs >= this.plan.totalMs) this.offsetMs = 0;
    this.startedAt = performance.now();
    this.playing = true;
    if (this.audio) {
      this.audio.currentTime = this.offsetMs / 1000;
      // A rejected play() (autoplay policy, decode error) leaves the wall clock running.
      await this.audio.play().catch(() => undefined);
    }
    this.loop();
  }

  pause() {
    if (!this.playing) return;
    this.offsetMs = Math.min(this.now(), this.plan.totalMs);
    this.playing = false;
    cancelAnimationFrame(this.raf);
    this.audio?.pause();
    this.onTime(this.offsetMs, false);
  }

  seek(ms: number) {
    this.offsetMs = Math.max(0, Math.min(ms, this.plan.totalMs));
    this.startedAt = performance.now();
    if (this.audio) this.audio.currentTime = this.offsetMs / 1000;
    this.draw(this.offsetMs);
    this.onTime(this.offsetMs, this.playing);
  }

  destroy() {
    this.playing = false;
    cancelAnimationFrame(this.raf);
    this.audio?.pause();
  }

  private loop = () => {
    if (!this.playing) return;
    const ms = this.now();
    if (ms >= this.plan.totalMs) {
      this.playing = false;
      this.audio?.pause();
      this.offsetMs = 0;
      this.draw(this.plan.totalMs - 1);
      this.onTime(this.plan.totalMs, false);
      return;
    }
    this.draw(ms);
    this.onTime(ms, true);
    this.raf = requestAnimationFrame(this.loop);
  };

  /**
   * Draws the frame a paused reel rests on: a little way into the second shot, so a flash or a
   * punch has settled and the look can be judged without pressing Play. It touches no clock.
   */
  private drawPoster() {
    const second = this.plan.shots[1];
    this.draw(second ? Math.min(second.startMs + 400, this.plan.totalMs - 1) : 0);
  }

  private photoFor = (shotIndex: number): DecodedPhoto => {
    const bitmap = this.bitmaps.get(at(this.plan.shots, shotIndex).photoId);
    if (!bitmap) throw new RangeError(`shot ${shotIndex} has no preview photo`);
    return { image: bitmap, width: bitmap.width, height: bitmap.height };
  };

  draw(ms: number) {
    if (!this.plan.shots.length) return;
    const frame = Math.min(
      this.timeline.frameCount - 1,
      Math.max(0, Math.floor((ms * FPS) / 1000)),
    );
    drawFrame(
      this.ctx,
      this.plan,
      this.timeline.describeFrame(frame),
      this.photoFor,
      'medium',
      this.surface,
    );
  }
}
