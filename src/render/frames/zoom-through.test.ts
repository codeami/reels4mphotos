import { describe, expect, it } from 'vitest';
import { LOOKS } from '../../looks';
import { zoomLevels } from './zoom-through';

const ZOOM = LOOKS['zoom-through'].zoomThrough;
if (!ZOOM) throw new Error('zoom-through has no zoomThrough');

describe('zoomLevels', () => {
  it('starts with a frame-sized photo and the same photo at half size inside it', () => {
    const levels = zoomLevels(0, ZOOM);
    expect(levels[0]).toBe(1);
    expect(levels[1]).toBeCloseTo(0.5, 12);
  });

  it('draws the biggest first and stops at the smallest worth drawing', () => {
    for (const p of [0, 0.3, 0.7, 1]) {
      const levels = zoomLevels(p, ZOOM);
      expect([...levels].sort((a, b) => b - a)).toEqual(levels);
      expect(levels.slice(1).every((s) => s >= ZOOM.minScale)).toBe(true);
    }
  });

  it('always covers the frame with the biggest level', () => {
    for (let p = 0; p <= 1; p += 0.05) expect(zoomLevels(p, ZOOM)[0]).toBeGreaterThanOrEqual(1);
  });

  it('pushes in: every level grows as the shot goes on', () => {
    const a = zoomLevels(0.2, ZOOM);
    const b = zoomLevels(0.6, ZOOM);
    for (let k = 0; k < Math.min(a.length, b.length); k++) expect(b[k]).toBeGreaterThan(a[k] ?? 0);
  });

  it('loops: at the end level 1 sits where level 0 began, so the next shot starts on the same picture', () => {
    const end = zoomLevels(1, ZOOM);
    const start = zoomLevels(0, ZOOM);
    expect(end[1]).toBeCloseTo(start[0] ?? 0, 12);
    expect(end[2]).toBeCloseTo(start[1] ?? 0, 12);
    expect(end[0]).toBeCloseTo(1 / ZOOM.inner, 12);
  });

  it('clamps progress outside 0..1', () => {
    expect(zoomLevels(-2, ZOOM)).toEqual(zoomLevels(0, ZOOM));
    expect(zoomLevels(5, ZOOM)).toEqual(zoomLevels(1, ZOOM));
  });
});
