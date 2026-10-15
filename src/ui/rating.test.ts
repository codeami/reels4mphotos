import { describe, expect, it } from 'vitest';
import { decideRating, initialRating, MAX_RETRIES, NOTES, rerollPool } from './rating';
import type { Photo } from './store';
import type { PhotoScore } from './seams/types';

const photo = (id: string, over: Partial<PhotoScore> = {}): Photo => ({
  id,
  file: new File([], `${id}.jpg`),
  url: `blob:${id}`,
  score: {
    photoId: id,
    index: 0,
    selected: true,
    dropReason: null,
    quality: 0.8,
    timeMs: 5,
    timeSource: 'exif',
    ...over,
  },
});

describe('decideRating', () => {
  it('stops on 5', () => {
    expect(decideRating(initialRating(), 5)).toBe('stop');
  });
  it.each([1, 2, 3, 4])('asks for a new version on %i', (value) => {
    expect(decideRating(initialRating(), value)).toBe('retry');
  });
  it('says so once the retries are used up', () => {
    const spent = { ...initialRating(), retries: MAX_RETRIES };
    expect(decideRating(spent, 1)).toBe('cap');
    expect(decideRating(spent, 4)).toBe('cap');
  });
  it('still stops on 5 after the cap', () => {
    expect(decideRating({ ...initialRating(), retries: MAX_RETRIES }, 5)).toBe('stop');
  });
  it('allows three new versions and no more', () => {
    let r = initialRating();
    const results: string[] = [];
    for (let i = 0; i < 4; i++) {
      const d = decideRating(r, 2);
      results.push(d);
      if (d === 'retry') r = { ...r, retries: r.retries + 1 };
    }
    expect(results).toEqual(['retry', 'retry', 'retry', 'cap']);
  });
});

describe('notes', () => {
  it('state the cap plainly and keep the rating on the device', () => {
    expect(NOTES.cap).toBe("That's 3 new versions. Try changing the photos.");
    expect(NOTES.stop).toContain('stays on this device');
    expect(NOTES.retry(2, 1)).toBe('Rated 2. Here is a new version (1 of 3).');
  });
});

describe('rerollPool', () => {
  const photos = [
    photo('in'),
    photo('spare', { selected: false, dropReason: 'not-selected' }),
    photo('blurry', { selected: false, dropReason: 'blurry' }),
    photo('dupe', { selected: false, dropReason: 'near-duplicate' }),
    photo('removed'),
  ];
  const ids = (order: string[]) =>
    rerollPool(photos, order)
      .map((c) => c.photoId)
      .sort();

  it('adds good left-out photos to the ones in the reel', () => {
    expect(ids(['in'])).toContain('spare');
  });
  it('never brings back a blurry, dark, bright or duplicate photo', () => {
    expect(ids(['in'])).not.toContain('blurry');
    expect(ids(['in'])).not.toContain('dupe');
  });
  it('leaves out a photo the user removed by hand', () => {
    expect(ids(['in'])).not.toContain('removed');
    expect(ids(['in', 'removed'])).toContain('removed');
  });
});
