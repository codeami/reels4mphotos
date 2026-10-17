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
};

export const DEFAULT_LOOK: LookId = 'classic';

// The order of the chips on the preview screen.
export const LOOK_ORDER: readonly LookId[] = [
  'classic',
  'zoom-punch',
  'flash-cut',
  'cinematic',
  'photo-dump',
];

export function isLookId(value: unknown): value is LookId {
  return typeof value === 'string' && Object.hasOwn(LOOKS, value);
}

// A plan without a look id is a classic one.
export function lookOf(plan: { look?: LookId }): Look {
  return LOOKS[plan.look ?? DEFAULT_LOOK];
}
