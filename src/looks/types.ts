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
  punch: Punch | null;
  flash: Flash | null;
  // Peak drift of the photo in a small shake, as a fraction of frame width.
  shake: number;
  grain: number; // alpha of the noise, 0 = none
  vignette: number; // alpha at the corners, 0 = none
  letterbox: number; // bar height as a fraction of frame height, 0 = none
  grade: readonly GradeFill[];
}
