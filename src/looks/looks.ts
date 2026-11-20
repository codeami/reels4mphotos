import classic from './recipes/classic.json' with { type: 'json' };
import zoomPunch from './recipes/zoom-punch.json' with { type: 'json' };
import flashCut from './recipes/flash-cut.json' with { type: 'json' };
import cinematic from './recipes/cinematic.json' with { type: 'json' };
import photoDump from './recipes/photo-dump.json' with { type: 'json' };
import neonEdgePulse from './recipes/neon-edge-pulse.json' with { type: 'json' };
import zoomThrough from './recipes/zoom-through.json' with { type: 'json' };
import glitchSlice from './recipes/glitch-slice.json' with { type: 'json' };
import galleryFlyThrough from './recipes/gallery-fly-through.json' with { type: 'json' };
import { parseRecipes } from './load';
import type { Look, LookId } from './types';

// Every look the engine can cut and draw, in chip order. A look behind a feature flag is listed
// here too (the renderer and the tests know it); chipOrder() leaves it out of the chips while the
// flag is off.
export const LOOK_ORDER: readonly LookId[] = [
  'classic',
  'zoom-punch',
  'flash-cut',
  'cinematic',
  'photo-dump',
  'gallery-fly-through',
  'neon-edge-pulse',
  'zoom-through',
  'glitch-slice',
];

// Feature flags a look can sit behind. The gallery look is off by default: it needs WebGL and the
// bundled three.js, and the captain has not seen it on a phone yet.
export interface LookFlags {
  gallery: boolean;
}

export const FLAGGED_LOOKS: Readonly<Partial<Record<LookId, keyof LookFlags>>> = {
  'gallery-fly-through': 'gallery',
};

// The chips to show: every look whose flag (if any) is on, in LOOK_ORDER.
export function chipOrder(flags: LookFlags): LookId[] {
  return LOOK_ORDER.filter((id) => {
    const flag = FLAGGED_LOOKS[id];
    return flag === undefined || flags[flag];
  });
}

// Each look is a recipe file in ./recipes (checked against recipe.schema.json when the app starts),
// so a look is data a person can read and edit. Numbers come from the scout's recipes
// (data/reels-style-catalog-scout/looks.json), read from public style descriptions and parameters
// only; no code was copied. docs/looks.md describes every look in words.
// The files are imported by name (not globbed) so Node, which runs the e2e specs, reads them too.
// recipes.test.ts checks that no file in the folder is left out.
const recipes = parseRecipes({
  './recipes/classic.json': classic,
  './recipes/zoom-punch.json': zoomPunch,
  './recipes/flash-cut.json': flashCut,
  './recipes/cinematic.json': cinematic,
  './recipes/photo-dump.json': photoDump,
  './recipes/neon-edge-pulse.json': neonEdgePulse,
  './recipes/zoom-through.json': zoomThrough,
  './recipes/glitch-slice.json': glitchSlice,
  './recipes/gallery-fly-through.json': galleryFlyThrough,
});

function recipeFor(id: LookId): Look {
  const look = recipes[id];
  if (!look) throw new Error(`Recipe src/looks/recipes/${id}.json is missing.`);
  return look;
}

export const LOOKS: Readonly<Record<LookId, Look>> = Object.fromEntries(
  LOOK_ORDER.map((id) => [id, recipeFor(id)]),
) as Record<LookId, Look>;

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

export function isLookId(value: unknown): value is LookId {
  return typeof value === 'string' && Object.hasOwn(LOOKS, value);
}

// A plan without a look id is a classic one.
export function lookOf(plan: { look?: LookId }): Look {
  return LOOKS[plan.look ?? DEFAULT_LOOK];
}
