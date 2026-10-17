import { describe, expect, it } from 'vitest';
import { CROSSFADE_FRAMES } from '../render/constants';
import {
  DEFAULT_LOOK,
  DEFAULT_MIN_PHOTOS,
  FEWEST_PHOTOS,
  LOOKS,
  LOOK_ORDER,
  isLookId,
  lookForPhotoCount,
  lookOf,
  minPhotosOf,
  photoShortfall,
} from './looks';

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

  it('keeps five photos as the minimum for the first five looks and one for the new three', () => {
    for (const id of ['classic', 'zoom-punch', 'flash-cut', 'cinematic', 'photo-dump'] as const) {
      expect(minPhotosOf(LOOKS[id])).toBe(DEFAULT_MIN_PHOTOS);
    }
    for (const id of ['neon-edge-pulse', 'zoom-through', 'glitch-slice'] as const) {
      expect(minPhotosOf(LOOKS[id])).toBe(1);
    }
    expect(DEFAULT_MIN_PHOTOS).toBe(5);
    expect(FEWEST_PHOTOS).toBe(1);
  });

  it('gives each new look the numbers its drawing module reads, and only those', () => {
    expect(LOOKS['neon-edge-pulse'].edgePulse?.mapWidth).toBe(256);
    expect(LOOKS['zoom-through'].zoomThrough?.inner).toBe(0.5);
    expect(LOOKS['glitch-slice'].glitch?.strips).toBeGreaterThan(1);
    for (const look of Object.values(LOOKS)) {
      expect([look.edgePulse, look.zoomThrough, look.glitch].filter(Boolean).length).toBe(
        minPhotosOf(look) === 1 ? 1 : 0,
      );
    }
  });

  it('puts the new looks last in the chip row and lets them cut on a beat with repeats', () => {
    expect(LOOK_ORDER.slice(-3)).toEqual(['neon-edge-pulse', 'zoom-through', 'glitch-slice']);
    for (const id of LOOK_ORDER.slice(-3)) {
      const { planning } = LOOKS[id];
      expect(planning.cutBeats).not.toBeNull();
      expect(planning.maxPasses).toBeGreaterThan(20);
      expect(planning.fallbackCutMs).toBeGreaterThan(0);
    }
  });

  it('says in plain words when there are too few photos, and nothing when there are enough', () => {
    expect(photoShortfall(LOOKS.cinematic, 3)).toBe(
      'Cinematic needs at least 5 photos (you have 3).',
    );
    expect(photoShortfall(LOOKS.cinematic, 5)).toBeNull();
    expect(photoShortfall(LOOKS['glitch-slice'], 1)).toBeNull();
  });

  it('keeps the look you chose when it works, else the first look that does', () => {
    expect(lookForPhotoCount('cinematic', 10)).toBe('cinematic');
    expect(lookForPhotoCount('classic', 4)).toBe('neon-edge-pulse');
    expect(lookForPhotoCount('glitch-slice', 1)).toBe('glitch-slice');
  });
});
