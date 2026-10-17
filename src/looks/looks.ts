import { CROSSFADE_FRAMES } from '../render/constants';
import type { Look, LookId } from './types';

// Numbers come from the scout's recipes (data/reels-style-catalog-scout/looks.json), which were
// read from public style descriptions and parameters only; no code was copied. Each look below
// names its recipe. docs/looks.md describes them in words.
export const LOOKS: Readonly<Record<LookId, Look>> = {
  // Today's reel: Ken Burns on a black frame, a short fade on every third cut.
  classic: {
    id: 'classic',
    name: 'Classic',
    blurb: 'Soft fades and slow drifts. The original.',
    fit: 'cover',
    backdrop: 'black',
    crossfadeFrames: CROSSFADE_FRAMES,
    crossfadeEasing: 'linear',
    planning: { cutBeats: null, maxPasses: 1, crossfade: 'default', kenBurnsZoom: 1.2 },
    punch: null,
    flash: null,
    shake: 0,
    grain: 0,
    vignette: 0,
    letterbox: 0,
    grade: [],
  },

  // looks.json "zoom-punch": cuts of 1 beat; scale 1.00 to 1.12 over the first 6 frames after each
  // beat (ease-out cubic), then slow drift; soft vignette; blurred copy of the photo behind.
  'zoom-punch': {
    id: 'zoom-punch',
    name: 'Zoom punch',
    blurb: 'A quick push-in on every beat.',
    fit: 'contain',
    backdrop: 'blur',
    crossfadeFrames: 0,
    crossfadeEasing: 'linear',
    planning: { cutBeats: [1, 1], maxPasses: 3, crossfade: 'none', kenBurnsZoom: 1.06 },
    punch: { from: 1, to: 1.12, frames: 6, easing: 'ease-out-cubic', driftPerSec: 0.02 },
    flash: null,
    shake: 0,
    grain: 0,
    vignette: 0.35,
    letterbox: 0,
    grade: [],
  },

  // looks.json "flash-cut": cuts of 1 beat; white fill alpha 0.8 to 0 over 4 frames from each
  // beat; photo scale 1.05 to 1.0 over the same frames; light grain and vignette; blurred fill.
  'flash-cut': {
    id: 'flash-cut',
    name: 'Flash cut',
    blurb: 'A white flash on every cut.',
    fit: 'contain',
    backdrop: 'blur',
    crossfadeFrames: 0,
    crossfadeEasing: 'linear',
    planning: { cutBeats: [1, 1], maxPasses: 3, crossfade: 'none', kenBurnsZoom: 1.04 },
    punch: { from: 1.05, to: 1, frames: 4, easing: 'linear', driftPerSec: 0 },
    flash: { peak: 0.8, frames: 4 },
    shake: 0,
    grain: 0.05,
    vignette: 0.4,
    letterbox: 0,
    grade: [],
  },

  // looks.json "cinematic": cuts of 4 to 8 beats; smoothstep crossfade of 18 frames; letterbox
  // bars, medium grain, vignette; teal shadows and warm highlights; black background.
  cinematic: {
    id: 'cinematic',
    name: 'Cinematic',
    blurb: 'Slow and moody, with black bars.',
    fit: 'contain',
    backdrop: 'black',
    crossfadeFrames: 18,
    crossfadeEasing: 'smoothstep',
    planning: { cutBeats: [4, 8], maxPasses: 1, crossfade: 'all', kenBurnsZoom: 1.1 },
    punch: null,
    flash: null,
    shake: 0,
    grain: 0.09,
    vignette: 0.5,
    letterbox: 0.1,
    grade: [
      { op: 'multiply', color: '#9fd2d8', alpha: 0.18 },
      { op: 'soft-light', color: '#ffb36b', alpha: 0.22 },
    ],
  },

  // looks.json "photo-dump": cuts of 1 to 2 beats; light grain; average photo colour behind a
  // photo that does not fill the frame; small shake. Date stamp and flash share are left out
  // (no text yet).
  'photo-dump': {
    id: 'photo-dump',
    name: 'Photo dump',
    blurb: 'Fast, casual, a little shaky.',
    fit: 'contain',
    backdrop: 'colour',
    crossfadeFrames: 0,
    crossfadeEasing: 'linear',
    planning: { cutBeats: [1, 2], maxPasses: 3, crossfade: 'none', kenBurnsZoom: 1.03 },
    punch: null,
    flash: null,
    shake: 0.004,
    grain: 0.05,
    vignette: 0,
    letterbox: 0,
    grade: [{ op: 'soft-light', color: '#ffd9a0', alpha: 0.2 }],
  },

  // Single-photo looks (minPhotos 1). Our own recipes, in the scout catalog's style. None needs a
  // model: the neon outline is a Sobel edge map of the photo itself.

  // Cuts of 1 to 2 beats, so one photo comes round with a new crop on every beat. The photo is
  // dimmed and its edge outline is drawn in light, with copies of it growing outwards on the cut.
  'neon-edge-pulse': {
    id: 'neon-edge-pulse',
    name: 'Neon edge',
    blurb: 'A glowing outline of the photo pulses outwards on the beat.',
    fit: 'contain',
    backdrop: 'blur',
    crossfadeFrames: 0,
    crossfadeEasing: 'linear',
    planning: {
      cutBeats: [1, 2],
      maxPasses: 40,
      crossfade: 'none',
      kenBurnsZoom: 1.08,
      fallbackCutMs: 750,
      varyRepeats: true,
    },
    minPhotos: 1,
    punch: null,
    flash: null,
    shake: 0,
    grain: 0,
    vignette: 0.45,
    letterbox: 0,
    grade: [],
    edgePulse: {
      mapWidth: 256,
      threshold: 0.22,
      softness: 0.3,
      thicken: 1,
      dim: 0.6,
      lineColor: '#d9fbff',
      glowColor: '#14b8ff',
      baseAlpha: 0.5,
      peakAlpha: 1,
      glowAlpha: 0.55,
      rings: 2,
      ringDelayFrames: 3,
      ringFrames: 16,
      maxExpand: 0.16,
      ringPeak: 0.85,
    },
  },

  // Cuts of 2 beats. The picture pushes in over the shot while the same picture sits smaller in
  // its middle; the inner copy grows into the place of the outer one, and the loop starts again
  // with a white flash on the cut.
  'zoom-through': {
    id: 'zoom-through',
    name: 'Zoom through',
    blurb: 'The photo opens up to reveal itself inside itself.',
    fit: 'cover',
    backdrop: 'black',
    crossfadeFrames: 0,
    crossfadeEasing: 'linear',
    planning: {
      cutBeats: [2, 2],
      maxPasses: 40,
      crossfade: 'none',
      kenBurnsZoom: 1.06,
      fallbackCutMs: 1000,
      varyRepeats: true,
    },
    minPhotos: 1,
    punch: null,
    flash: { peak: 0.65, frames: 5 },
    shake: 0,
    grain: 0,
    vignette: 0.3,
    letterbox: 0,
    grade: [],
    zoomThrough: { inner: 0.5, minScale: 0.06, border: 0.005 },
  },

  // Cuts of 1 beat. On the cut the frame splits into strips that slide sideways with the red and
  // blue pulled apart, then it snaps back before the next beat.
  'glitch-slice': {
    id: 'glitch-slice',
    name: 'Glitch slice',
    blurb: 'The photo tears into strips on the beat and snaps back.',
    fit: 'cover',
    backdrop: 'black',
    crossfadeFrames: 0,
    crossfadeEasing: 'linear',
    planning: {
      cutBeats: [1, 1],
      maxPasses: 40,
      crossfade: 'none',
      kenBurnsZoom: 1.1,
      fallbackCutMs: 500,
      varyRepeats: true,
    },
    minPhotos: 1,
    punch: null,
    flash: null,
    shake: 0,
    grain: 0.07,
    vignette: 0.3,
    letterbox: 0,
    grade: [],
    glitch: { strips: 14, peak: 0.1, frames: 9, share: 0.6, chroma: 0.4 },
  },
};

