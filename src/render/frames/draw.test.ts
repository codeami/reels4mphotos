import { describe, expect, it } from 'vitest';
import { LOOKS, type LookId } from '../../looks';
import type { ReelPlan } from '../../types/reel-plan';
import { FPS, FRAME_HEIGHT, FRAME_WIDTH } from '../constants';
import { RenderError } from '../errors';
import { LookAssets } from './assets';
import type { RenderCanvas, RenderContext } from './canvas';
import { drawFrame, type DecodedPhoto, type DrawSurface } from './draw';
import { buildTimeline } from './timeline';

// A context that only remembers what it was asked to do, in order.
interface Call {
  op: string;
  args: unknown[];
}
function recorder(): { ctx: RenderContext; calls: Call[]; ops: () => string[] } {
  const calls: Call[] = [];
  const state: Record<string, unknown> = {};
  const ctx = new Proxy(state, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      return (...args: unknown[]) => {
        calls.push({ op: prop, args });
        if (prop === 'createImageData')
          return { data: new Uint8ClampedArray((args[0] as number) * (args[1] as number) * 4) };
        if (prop === 'createRadialGradient') return { addColorStop: () => undefined };
        return undefined;
      };
    },
    set(target, prop: string, value) {
      target[prop] = value;
      calls.push({ op: `set ${prop}`, args: [value] });
      return true;
    },
  }) as unknown as RenderContext;
  return { ctx, calls, ops: () => calls.map((c) => c.op) };
}

function scratchWithRecorder(): { assets: LookAssets; made: [number, number][] } {
  const made: [number, number][] = [];
  const assets = new LookAssets((w, h) => {
    made.push([w, h]);
    return { width: w, height: h, getContext: () => recorder().ctx } as unknown as RenderCanvas;
  });
  return { assets, made };
}

const photo = (width: number, height: number): DecodedPhoto => ({
  image: {} as CanvasImageSource,
  width,
  height,
});
const LANDSCAPE = photo(4000, 3000);

// Two 1 s shots (30 frames each) with whole-photo crops, valid for the looks that fit a photo
// inside the frame; coverPlan uses real 9:16 crops of the same photo.
function planFor(
  look: LookId,
  crops: 'whole' | 'nine-sixteen',
  transition: 'cut' | 'crossfade' = 'cut',
): ReelPlan {
  const whole = { x: 0, y: 0, w: 1, h: 1 };
  const tall = { x: 0.25, y: 0, w: 0.421875, h: 1 };
  const rect = crops === 'whole' ? whole : tall;
  return {
    version: 1,
    width: FRAME_WIDTH,
    height: FRAME_HEIGHT,
    fps: FPS,
    trackId: 't',
    ...(look === 'classic' ? {} : { look }),
    totalMs: 2000,
    shots: [
      {
        photoId: 'a',
        startMs: 0,
        durationMs: 1000,
        transition: 'cut',
        kenBurns: { from: rect, to: rect },
      },
      {
        photoId: 'b',
        startMs: 1000,
        durationMs: 1000,
        transition,
        kenBurns: { from: rect, to: rect },
      },
    ],
  };
}

function frame(plan: ReelPlan, index: number, surface?: DrawSurface) {
  const { ctx, calls, ops } = recorder();
  drawFrame(ctx, plan, buildTimeline(plan).describeFrame(index), () => LANDSCAPE, 'high', surface);
  return { calls, ops, drawn: calls.filter((c) => c.op === 'drawImage') };
}

