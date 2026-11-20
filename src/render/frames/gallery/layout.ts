import type { Gallery } from '../../../looks';
import type { ReelPlan } from '../../../types/reel-plan';
import { FRAME_HEIGHT, FRAME_WIDTH } from '../../constants';
import { at } from '../../util';

// Every photo of a plan, in the order it first appears: the order they hang round the room.
export const galleryPhotoIds = (plan: ReelPlan): string[] => [
  ...new Set(plan.shots.map((shot) => shot.photoId)),
];

// The gallery as numbers: where each photo hangs, where the camera stands to look at it, and where
// the camera is on any frame. No three.js here, so it runs in Node and a unit test can check it.
// Metres; x runs west to east, z north (the back wall) to south, y up; the floor is y = 0.

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface Pose {
  readonly position: Vec3;
  readonly target: Vec3;
}

export const ROOM = { width: 10, depth: 8, height: 3.2 } as const;
// Height of every photo's centre.
export const HANG_HEIGHT = 1.55;
// The mat and the frame around each photo, on every side.
export const MAT = 0.07;
export const FRAME = 0.045;
// The camera sits a little above the photo's centre and looks down at it: the frames read as 3D.
const EYE_LIFT = 0.15;
// Space kept clear of the corners of a wall, and between neighbouring frames.
const CORNER_MARGIN = 0.8;
const SLOT_GAP = 0.3;
// A photo is never taller than this, so it stays off the floor and the ceiling.
const MAX_PHOTO_HEIGHT = 2;
// The camera never stands closer to a photo than this, nor nearer the far wall than this.
const MIN_DISTANCE = 1;
const WALL_CLEARANCE = 0.8;
// The flight between two photos is never shorter than this, nor more than this share of a shot.
const MIN_TRAVEL_MS = 300;
const MAX_TRAVEL_SHARE = 0.8;
// The opening flight from the overview to the first photo.
const APPROACH_MAX_MS = 1500;
const APPROACH_SHARE_OF_STOP = 0.65;

const FRAME_ASPECT = FRAME_WIDTH / FRAME_HEIGHT;

export interface Wall {
  // Centre of the wall at hanging height.
  readonly origin: Vec3;
  // Into the room.
  readonly normal: Vec3;
  // The direction the camera travels along this wall: clockwise round the room, seen from above.
  readonly along: Vec3;
  readonly length: number;
  // Rotation about y that turns a +z-facing plane into this wall.
  readonly rotationY: number;
}

const { width: W, depth: D } = ROOM;

// North (the back wall), then east, south and west: the camera walks round clockwise.
export const WALLS: readonly Wall[] = [
  {
    origin: { x: 0, y: HANG_HEIGHT, z: -D / 2 },
    normal: { x: 0, y: 0, z: 1 },
    along: { x: 1, y: 0, z: 0 },
    length: W,
    rotationY: 0,
  },
  {
    origin: { x: W / 2, y: HANG_HEIGHT, z: 0 },
    normal: { x: -1, y: 0, z: 0 },
    along: { x: 0, y: 0, z: 1 },
    length: D,
    rotationY: -Math.PI / 2,
  },
  {
    origin: { x: 0, y: HANG_HEIGHT, z: D / 2 },
    normal: { x: 0, y: 0, z: -1 },
    along: { x: -1, y: 0, z: 0 },
    length: W,
    rotationY: Math.PI,
  },
  {
    origin: { x: -W / 2, y: HANG_HEIGHT, z: 0 },
    normal: { x: 1, y: 0, z: 0 },
    along: { x: 0, y: 0, z: -1 },
    length: D,
    rotationY: Math.PI / 2,
  },
];

export interface HungPhoto {
  readonly photoId: string;
  // Width over height of the photo itself.
  readonly aspect: number;
}

export interface Slot {
  readonly photoId: string;
  readonly wall: number;
  // Centre of the photo, on the wall.
  readonly centre: Vec3;
  // Size of the photo itself (the mat and frame come on top).
  readonly width: number;
  readonly height: number;
  // Where the camera stops to look at it.
  readonly viewpoint: Pose;
}

export interface GalleryLayout {
  readonly slots: readonly Slot[];
  // Where the reel opens: inside the room, looking at the back wall.
  readonly overview: Pose;
  // Where the camera pulls back to after the last photo.
  readonly exit: Pose;
}

export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const scale = (v: Vec3, k: number): Vec3 => ({ x: v.x * k, y: v.y * k, z: v.z * k });
export const mix = (a: Vec3, b: Vec3, t: number): Vec3 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t,
});
export const distance = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

const smoothstep = (t: number): number => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

const mixPose = (a: Pose, b: Pose, t: number): Pose => ({
  position: mix(a.position, b.position, t),
  target: mix(a.target, b.target, t),
});

// How many photos each wall takes, in wall order: as even as it gets, the first walls one more.
export function wallCounts(photos: number, walls = WALLS.length): number[] {
  const base = Math.floor(photos / walls);
  const extra = photos % walls;
  return Array.from({ length: walls }, (_, w) => base + (w < extra ? 1 : 0));
}

