import { describe, expect, it } from 'vitest';
import { syntheticBeatMap } from './__fixtures__/beatmap';
import {
  boxBlur,
  clippedHighlights,
  exifFile,
  makeScene,
  nearDuplicate,
} from './__fixtures__/scenes';
import { DecodeError } from './decode';
import { runCuration, type PipelineDeps } from './pipeline';
import type { CurateProgress, PixelBuffer } from './types';

const beatmap = syntheticBeatMap(120, 60_000);

/** A decoder stub keyed by file name, so the pipeline runs without a browser. */
function stubDeps(pixels: Record<string, PixelBuffer | Error>): PipelineDeps {
  return {
    decode: async (file) => {
      const hit = pixels[file.name];
      if (!hit) throw new DecodeError(`no fixture for ${file.name}`);
      if (hit instanceof Error) throw hit;
      return { pixels: hit, original: { width: 4000, height: 3000 } };
    },
  };
}

function scenario() {
  const pixels: Record<string, PixelBuffer | Error> = {};
  const files: File[] = [];
  const add = (name: string, px: PixelBuffer | Error, exifDate: string | null, lastModified = 0) => {
    pixels[name] = px;
    files.push(exifFile(name, exifDate, lastModified));
  };
  // Six distinct, sharp, well-exposed scenes one day apart.
  for (let i = 0; i < 6; i++) add(`scene${i}.jpg`, makeScene(10 + i), `2024:06:0${i + 1} 12:00:00`);
  add('blurry.jpg', boxBlur(makeScene(40), 5), '2024:06:07 12:00:00');
  add('blown.jpg', clippedHighlights(makeScene(41)), '2024:06:08 12:00:00');
  add('dup-of-scene0.jpg', nearDuplicate(makeScene(10), 7), '2024:06:01 12:00:05');
  add('broken.heic', new DecodeError('The source image cannot be decoded.'), '2024:06:09 12:00:00');
  return { files, pixels };
}

