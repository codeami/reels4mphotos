import type { ReelPlan } from './seams/types';
import { crossfadeAlpha, rectAt, shotIndexAt } from './logic';

/**
 * Plays a ReelPlan onto a canvas. It reads the same plan the render engine
 * consumes; the audio element is the clock while it plays, so cuts stay on the
 * track's beats. This is a preview, not the export path.
 */
export class Player {
  private raf = 0;
  private startedAt = 0;
  private offsetMs = 0;
  private playing = false;
  private ctx: CanvasRenderingContext2D;

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
    this.seek(0);
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

  private drawShot(i: number, ms: number, alpha: number) {
    const shot = this.plan.shots[i];
    const bmp = shot && this.bitmaps.get(shot.photoId);
    if (!bmp) return;
    const t = (ms - shot.startMs) / shot.durationMs;
    const r = rectAt(shot.kenBurns.from, shot.kenBurns.to, t);
    this.ctx.globalAlpha = alpha;
    this.ctx.drawImage(
      bmp,
      r.x * bmp.width,
      r.y * bmp.height,
      r.w * bmp.width,
      r.h * bmp.height,
      0,
      0,
      this.canvas.width,
      this.canvas.height,
    );
    this.ctx.globalAlpha = 1;
  }

  draw(ms: number) {
    if (!this.plan.shots.length) return;
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const i = shotIndexAt(this.plan, ms);
    this.drawShot(i, ms, 1);
    const current = this.plan.shots[i];
    const fade = current ? crossfadeAlpha(current, ms) : 0;
    if (fade > 0 && i > 0) this.drawShot(i - 1, ms, fade);
  }
}
