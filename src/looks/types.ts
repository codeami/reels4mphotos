import type { LookId } from '../types/reel-plan';

export type { LookId };

export type Easing = 'linear' | 'ease-out-cubic' | 'smoothstep';

// A scale that moves from `from` to `to` over `frames` frames after each cut, then drifts.
export interface Punch {
  from: number;
  to: number;
  frames: number;
  easing: Easing;
  // Extra scale per second once the envelope has finished ("then slow drift").
  driftPerSec: number;
}

// A white fill that starts at `peak` on the cut and fades linearly to nothing over `frames`.
export interface Flash {
  peak: number;
  frames: number;
}

export type BlendOp = 'source-over' | 'multiply' | 'soft-light' | 'screen' | 'overlay';

// One translucent full-frame fill: the whole of a "simple colour grade".
export interface GradeFill {
  op: BlendOp;
  color: string;
  alpha: number;
}

// How a look is cut: used by the planner (src/curation/plan.ts).
export interface LookPlanning {
  // Shot length range in beats; null keeps the classic spacing (about target / photos).
  cutBeats: readonly [number, number] | null;
  // Photos may repeat to fill the length, at most this many passes through the set.
  maxPasses: number;
  // Which shots fade in: 'default' is every third, as before looks existed.
  crossfade: 'default' | 'all' | 'none';
  // Ken Burns end zoom (1 = still).
  kenBurnsZoom: number;
  // Cut length in ms when the beat map is too sparse to count beats. Looks that work with a single
  // photo need it: without it a sparse map would give one shot of the whole reel.
  fallbackCutMs?: number;
  // A photo that comes round again gets a different crop and motion, not the same four moves.
  varyRepeats?: boolean;
}

// Neon edge pulse. The outline is found from the photo's own edges: plain image maths (Sobel on a
// small grey copy), not a model. It is drawn in light over a dimmed photo and expands on the cut.
export interface EdgePulse {
  // Width in pixels of the downscaled copy the edges are found on.
  mapWidth: number;
  // Edge strength, as a fraction of the strong-edge level, where a line starts and is full.
  threshold: number;
  softness: number;
  // Lines are thickened by this many pixels of the small copy.
  thicken: number;
  // How dark the photo goes under the lines (alpha of a black fill).
  dim: number;
  lineColor: string;
  glowColor: string;
  // Alpha of the outline between beats, and on the cut.
  baseAlpha: number;
  peakAlpha: number;
  glowAlpha: number;
  // Expanding copies of the outline: how many, frames between their starts, frames each lasts, the
  // growth at the end of its life (0.2 = 20% larger), and its alpha when it starts.
  rings: number;
  ringDelayFrames: number;
  ringFrames: number;
  maxExpand: number;
  ringPeak: number;
}

// Zoom-through: the photo drawn inside itself, `inner` times the size each level down, pushing in
// over the length of the shot so the next level takes the place of the one above it.
export interface ZoomThrough {
  inner: number;
  // Levels smaller than this fraction of the frame are not drawn.
  minScale: number;
  // Width of the white frame around each inner copy, as a fraction of frame width.
  border: number;
}

// Glitch slice: the frame is cut into horizontal strips that slide sideways and split into red,
// green and blue on the cut, then snap back over `frames`.
export interface Glitch {
  strips: number;
  // Largest slide, as a fraction of frame width.
  peak: number;
  frames: number;
  // Which share of the strips move on a glitch frame.
  share: number;
  // Red and blue pull apart by this fraction of the largest slide, scaled by how far the glitch is.
  chroma: number;
}

// The shape of a reel, for a recipe that describes a format and not only an effect. Used by the
// planner (src/curation/plan.ts); a look without one is cut as it always was. Counts are beats of
// the chosen track.
export interface Structure {
  // The opening window: how long it lasts and how many beats each photo stays on screen in it.
  // `bestPhoto` puts the highest scoring photo first.
  hook: { unit: 'seconds' | 'beats'; length: number; beatsPerPhoto: number; bestPhoto?: boolean };
  // The middle, in order. A section takes `photos` photos (the last one takes whatever is left).
  beats: readonly { name: string; beatsPerPhoto: number; photos?: number }[];
  // The last shot, held for `beatsPerPhoto` beats. `bestPhoto` puts the highest scoring photo there.
  payoff: { beatsPerPhoto: number; bestPhoto?: boolean };
  // Places for words. Always empty: nothing draws text yet.
  textSlots: readonly never[];
}

// Everything a look does, as data. Sizes are fractions of the frame so one look serves the
// 1080x1920 export and the smaller preview alike.
export interface Look {
  id: LookId;
  // Plain words for the look chips.
  name: string;
  blurb: string;
  // 'cover' fills the frame with a 9:16 crop; 'contain' fits any crop inside it, over `backdrop`.
  fit: 'cover' | 'contain';
  backdrop: 'black' | 'blur' | 'colour';
  // Frames a crossfade occupies, centred on the cut; the shape of its fade. Unused when no shot fades.
  crossfadeFrames: number;
  crossfadeEasing: Easing;
  planning: LookPlanning;
  // Fewest different photos the look can be cut from; absent means DEFAULT_MIN_PHOTOS.
  minPhotos?: number;
  punch: Punch | null;
  flash: Flash | null;
  // Peak drift of the photo in a small shake, as a fraction of frame width.
  shake: number;
  grain: number; // alpha of the noise, 0 = none
  vignette: number; // alpha at the corners, 0 = none
  letterbox: number; // bar height as a fraction of frame height, 0 = none
  grade: readonly GradeFill[];
  // At most one of these three is set; each look that sets one is drawn by its own small module.
  edgePulse?: EdgePulse;
  zoomThrough?: ZoomThrough;
  glitch?: Glitch;
  structure?: Structure;
}
