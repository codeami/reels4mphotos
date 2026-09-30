import { describe, expect, it } from 'vitest';
import { selectSpread } from './select';

// 20 candidates. The ten best by quality all sit in the first half of the timeline.
const candidates = Array.from({ length: 20 }, (_, i) => ({
  id: `p${i}`,
  t: i / 19,
  quality: i < 10 ? 0.9 - i * 0.01 : 0.7 - (i - 10) * 0.01,
}));

describe('selectSpread', () => {
  it('with no spread weight is exactly the top N by quality', () => {
    const ids = selectSpread(candidates, 10, 0);
    expect(new Set(ids)).toEqual(new Set(candidates.slice(0, 10).map((c) => c.id)));
  });

  it('pulls picks from the later half of the timeline instead of the raw top N', () => {
    const ids = selectSpread(candidates, 10, 0.4);
    const late = ids.filter((id) => candidates.find((c) => c.id === id)!.t > 0.5);
    expect(ids).toHaveLength(10);
    expect(late.length).toBeGreaterThanOrEqual(3);
  });

  it('always keeps the single best photo', () => {
    expect(selectSpread(candidates, 10, 0.4)).toContain('p0');
  });

  it('returns everything when there are N or fewer candidates', () => {
    expect(selectSpread(candidates.slice(0, 4), 10, 0.4).sort()).toEqual(['p0', 'p1', 'p2', 'p3']);
  });

  it('returns nothing for n = 0 or no candidates', () => {
    expect(selectSpread(candidates, 0, 0.4)).toEqual([]);
    expect(selectSpread([], 10, 0.4)).toEqual([]);
  });

  it('is deterministic', () => {
    expect(selectSpread(candidates, 10, 0.4)).toEqual(selectSpread(candidates, 10, 0.4));
  });

  it('does not let spread rescue a photo that is far worse', () => {
    const lopsided = [
      { id: 'good1', t: 0, quality: 0.95 },
      { id: 'good2', t: 0.05, quality: 0.94 },
      { id: 'good3', t: 0.1, quality: 0.93 },
      { id: 'awful', t: 1, quality: 0.05 },
    ];
    expect(selectSpread(lopsided, 3, 0.3)).not.toContain('awful');
  });
});