// The width of a wall's share for one photo, frame and gap included.
const slotWidth = (wall: Wall, count: number): number => (wall.length - 2 * CORNER_MARGIN) / count;

// The area every photo gets: the recipe's, unless a photo would then not fit its share of the
// wall or would be too tall. Equal area at true aspect, so a portrait is narrower, not smaller.
export function photoArea(photos: readonly HungPhoto[], counts: readonly number[], wanted: number) {
  let area = wanted;
  let index = 0;
  counts.forEach((count, w) => {
    const widest = slotWidth(at(WALLS, w), count) - SLOT_GAP - 2 * (MAT + FRAME);
    for (let j = 0; j < count; j++) {
      const { aspect } = at(photos, index++);
      area = Math.min(
        area,
        (widest * widest) / aspect,
        MAX_PHOTO_HEIGHT * MAX_PHOTO_HEIGHT * aspect,
      );
    }
  });
  return Math.max(0.01, area);
}

// Where the camera stops for a photo of this size: far enough back for it to fill `fill` of the
// frame's height, or of its width for a wide photo, and never nearer than MIN_DISTANCE.
export function viewingDistance(
  width: number,
  height: number,
  look: Pick<Gallery, 'fov' | 'fill'>,
  roomExtent: number,
): number {
  const halfHeight = Math.tan((look.fov * Math.PI) / 360);
  const halfWidth = halfHeight * FRAME_ASPECT;
  const byHeight = height / (2 * look.fill * halfHeight);
  const byWidth = width / (2 * look.fill * halfWidth);
  return Math.min(Math.max(byHeight, byWidth, MIN_DISTANCE), roomExtent - WALL_CLEARANCE);
}

/**
 * Hangs the photos round the room in order, clockwise from the west end of the back wall, each at
 * the same area and its own aspect, and works out where the camera stops for each one.
 */
export function layoutGallery(photos: readonly HungPhoto[], look: Gallery): GalleryLayout {
  if (photos.length === 0) throw new RangeError('a gallery needs at least one photo');
  const counts = wallCounts(photos.length);
  const area = photoArea(photos, counts, look.photoArea);
  const slots: Slot[] = [];
  let index = 0;
  counts.forEach((count, w) => {
    const wall = at(WALLS, w);
    const share = slotWidth(wall, count);
    const usable = wall.length - 2 * CORNER_MARGIN;
    for (let j = 0; j < count; j++) {
      const photo = at(photos, index++);
      const height = Math.sqrt(area / photo.aspect);
      const width = height * photo.aspect;
      const u = -usable / 2 + share * (j + 0.5);
      const centre = add(wall.origin, scale(wall.along, u));
      const extent = wall.normal.z === 0 ? W : D;
      const d = viewingDistance(width, height, look, extent);
      slots.push({
        photoId: photo.photoId,
        wall: w,
        centre,
        width,
        height,
        viewpoint: {
          position: add(add(centre, scale(wall.normal, d)), { x: 0, y: EYE_LIFT, z: 0 }),
          target: centre,
        },
      });
    }
  });
  const last = at(slots, slots.length - 1);
  return {
    slots,
    overview: {
      position: { x: 0, y: 2.1, z: D / 2 - 1 },
      target: { x: 0, y: 1.3, z: -1.5 },
    },
    exit: { position: { x: 0, y: 2, z: 0.6 }, target: last.centre },
  };
}

export interface GalleryShot {
  readonly durationMs: number;
  // Index into the layout's slots.
  readonly slot: number;
}

// How long the flight at the end of a shot takes.
export function travelMs(durationMs: number, look: Pick<Gallery, 'travelShare' | 'travelMaxMs'>) {
  const wanted = Math.min(durationMs * look.travelShare, look.travelMaxMs);
  return Math.min(durationMs * MAX_TRAVEL_SHARE, Math.max(MIN_TRAVEL_MS, wanted));
}

/**
 * Where the camera is `progress` of the way through shot `k`. The camera reaches a photo exactly
 * as its shot begins (the cut, which the planner puts on a beat), stops there, and flies on in the
 * last part of the shot so it arrives at the next photo on the next cut. The first shot opens with
 * a flight in from the overview; the last ends with a pull back towards the middle of the room.
 */
export function cameraPoseAt(
  layout: GalleryLayout,
  shots: readonly GalleryShot[],
  k: number,
  progress: number,
  look: Pick<Gallery, 'travelShare' | 'travelMaxMs'>,
): Pose {
  const shot = at(shots, k);
  const here = at(layout.slots, shot.slot).viewpoint;
  const travel = travelMs(shot.durationMs, look);
  const travelStart = 1 - travel / shot.durationMs;
  const nextShot = shots[k + 1];
  const next = nextShot ? at(layout.slots, nextShot.slot).viewpoint : layout.exit;
  if (k === 0) {
    const approach =
      Math.min(APPROACH_MAX_MS, (shot.durationMs - travel) * APPROACH_SHARE_OF_STOP) /
      shot.durationMs;
    if (progress < approach) return mixPose(layout.overview, here, smoothstep(progress / approach));
  }
  if (progress <= travelStart) return here;
  return mixPose(here, next, smoothstep((progress - travelStart) / (1 - travelStart)));
}