describe('drawFrame', () => {
  it('draws a classic frame as it always did: one photo straight into the whole frame, nothing on top', () => {
    const { drawn, ops } = frame(planFor('classic', 'nine-sixteen'), 10);
    expect(drawn).toHaveLength(1);
    expect(drawn[0]?.args.slice(5)).toEqual([0, 0, FRAME_WIDTH, FRAME_HEIGHT]);
    expect(ops().filter((op) => op === 'createRadialGradient' || op === 'putImageData')).toEqual(
      [],
    );
  });

  it('never asks the context for a filter (Safari support is doubtful)', () => {
    for (const id of Object.keys(LOOKS) as LookId[]) {
      const crops = LOOKS[id].fit === 'cover' ? 'nine-sixteen' : 'whole';
      const { assets } = scratchWithRecorder();
      const { calls } = frame(planFor(id, crops), 4, {
        width: FRAME_WIDTH,
        height: FRAME_HEIGHT,
        assets,
      });
      expect(calls.some((c) => c.op === 'set filter' || c.op === 'blur')).toBe(false);
    }
  });

  it('puts a landscape photo in the middle of the frame over a blurred fill for zoom-punch', () => {
    const { assets, made } = scratchWithRecorder();
    const surface = { width: FRAME_WIDTH, height: FRAME_HEIGHT, assets };
    const { drawn } = frame(planFor('zoom-punch', 'whole'), 20, surface);
    // the fill above and below the photo, the photo, the cached vignette
    expect(drawn).toHaveLength(4);
    expect(drawn[0]?.args.slice(5)).toEqual([0, 0, FRAME_WIDTH, expect.any(Number)]);
    const [x = 0, y = 0, w = 0, h = 0] = (drawn[2]?.args.slice(5) ?? []) as number[];
    expect(w).toBeGreaterThan(FRAME_WIDTH); // pushed in past 1.0 by the punch
    expect(h / w).toBeCloseTo(3000 / 4000, 9);
    expect(x + w / 2).toBeCloseTo(FRAME_WIDTH / 2, 6);
    expect(y + h / 2).toBeCloseTo(FRAME_HEIGHT / 2, 6);
    expect(made).toContainEqual([108, 192]);
  });

  it('builds the blurred fill once per photo, not once per frame', () => {
    const { assets } = scratchWithRecorder();
    const surface = { width: FRAME_WIDTH, height: FRAME_HEIGHT, assets };
    const plan = planFor('zoom-punch', 'whole');
    for (let i = 0; i < 20; i++) frame(plan, i, surface);
    expect(assets.backdrops.builds).toBe(1);
    frame(plan, 40, surface); // the second photo
    expect(assets.backdrops.builds).toBe(2);
  });

  it('fills behind a photo that does not fill the frame, and a 9:16 photo needs none for cinematic', () => {
    const { assets } = scratchWithRecorder();
    frame(planFor('photo-dump', 'whole'), 5, { width: FRAME_WIDTH, height: FRAME_HEIGHT, assets });
    expect(assets.backdrops.builds).toBe(1);
  });

  it('flashes white on the cut and not a few frames later (flash-cut)', () => {
    const { assets } = scratchWithRecorder();
    const surface = { width: FRAME_WIDTH, height: FRAME_HEIGHT, assets };
    const plan = planFor('flash-cut', 'whole');
    const whiteFill = (index: number) => {
      const { calls } = frame(plan, index, surface);
      const at = calls.findIndex((c) => c.op === 'set fillStyle' && c.args[0] === '#fff');
      return at === -1
        ? null
        : calls
            .slice(0, at)
            .filter((c) => c.op === 'set globalAlpha')
            .pop()?.args[0];
    };
    expect(whiteFill(30)).toBeCloseTo(0.8, 9); // the second shot's cut
    expect(whiteFill(31)).toBeCloseTo(0.6, 9);
    expect(whiteFill(34)).toBeNull();
  });

  it('draws two black bars for cinematic, after the photo', () => {
    const { assets } = scratchWithRecorder();
    const { calls } = frame(planFor('cinematic', 'whole'), 12, {
      width: FRAME_WIDTH,
      height: FRAME_HEIGHT,
      assets,
    });
    const bars = calls.filter((c) => c.op === 'fillRect' && (c.args[3] as number) === 192);
    expect(bars.map((b) => b.args[1])).toEqual([0, FRAME_HEIGHT - 192]);
    const lastPhoto = calls.map((c) => c.op).lastIndexOf('drawImage');
    expect(calls.indexOf(bars[0] as Call)).toBeGreaterThan(lastPhoto);
  });

  it('draws grain as one pattern fill of a single tile', () => {
    const { assets, made } = scratchWithRecorder();
    const { ops } = frame(planFor('flash-cut', 'whole'), 10, {
      width: FRAME_WIDTH,
      height: FRAME_HEIGHT,
      assets,
    });
    expect(made).toContainEqual([256, 256]);
    expect(ops().filter((op) => op === 'createPattern')).toHaveLength(1);
  });

  it('draws at the size of the surface it is given, for a smaller preview', () => {
    const { assets } = scratchWithRecorder();
    const { drawn } = frame(planFor('photo-dump', 'whole'), 3, { width: 540, height: 960, assets });
    const photoDest = drawn.find(
      (c) => (c.args[0] as object) === LANDSCAPE.image && c.args.length === 9,
    );
    expect((photoDest?.args[7] as number) <= 540 * 1.05).toBe(true);
  });

  it('refuses a crop that is not 9:16 in the look that fills the frame, and takes it where the look fits', () => {
    const coverPlan = planFor('classic', 'whole');
    expect(() => frame(coverPlan, 3)).toThrow(RenderError);
    const { assets } = scratchWithRecorder();
    expect(() =>
      frame(planFor('cinematic', 'whole'), 3, { width: FRAME_WIDTH, height: FRAME_HEIGHT, assets }),
    ).not.toThrow();
  });
});