export const DEFAULT_LOOK: LookId = 'classic';

// A look cut from fewer different photos than this is a look nobody asked for: unless it says
// otherwise it needs five, as the app always has.
export const DEFAULT_MIN_PHOTOS = 5;

export function minPhotosOf(look: Look): number {
  return look.minPhotos ?? DEFAULT_MIN_PHOTOS;
}

// The fewest photos any look can be cut from: what the first screen asks for.
export const FEWEST_PHOTOS = Math.min(...Object.values(LOOKS).map(minPhotosOf));

// Plain words for a plan that has too few photos for its look, or null when it has enough.
export function photoShortfall(look: Look, photos: number): string | null {
  const min = minPhotosOf(look);
  if (photos >= min) return null;
  return `${look.name} needs at least ${min} photos (you have ${photos}).`;
}

// The look to use for this many photos: the wanted one when it works, else the first in chip order
// that does.
export function lookForPhotoCount(wanted: LookId, photos: number): LookId {
  if (photos >= minPhotosOf(LOOKS[wanted])) return wanted;
  return LOOK_ORDER.find((id) => photos >= minPhotosOf(LOOKS[id])) ?? wanted;
}

// The order of the chips on the preview screen.
export const LOOK_ORDER: readonly LookId[] = [
  'classic',
  'zoom-punch',
  'flash-cut',
  'cinematic',
  'photo-dump',
  'neon-edge-pulse',
  'zoom-through',
  'glitch-slice',
];

export function isLookId(value: unknown): value is LookId {
  return typeof value === 'string' && Object.hasOwn(LOOKS, value);
}

// A plan without a look id is a classic one.
export function lookOf(plan: { look?: LookId }): Look {
  return LOOKS[plan.look ?? DEFAULT_LOOK];
}
