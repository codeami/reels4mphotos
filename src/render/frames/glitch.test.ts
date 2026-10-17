import { describe, expect, it } from 'vitest';
import { LOOKS } from '../../looks';
import type { RenderCanvas, RenderContext } from './canvas';
import { bands, drawGlitch, glitchAmount, stripShifts } from './glitch';

const GLITCH = LOOKS['glitch-slice'].glitch;
if (!GLITCH) throw new Error('glitch-slice has no glitch');
const WIDTH = 1080;

describe('glitchAmount', () => {
  it('is full on the cut, falls to nothing by the end of the glitch, and is 0 outside it', () => {
    expect(glitchAmount(0, GLITCH)).toBe(1);
    expect(glitchAmount(GLITCH.frames, GLITCH)).toBe(0);
    expect(glitchAmount(-1, GLITCH)).toBe(0);
    const ramp = Array.from({ length: GLITCH.frames }, (_, age) => glitchAmount(age, GLITCH));
    expect([...ramp].sort((a, b) => b - a)).toEqual(ramp);
  });
});

describe('bands', () => {
  it('tile the height exactly with whole rows', () => {
    for (const [height, count] of [
      [1920, 14],
      [640, 14],
      [100, 7],
    ] as const) {
      const all = bands(height, count);
      expect(all).toHaveLength(count);
      expect(all[0]?.y).toBe(0);
      let end = 0;
      for (const b of all) {
        expect(b.y).toBe(end);
        expect(Number.isInteger(b.h)).toBe(true);
        end = b.y + b.h;
      }
      expect(end).toBe(height);
    }
  });
});

describe('stripShifts', () => {
  it('moves nothing when the glitch is over', () => {
    expect(stripShifts(3, 20, 0, WIDTH, GLITCH).every((s) => s.dx === 0 && s.split === 0)).toBe(
      true,
    );
  });

  it('moves some strips and not others, never further than the peak', () => {
    const shifts = stripShifts(3, 0, 1, WIDTH, GLITCH);
    expect(shifts).toHaveLength(GLITCH.strips);
    const moving = shifts.filter((s) => s.dx !== 0);
    expect(moving.length).toBeGreaterThan(0);
    expect(moving.length).toBeLessThan(GLITCH.strips);
    for (const s of shifts) expect(Math.abs(s.dx)).toBeLessThanOrEqual(GLITCH.peak * WIDTH);
  });

  it('splits the colours of every strip that moves, and shrinks as the glitch fades', () => {
    const full = stripShifts(3, 0, 1, WIDTH, GLITCH);
    for (const s of full) if (s.dx !== 0) expect(s.split).toBeGreaterThan(0);
    const reach = (list: ReturnType<typeof stripShifts>) =>
      Math.max(...list.map((s) => Math.abs(s.dx)));
    expect(reach(stripShifts(3, 0, 0.1, WIDTH, GLITCH))).toBeLessThan(reach(full));
  });

  it('is the same every time, differs from one cut to the next, and flickers every two frames', () => {
    expect(stripShifts(3, 0, 1, WIDTH, GLITCH)).toEqual(stripShifts(3, 0, 1, WIDTH, GLITCH));
    expect(stripShifts(4, 0, 1, WIDTH, GLITCH)).not.toEqual(stripShifts(3, 0, 1, WIDTH, GLITCH));
    expect(stripShifts(3, 1, 1, WIDTH, GLITCH).map((s) => s.dx)).toEqual(
      stripShifts(3, 0, 1, WIDTH, GLITCH).map((s) => s.dx),
    );
    expect(stripShifts(3, 2, 1, WIDTH, GLITCH)).not.toEqual(stripShifts(3, 0, 1, WIDTH, GLITCH));
  });
});

describe('drawGlitch', () => {
  function recording(): {
    ctx: RenderContext;
    ops: { op: string; args: unknown[]; mode: unknown }[];
  } {
    const ops: { op: string; args: unknown[]; mode: unknown }[] = [];
    const state: Record<string, unknown> = { globalCompositeOperation: 'source-over' };
    const ctx = new Proxy(state, {
      get: (t, prop: string) =>
        prop in t
          ? t[prop]
          : (...args: unknown[]) => {
              ops.push({ op: prop, args, mode: t.globalCompositeOperation });
            },
      set: (t, prop: string, value) => {
        t[prop] = value;
        return true;
      },
    }) as unknown as RenderContext;
    return { ctx, ops };
  }
  const draw = (shifts: Parameters<typeof drawGlitch>[5]) => {
    const main = recording();
    const scratch = recording();
    const canvas = { getContext: () => scratch.ctx } as unknown as RenderCanvas;
    drawGlitch(
      main.ctx,
      canvas,
      {} as CanvasImageSource,
      { sx: 0, sy: 0, sw: 100, sh: 200 },
      { x: 0, y: 0, w: 1080, h: 1920 },
      shifts,
      { width: 1080, height: 1920 },
    );
    return { main: main.ops, scratch: scratch.ops };
  };

  it('is one plain draw of the photo when nothing moves', () => {
    const still = Array.from({ length: GLITCH.strips }, () => ({ dx: 0, split: 0 }));
    const { main, scratch } = draw(still);
    expect(main.filter((o) => o.op === 'drawImage')).toHaveLength(1);
    expect(scratch).toEqual([]);
  });

  it('redraws a moving strip as red, green and blue added together, and leaves the rest alone', () => {
    const shifts = Array.from({ length: GLITCH.strips }, (_, i) =>
      i === 4 ? { dx: 40, split: 12 } : { dx: 0, split: 0 },
    );
    const { main, scratch } = draw(shifts);
    const added = main.filter((o) => o.op === 'drawImage' && o.mode === 'lighter');
    expect(added).toHaveLength(3);
    expect(scratch.filter((o) => o.op === 'fillRect' && o.mode === 'multiply')).toHaveLength(3);
    // red and blue are pulled apart in opposite directions, green stays at the strip's slide
    const xs = scratch.filter((o) => o.op === 'drawImage').map((o) => o.args[5] as number);
    expect(xs).toEqual([40 - 12, 40, 40 + 12]);
    expect(main.at(-1)).toBeDefined();
  });
});
