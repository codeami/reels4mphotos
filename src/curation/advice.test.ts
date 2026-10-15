import { describe, expect, it } from 'vitest';
import { adviceFor, analyseSet, formatSpan, MAX_TIPS } from './advice';
import type { PhotoScore } from './types';

const HOUR = 3_600_000;
const MIN = 60_000;

/** A kept, portrait, sharp photo taken `minutes` after the first. */
const photo = (i: number, over: Partial<PhotoScore> = {}): PhotoScore => ({
  photoId: `p${i}`,
  index: i,
  selected: true,
  dropReason: null,
  width: 3000,
  height: 4000,
  sharpness: 400,
  timeMs: i * 20 * MIN,
  timeSource: 'exif',
  ...over,
});
const set = (n: number, over: (i: number) => Partial<PhotoScore> = () => ({})) =>
  Array.from({ length: n }, (_, i) => photo(i, over(i)));
const landscape = { width: 4000, height: 3000 };
const tipIds = (scores: PhotoScore[]) => adviceFor(analyseSet(scores)).tips.map((t) => t.id);

describe('analyseSet', () => {
  it('counts shapes, drops and EXIF time from existing scores', () => {
    const scores = [
      photo(0),
      photo(1, landscape),
      photo(2, { width: 3000, height: 3000 }),
      photo(3, { selected: false, dropReason: 'blurry' }),
      photo(4, { selected: false, dropReason: 'underexposed' }),
      photo(5, { selected: false, dropReason: 'overexposed' }),
      photo(6, { selected: false, dropReason: 'near-duplicate' }),
      photo(7, { selected: false, dropReason: 'decode-failed', width: undefined }),
    ];
    expect(analyseSet(scores)).toMatchObject({
      total: 7,
      selected: 3,
      portrait: 5,
      landscape: 1,
      square: 1,
      blurry: 1,
      dark: 1,
      bright: 1,
      duplicates: 1,
      exifCount: 7,
      spanMs: 6 * 20 * MIN,
      maxGapMs: 20 * MIN,
    });
  });

  it('ignores times that did not come from EXIF', () => {
    const f = analyseSet(set(6, () => ({ timeSource: 'lastModified' })));
    expect(f).toMatchObject({ exifCount: 0, spanMs: null, maxGapMs: null });
  });

  it('reads the opener as the earliest kept photo', () => {
    const scores = set(6, (i) => ({ sharpness: i === 0 ? 30 : 400 }));
    expect(analyseSet(scores.reverse()).openerSharpness).toBe(30);
  });
});

describe('adviceFor rules', () => {
  it('too-few: fewer than five photos made the cut', () => {
    expect(tipIds(set(4))).toContain('too-few');
    expect(tipIds(set(5))).not.toContain('too-few');
  });

  it('soft-opener: the first kept photo is soft', () => {
    expect(tipIds(set(8, (i) => ({ sharpness: i === 0 ? 70 : 400 })))).toContain('soft-opener');
    expect(tipIds(set(8, (i) => ({ sharpness: i === 0 ? 120 : 400 })))).not.toContain(
      'soft-opener',
    );
  });

  it('mostly-portrait: 70% or more portrait asks for a wide shot', () => {
    expect(tipIds(set(10))).toContain('mostly-portrait');
    expect(tipIds(set(10, (i) => (i < 4 ? landscape : {})))).not.toContain('mostly-portrait');
  });

  it('mostly-landscape: 70% or more landscape asks for a close-up', () => {
    expect(tipIds(set(10, () => landscape))).toContain('mostly-landscape');
    expect(tipIds(set(10, (i) => (i < 5 ? landscape : {})))).not.toContain('mostly-landscape');
  });

  it('does not judge shape on fewer than five measured photos', () => {
    expect(tipIds(set(4))).not.toContain('mostly-portrait');
  });

  it('time-gap: a jump of three hours or more', () => {
    const gap = (i: number) => ({ timeMs: i < 4 ? i * 10 * MIN : 5 * HOUR + i * 10 * MIN });
    const tips = adviceFor(analyseSet(set(8, gap))).tips;
    expect(tips.find((t) => t.id === 'time-gap')?.text).toContain('5 hours');
    expect(tipIds(set(8, (i) => ({ timeMs: i * 2 * HOUR })))).not.toContain('time-gap');
  });

  it('one-moment: five or more EXIF shots inside half an hour', () => {
    expect(tipIds(set(8, (i) => ({ timeMs: i * MIN })))).toContain('one-moment');
    expect(tipIds(set(8, (i) => ({ timeMs: i * 10 * MIN })))).not.toContain('one-moment');
    expect(tipIds(set(8, (i) => ({ timeMs: i * MIN, timeSource: 'pickOrder' })))).not.toContain(
      'one-moment',
    );
  });

  it('weak-shots: three or more soft, dark or bright photos', () => {
    const weak = (n: number) =>
      set(10, (i) => (i < n ? { selected: false, dropReason: 'blurry' } : {}));
    expect(tipIds(weak(3))).toContain('weak-shots');
    expect(tipIds(weak(2))).not.toContain('weak-shots');
  });

  it('look-alikes: three or more near-duplicates', () => {
    const dupes = (n: number) =>
      set(10, (i) => (i < n ? { selected: false, dropReason: 'near-duplicate' } : {}));
    expect(tipIds(dupes(3))).toContain('look-alikes');
    expect(tipIds(dupes(2))).not.toContain('look-alikes');
  });

  it('gives each tip its reason, a kind and a priority', () => {
    const tip = adviceFor(analyseSet(set(10))).tips[0];
    expect(tip).toMatchObject({ id: 'mostly-portrait', kind: 'broll' });
    expect(tip?.because.length).toBeGreaterThan(0);
  });

  it('keeps at most three tips, most important first', () => {
    const messy = set(10, (i) => ({
      sharpness: i === 0 ? 30 : 400,
      timeMs: i * MIN,
      ...(i > 6 ? { selected: false, dropReason: 'blurry' as const } : {}),
    }));
    const { tips } = adviceFor(analyseSet(messy));
    expect(tips).toHaveLength(MAX_TIPS);
    expect(tips.map((t) => t.priority)).toEqual([...tips.map((t) => t.priority)].sort());
    expect(tips[0]?.id).toBe('soft-opener');
  });
});

describe('adviceFor card text', () => {
  it('names what is strong for a varied set', () => {
    const scores = set(10, (i) => ({ ...(i % 2 ? landscape : {}), timeMs: i * HOUR }));
    const advice = adviceFor(analyseSet(scores));
    expect(advice.summary).toBe('10 photos, 10 in your reel.');
    expect(advice.strengths).toEqual([
      '10 sharp, well-lit shots to work with.',
      'A good mix of portrait and landscape.',
      'Spread over 9 hours.',
    ]);
    expect(advice.tips).toEqual([]);
  });

  it('does not praise the time spread when a gap tip fired', () => {
    const scores = set(8, (i) => ({ timeMs: i < 4 ? i * HOUR : 9 * HOUR + i * HOUR }));
    expect(adviceFor(analyseSet(scores)).strengths.join(' ')).not.toContain('Spread over');
  });

  it('formats spans in plain words', () => {
    expect(formatSpan(20 * MIN)).toBe('20 minutes');
    expect(formatSpan(HOUR)).toBe('1 hour');
    expect(formatSpan(5 * HOUR)).toBe('5 hours');
  });

  it('never uses the word AI', () => {
    const texts = adviceFor(analyseSet(set(10)))
      .tips.map((t) => t.text)
      .join(' ');
    expect(texts).not.toMatch(/\bAI\b/i);
  });
});
