import { describe, expect, it } from 'vitest';
import { LOOKS } from '../../../looks';
import {
  HANG_HEIGHT,
  ROOM,
  WALLS,
  cameraPoseAt,
  distance,
  layoutGallery,
  photoArea,
  travelMs,
  viewingDistance,
  wallCounts,
  type HungPhoto,
  type Vec3,
} from './layout';

const look = LOOKS['gallery-fly-through'].gallery;
if (!look) throw new Error('the gallery recipe has no gallery section');

// Landscape, portrait and square photos, as the harness and the app hand them in.
const ASPECTS = [4 / 3, 3 / 4, 1, 3 / 2, 2 / 3];
const photos = (n: number): HungPhoto[] =>
  Array.from({ length: n }, (_, i) => ({
    photoId: `p${i}`,
    aspect: ASPECTS[i % ASPECTS.length] ?? 1,
  }));

const inside = (p: Vec3, margin = 0) =>
  Math.abs(p.x) <= ROOM.width / 2 - margin &&
  Math.abs(p.z) <= ROOM.depth / 2 - margin &&
  p.y > 0 &&
  p.y < ROOM.height;

const close = (a: Vec3, b: Vec3) => distance(a, b) < 1e-9;

describe('wallCounts', () => {
  it('spreads the photos over the four walls, the first walls taking one more', () => {
    expect(wallCounts(5)).toEqual([2, 1, 1, 1]);
    expect(wallCounts(10)).toEqual([3, 3, 2, 2]);
    expect(wallCounts(12)).toEqual([3, 3, 3, 3]);
    expect(wallCounts(1)).toEqual([1, 0, 0, 0]);
  });
});

describe('layoutGallery', () => {
  it('hangs every photo on a wall at hanging height, inside the room, in order round the room', () => {
    for (const n of [5, 8, 10, 12]) {
      const { slots } = layoutGallery(photos(n), look);
      expect(slots.map((s) => s.photoId)).toEqual(photos(n).map((p) => p.photoId));
      // the walls come in order, and the slots walk along each wall in its travel direction
      slots.forEach((slot, i) => {
        const wall = WALLS[slot.wall];
        if (!wall) throw new Error('slot off the walls');
        expect(slot.centre.y).toBe(HANG_HEIGHT);
        expect(inside(slot.centre)).toBe(true);
        // on the wall's plane: the centre minus the origin has no component along the normal
        const off = {
          x: slot.centre.x - wall.origin.x,
          y: 0,
          z: slot.centre.z - wall.origin.z,
        };
        expect(Math.abs(off.x * wall.normal.x + off.z * wall.normal.z)).toBeLessThan(1e-9);
        const previous = slots[i - 1];
        if (previous) {
          expect(slot.wall).toBeGreaterThanOrEqual(previous.wall);
          if (slot.wall === previous.wall) {
            const step =
              (slot.centre.x - previous.centre.x) * wall.along.x +
              (slot.centre.z - previous.centre.z) * wall.along.z;
            expect(step).toBeGreaterThan(0);
          }
        }
      });
    }
  });

  it('gives every photo the same area at its own aspect', () => {
    const { slots } = layoutGallery(photos(10), look);
    for (const slot of slots) {
      expect(slot.width * slot.height).toBeCloseTo(look.photoArea, 6);
    }
    expect(slots[0] && slots[0].width / slots[0].height).toBeCloseTo(4 / 3, 6);
    expect(slots[1] && slots[1].width / slots[1].height).toBeCloseTo(3 / 4, 6);
  });

  it('shrinks the photos, all together, when a wall is crowded', () => {
    const many = layoutGallery(photos(40), look).slots;
    const area = many[0] ? many[0].width * many[0].height : 0;
    expect(area).toBeLessThan(look.photoArea);
    for (const slot of many) expect(slot.width * slot.height).toBeCloseTo(area, 6);
    // neighbours on one wall do not overlap
    many.forEach((slot, i) => {
      const next = many[i + 1];
      if (!next || next.wall !== slot.wall) return;
      expect(distance(slot.centre, next.centre)).toBeGreaterThan(slot.width / 2 + next.width / 2);
    });
    expect(photoArea(photos(40), wallCounts(40), 1.5)).toBe(area);
  });

  it('stands the camera in front of each photo, inside the room, looking at it', () => {
    const { slots, overview, exit } = layoutGallery(photos(12), look);
    for (const slot of slots) {
      const wall = WALLS[slot.wall];
      if (!wall) throw new Error('slot off the walls');
      const { position, target } = slot.viewpoint;
      expect(close(target, slot.centre)).toBe(true);
      expect(inside(position, 0.5)).toBe(true);
      // in front of the photo: along the wall's normal, a little above the centre
      const along =
        (position.x - slot.centre.x) * wall.normal.x + (position.z - slot.centre.z) * wall.normal.z;
      expect(along).toBeGreaterThanOrEqual(1);
      expect(position.y).toBeGreaterThan(slot.centre.y);
    }
    expect(inside(overview.position)).toBe(true);
    expect(inside(exit.position)).toBe(true);
    expect(close(exit.target, slots[slots.length - 1]?.centre ?? { x: 0, y: 0, z: 0 })).toBe(true);
  });

  it('refuses an empty gallery', () => {
    expect(() => layoutGallery([], look)).toThrow(RangeError);
  });
});

