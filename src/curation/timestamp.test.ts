import { describe, expect, it } from 'vitest';
import { exifFile } from './__fixtures__/scenes';
import { normaliseTimes, readExifDate, resolveTimes } from './timestamp';

describe('readExifDate', () => {
  it('reads DateTimeOriginal from a JPEG', async () => {
    const ms = await readExifDate(exifFile('a.jpg', '2024:06:01 12:30:15'));
    expect(ms).not.toBeNull();
    // EXIF stores no zone; whichever zone is used, the wall-clock fields must survive.
    const d = new Date(ms!);
    const wall = [d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()];
    const utc = [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()];
    const expected = [2024, 5, 1, 12, 30, 15];
    expect([wall, utc]).toContainEqual(expected);
  });

  it('returns null, without throwing, when the file has no EXIF date', async () => {
    await expect(readExifDate(exifFile('b.jpg', null))).resolves.toBeNull();
  });

  it('returns null, without throwing, for bytes that are not an image at all', async () => {
    const junk = new File([new Uint8Array([1, 2, 3, 4, 5])], 'junk.heic');
    await expect(readExifDate(junk)).resolves.toBeNull();
  });

  it('returns null for an empty file', async () => {
    await expect(readExifDate(new File([], 'empty.jpg'))).resolves.toBeNull();
  });
});

describe('resolveTimes', () => {
  it('uses EXIF when every photo has it', () => {
    const out = resolveTimes([
      { exifMs: 1000, lastModified: 5, index: 0 },
      { exifMs: 2000, lastModified: 5, index: 1 },
    ]);
    expect(out.map((r) => r.source)).toEqual(['exif', 'exif']);
    expect(out.map((r) => r.timeMs)).toEqual([1000, 2000]);
  });

  it('falls back to File.lastModified when EXIF is absent', () => {
    const base = Date.UTC(2024, 5, 1);
    const out = resolveTimes([
      { exifMs: null, lastModified: base, index: 0 },
      { exifMs: null, lastModified: base + 3_600_000, index: 1 },
      { exifMs: null, lastModified: base + 7_200_000, index: 2 },
    ]);
    expect(out.map((r) => r.source)).toEqual(['lastModified', 'lastModified', 'lastModified']);
    expect(out.map((r) => r.timeMs)).toEqual([base, base + 3_600_000, base + 7_200_000]);
  });

  it('falls back to pick order when lastModified carries no information', () => {
    const same = Date.UTC(2024, 5, 1);
    const out = resolveTimes([
      { exifMs: null, lastModified: same, index: 0 },
      { exifMs: null, lastModified: same, index: 1 },
      { exifMs: null, lastModified: same + 40, index: 2 },
    ]);
    expect(out.map((r) => r.source)).toEqual(['pickOrder', 'pickOrder', 'pickOrder']);
    expect(out.map((r) => r.timeMs)).toEqual([0, 1, 2]);
  });

  it('falls back to pick order when lastModified is missing (0)', () => {
    const out = resolveTimes([
      { exifMs: null, lastModified: 0, index: 0 },
      { exifMs: null, lastModified: 0, index: 1 },
    ]);
    expect(out.map((r) => r.source)).toEqual(['pickOrder', 'pickOrder']);
  });

  it('keeps the source per photo when a batch mixes EXIF and fallbacks', () => {
    const out = resolveTimes([
      { exifMs: 1_700_000_000_000, lastModified: 0, index: 0 },
      { exifMs: null, lastModified: 1_700_000_900_000, index: 1 },
    ]);
    expect(out.map((r) => r.source)).toEqual(['exif', 'lastModified']);
  });

  it('never throws on a single photo', () => {
    expect(() => resolveTimes([{ exifMs: null, lastModified: 0, index: 0 }])).not.toThrow();
  });
});

describe('normaliseTimes', () => {
  const stamped = (ms: number) => ({ timeMs: ms, source: 'exif' as const });
  const picked = (index: number) => ({ timeMs: index, source: 'pickOrder' as const });

  it('positions stamped photos by rank, so the gaps between them do not matter', () => {
    expect(normaliseTimes([stamped(0), stamped(100), stamped(1000)], 3)).toEqual([0, 0.5, 1]);
  });

  it('is not flattened by one outlier timestamp', () => {
    const day = 86_400_000;
    const t = normaliseTimes([stamped(0), stamped(day), stamped(2 * day), stamped(3 * day), stamped(900 * day)], 5);
    expect(t).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });

  it('gives tied timestamps distinct, index-ordered positions', () => {
    const t = normaliseTimes([stamped(5), stamped(5), stamped(5)], 3);
    expect(t).toEqual([0, 0.5, 1]);
  });

  it('spreads pick-order photos evenly', () => {
    expect(normaliseTimes([picked(0), picked(1), picked(2)], 3)).toEqual([0, 0.5, 1]);
  });

  it('puts a pick-order photo next to the stamped photo picked just before it', () => {
    // pick order: A(t=0) B(t=1) C(no date) D(no date): C and D follow B, not jump to the ends.
    const t = normaliseTimes([stamped(10), stamped(20), picked(2), picked(3)], 4);
    expect(t[2]!).toBeGreaterThanOrEqual(t[1]!);
    expect(t[3]!).toBeGreaterThan(t[2]!);
    expect(t[3]! - t[1]!).toBeLessThan(0.01);
  });

  it('puts a single photo at 0', () => {
    expect(normaliseTimes([stamped(5)], 1)).toEqual([0]);
  });
});
