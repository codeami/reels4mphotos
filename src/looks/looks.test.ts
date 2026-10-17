import { describe, expect, it } from 'vitest';
import { CROSSFADE_FRAMES } from '../render/constants';
import { DEFAULT_LOOK, LOOKS, LOOK_ORDER, isLookId, lookOf } from './looks';

describe('looks', () => {
  it('lists every look once, keyed by its own id', () => {
    expect([...LOOK_ORDER].sort()).toEqual(Object.keys(LOOKS).sort());
    for (const [key, look] of Object.entries(LOOKS)) expect(look.id).toBe(key);
  });

  it("keeps today's reel as the default: 9:16 crops, a 10 frame fade, nothing added", () => {
    const classic = lookOf({});
    expect(DEFAULT_LOOK).toBe('classic');
    expect(classic.fit).toBe('cover');
    expect(classic.crossfadeFrames).toBe(CROSSFADE_FRAMES);
    expect(classic.crossfadeEasing).toBe('linear');
    expect(classic.planning.cutBeats).toBeNull();
    expect([classic.punch, classic.flash]).toEqual([null, null]);
    expect([classic.shake, classic.grain, classic.vignette, classic.letterbox]).toEqual([
      0, 0, 0, 0,
    ]);
    expect(classic.grade).toEqual([]);
  });

  it('carries the numbers of the scout recipes (data/reels-style-catalog-scout/looks.json)', () => {
    expect(LOOKS['zoom-punch'].planning.cutBeats).toEqual([1, 1]);
    expect(LOOKS['zoom-punch'].punch).toMatchObject({ from: 1, to: 1.12, frames: 6 });
    expect(LOOKS['flash-cut'].flash).toEqual({ peak: 0.8, frames: 4 });
    expect(LOOKS['flash-cut'].punch).toMatchObject({ from: 1.05, to: 1, frames: 4 });
    expect(LOOKS.cinematic.planning.cutBeats).toEqual([4, 8]);
    expect(LOOKS.cinematic.crossfadeFrames).toBe(18);
    expect(LOOKS['photo-dump'].planning.cutBeats).toEqual([1, 2]);
  });

  it('gives the looks that fit a photo inside the frame something to put behind it', () => {
    for (const look of Object.values(LOOKS)) {
      if (look.fit === 'cover') expect(look.backdrop).toBe('black');
    }
    expect(LOOKS['zoom-punch'].backdrop).toBe('blur');
    expect(LOOKS['photo-dump'].backdrop).toBe('colour');
  });

  it('knows which strings are looks', () => {
    expect(isLookId('cinematic')).toBe(true);
    expect(isLookId('toString')).toBe(false);
    expect(isLookId(undefined)).toBe(false);
  });
});