describe('viewingDistance', () => {
  it('stands further back from a bigger photo, and from a wide one, never closer than a metre', () => {
    const small = viewingDistance(0.8, 0.6, look, 8);
    const big = viewingDistance(1.6, 1.2, look, 8);
    const wide = viewingDistance(2.4, 0.6, look, 8);
    expect(big).toBeGreaterThan(small);
    expect(wide).toBeGreaterThan(small);
    expect(viewingDistance(0.1, 0.1, look, 8)).toBe(1);
    // and never through the far wall
    expect(viewingDistance(20, 20, look, 8)).toBeLessThan(8);
  });
});

describe('travelMs', () => {
  it('is the recipe share of the shot, capped, and never so long the stop disappears', () => {
    expect(travelMs(2000, look)).toBe(900);
    expect(travelMs(10_000, look)).toBe(look.travelMaxMs);
    expect(travelMs(400, look)).toBe(300);
    expect(travelMs(200, look)).toBe(160);
  });
});

describe('cameraPoseAt', () => {
  const layout = layoutGallery(photos(6), look);
  const shots = layout.slots.map((_, slot) => ({ durationMs: 2000, slot }));

  it('is at a photo exactly when its shot begins, and stays until the flight out', () => {
    for (let k = 1; k < shots.length; k++) {
      const here = layout.slots[k]?.viewpoint;
      if (!here) throw new Error('missing slot');
      expect(close(cameraPoseAt(layout, shots, k, 0, look).position, here.position)).toBe(true);
      expect(close(cameraPoseAt(layout, shots, k, 0.5, look).position, here.position)).toBe(true);
      const travelStart = 1 - travelMs(2000, look) / 2000;
      expect(close(cameraPoseAt(layout, shots, k, travelStart, look).position, here.position)).toBe(
        true,
      );
    }
  });

  it('flies out late in the shot and arrives at the next photo as the shot ends', () => {
    const next = layout.slots[3]?.viewpoint;
    const here = layout.slots[2]?.viewpoint;
    if (!next || !here) throw new Error('missing slot');
    const mid = cameraPoseAt(layout, shots, 2, 0.8, look).position;
    expect(close(mid, here.position)).toBe(false);
    expect(close(mid, next.position)).toBe(false);
    expect(distance(mid, here.position) + distance(mid, next.position)).toBeCloseTo(
      distance(here.position, next.position),
      6,
    );
    expect(close(cameraPoseAt(layout, shots, 2, 1, look).position, next.position)).toBe(true);
    // the move is monotonic: later in the flight is nearer the next photo
    let last = Infinity;
    for (let p = 0.6; p <= 1; p += 0.05) {
      const d = distance(cameraPoseAt(layout, shots, 2, p, look).position, next.position);
      expect(d).toBeLessThanOrEqual(last + 1e-9);
      last = d;
    }
  });

  it('opens from the overview and flies in to the first photo', () => {
    const first = layout.slots[0]?.viewpoint;
    if (!first) throw new Error('missing slot');
    expect(close(cameraPoseAt(layout, shots, 0, 0, look).position, layout.overview.position)).toBe(
      true,
    );
    expect(close(cameraPoseAt(layout, shots, 0, 0.5, look).position, first.position)).toBe(true);
  });

  it('pulls back to the exit after the last photo', () => {
    const last = shots.length - 1;
    const here = layout.slots[last]?.viewpoint;
    if (!here) throw new Error('missing slot');
    expect(close(cameraPoseAt(layout, shots, last, 0.2, look).position, here.position)).toBe(true);
    expect(close(cameraPoseAt(layout, shots, last, 1, look).position, layout.exit.position)).toBe(
      true,
    );
  });

  it('is a pure function of its arguments', () => {
    const a = cameraPoseAt(layout, shots, 3, 0.9, look);
    const b = cameraPoseAt(layout, shots, 3, 0.9, look);
    expect(a).toEqual(b);
  });
});
