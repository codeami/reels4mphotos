import { describe, expect, it } from 'vitest';
import { keptFiles, stage, toggleKept } from './staging';

const files = ['a', 'b', 'c'].map((n) => new File([n], `${n}.jpg`, { type: 'image/jpeg' }));

describe('staging', () => {
  it('starts with every picked photo kept, in pick order', () => {
    const s = stage(files);
    expect(s.map((x) => [x.id, x.kept])).toEqual([
      [0, true],
      [1, true],
      [2, true],
    ]);
    expect(keptFiles(s)).toEqual(files);
  });

  it('toggles one photo without mutating the list', () => {
    const s = stage(files);
    const t = toggleKept(s, 1);
    expect(s[1]?.kept).toBe(true);
    expect(keptFiles(t).map((f) => f.name)).toEqual(['a.jpg', 'c.jpg']);
    expect(keptFiles(toggleKept(t, 1))).toEqual(files);
  });

  it('ignores an unknown id', () => {
    expect(keptFiles(toggleKept(stage(files), 99))).toEqual(files);
  });
});