describe('runCuration', () => {
  it('drops blurry, badly exposed, near-duplicate and undecodable photos with a reason', async () => {
    const { files, pixels } = scenario();
    const res = await runCuration(files, { beatmap, targetCount: 10 }, stubDeps(pixels));
    const byName = new Map(files.map((f, i) => [f.name, res.scores[i]!]));

    expect(byName.get('blurry.jpg')).toMatchObject({ selected: false, dropReason: 'blurry' });
    expect(byName.get('blown.jpg')).toMatchObject({ selected: false, dropReason: 'overexposed' });
    expect(byName.get('broken.heic')).toMatchObject({ selected: false, dropReason: 'decode-failed' });
    expect(byName.get('broken.heic')!.decodeError).toMatch(/cannot be decoded/);
    const dup = byName.get('dup-of-scene0.jpg')!;
    const dupIds = [byName.get('scene0.jpg')!.photoId, dup.photoId];
    expect(dupIds.filter((id) => res.scores.find((s) => s.photoId === id)!.selected)).toHaveLength(1);
    expect([dup.dropReason, byName.get('scene0.jpg')!.dropReason].filter((r) => r === 'near-duplicate')).toHaveLength(1);
  });

  it('collapses the near-duplicate pair to one and records which photo it collapsed into', async () => {
    const { files, pixels } = scenario();
    const res = await runCuration(files, { beatmap }, stubDeps(pixels));
    const dropped = res.scores.find((s) => s.dropReason === 'near-duplicate')!;
    const keeper = res.scores.find((s) => s.photoId === dropped.duplicateOf)!;
    expect(keeper.selected).toBe(true);
  });

  it('selects every survivor when fewer than N remain, and plans exactly those', async () => {
    const { files, pixels } = scenario();
    const res = await runCuration(files, { beatmap, targetCount: 10 }, stubDeps(pixels));
    const selected = res.scores.filter((s) => s.selected);
    expect(selected).toHaveLength(6);
    expect(res.plan.shots.map((s) => s.photoId).sort()).toEqual(selected.map((s) => s.photoId).sort());
  });

  it('marks photos that survived but lost the top-N cut as not-selected', async () => {
    const { files, pixels } = scenario();
    const res = await runCuration(files, { beatmap, targetCount: 4 }, stubDeps(pixels));
    expect(res.scores.filter((s) => s.selected)).toHaveLength(4);
    expect(res.scores.filter((s) => s.dropReason === 'not-selected').length).toBeGreaterThanOrEqual(1);
  });

  it('orders the reel chronologically', async () => {
    const { files, pixels } = scenario();
    const res = await runCuration([...files].reverse(), { beatmap }, stubDeps(pixels));
    const times = res.plan.shots.map((s) => res.scores.find((p) => p.photoId === s.photoId)!.timeMs);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('reports the EXIF path when photos carry a date', async () => {
    const { files, pixels } = scenario();
    const res = await runCuration(files, { beatmap }, stubDeps(pixels));
    expect(res.timeline.source).toBe('exif');
    expect(res.scores.every((s) => s.timeSource === 'exif')).toBe(true);
  });

  it('reports the lastModified path when EXIF is stripped but file times differ', async () => {
    const pixels: Record<string, PixelBuffer> = {};
    const files = [0, 1, 2, 3].map((i) => {
      pixels[`p${i}.jpg`] = makeScene(20 + i);
      return exifFile(`p${i}.jpg`, null, Date.UTC(2024, 5, 1 + i));
    });
    const res = await runCuration(files, { beatmap }, stubDeps(pixels));
    expect(res.timeline).toMatchObject({ source: 'lastModified', exif: 0, lastModified: 4, pickOrder: 0 });
  });

  it('reports the pick-order path when neither EXIF nor lastModified help, without throwing', async () => {
    const pixels: Record<string, PixelBuffer> = {};
    const files = [0, 1, 2, 3].map((i) => {
      pixels[`p${i}.jpg`] = makeScene(20 + i);
      return exifFile(`p${i}.jpg`, null, 0);
    });
    const res = await runCuration(files, { beatmap }, stubDeps(pixels));
    expect(res.timeline).toMatchObject({ source: 'pickOrder', pickOrder: 4 });
    expect(res.plan.shots.map((s) => s.photoId)).toEqual(res.scores.map((s) => s.photoId));
  });

  it('survives an entirely undecodable batch', async () => {
    const files = [exifFile('a.heic', null), exifFile('b.heic', null)];
    const res = await runCuration(files, { beatmap }, stubDeps({}));
    expect(res.scores.every((s) => s.dropReason === 'decode-failed')).toBe(true);
    expect(res.plan.shots).toEqual([]);
  });

  it('survives an empty batch', async () => {
    const res = await runCuration([], { beatmap }, stubDeps({}));
    expect(res.scores).toEqual([]);
    expect(res.plan.shots).toEqual([]);
  });

  it('treats an unexpected decoder crash as a decode failure, not a run failure', async () => {
    const files = [exifFile('a.jpg', null), exifFile('b.jpg', null)];
    const res = await runCuration(files, { beatmap }, {
      decode: async (f) => {
        if (f.name === 'a.jpg') throw new TypeError('boom');
        return { pixels: makeScene(1), original: { width: 100, height: 100 } };
      },
    });
    expect(res.scores[0]).toMatchObject({ dropReason: 'decode-failed', decodeError: 'boom' });
    expect(res.scores[1]!.dropReason).toBeNull();
  });

  it('uses caller-supplied photo ids', async () => {
    const { files, pixels } = scenario();
    const photoIds = files.map((_, i) => `id-${i}`);
    const res = await runCuration(files, { beatmap, photoIds }, stubDeps(pixels));
    expect(res.scores.map((s) => s.photoId)).toEqual(photoIds);
  });

  it('rejects photo ids that are not one per file, or not unique', async () => {
    const files = [exifFile('a.jpg', null), exifFile('b.jpg', null)];
    await expect(runCuration(files, { beatmap, photoIds: ['a', 'a'] }, stubDeps({}))).rejects.toThrow(/unique/);
    await expect(runCuration(files, { beatmap, photoIds: ['a'] }, stubDeps({}))).rejects.toThrow(/one per file/);
  });

  it('falls back to the default count for a nonsense targetCount', async () => {
    const { files, pixels } = scenario();
    const res = await runCuration(files, { beatmap, targetCount: Number.NaN }, stubDeps(pixels));
    expect(res.scores.filter((s) => s.selected)).toHaveLength(6);
  });

  it('posts incremental progress, one step per photo, ending done', async () => {
    const { files, pixels } = scenario();
    const events: CurateProgress[] = [];
    await runCuration(files, { beatmap, onProgress: (p) => events.push(p) }, stubDeps(pixels));
    const analysing = events.filter((e) => e.stage === 'analysing');
    expect(analysing).toHaveLength(files.length);
    expect(analysing.map((e) => e.done)).toEqual(files.map((_, i) => i + 1));
    expect(analysing.every((e) => e.total === files.length)).toBe(true);
    expect(events[events.length - 1]).toMatchObject({ stage: 'done' });
  });

  it('lets the caller switch duplicate collapsing off with a negative threshold', async () => {
    const { files, pixels } = scenario();
    const res = await runCuration(files, { beatmap, thresholds: { duplicateHamming: -1 } }, stubDeps(pixels));
    expect(res.scores.some((s) => s.dropReason === 'near-duplicate')).toBe(false);
  });

  it('does not hold on to pixels: scores carry numbers and strings only', async () => {
    const { files, pixels } = scenario();
    const res = await runCuration(files, { beatmap }, stubDeps(pixels));
    expect(JSON.stringify(res).length).toBeLessThan(200_000);
  });
});
