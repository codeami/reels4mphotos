import type { Structure } from '../looks';
import type { PlanPhoto } from './types';
import { must } from './must';

/** What a structured cut works out before any beat map is read: who plays when, and for how long. */
export interface StructuredCut {
  /** One photo per shot, in play order. */
  photos: PlanPhoto[];
  /** Beats each shot lasts, same length as `photos`. */
  beatsPerShot: number[];
}

/**
 * Photos in the order a structure plays them. The reel's own order is kept except where the recipe
 * asks for the best photo: `hook.bestPhoto` moves the highest scoring one to the front, and
 * `payoff.bestPhoto` puts the highest scoring one still unused last. With no scores (or only one
 * photo) the order is left alone.
 */
export function orderForStructure(chosen: PlanPhoto[], structure: Structure): PlanPhoto[] {
  const scored = chosen.every((p) => p.quality !== undefined);
  const byQuality = scored ? [...chosen].sort((a, b) => must(b.quality) - must(a.quality)) : [];
  let rest = [...chosen];
  const take = (photo: PlanPhoto | undefined) => {
    if (photo) rest = rest.filter((p) => p !== photo);
    return photo;
  };
  const first = scored && structure.hook.bestPhoto ? take(byQuality[0]) : undefined;
  const last =
    rest.length > 1 && scored && structure.payoff.bestPhoto
      ? take(byQuality.find((p) => p !== first))
      : rest.length > 1
        ? take(rest[rest.length - 1])
        : undefined;
  return [...(first ? [first] : []), ...rest, ...(last ? [last] : [])];
}

/**
 * Cut a reel to a recipe's structure: the hook, the sections, then the payoff as the last shot.
 * Shots keep coming (photos go round again, up to `maxPasses` times) until the reel would reach
 * `targetBeats` with the payoff on the end. Returns null when there is nothing to cut.
 */
export function structuredCut(
  chosen: PlanPhoto[],
  structure: Structure,
  beatMs: number,
  targetBeats: number,
  maxPasses: number,
): StructuredCut | null {
  if (chosen.length === 0) return null;
  const ordered = orderForStructure(chosen, structure);
  // With two or more photos the last one is held back for the payoff.
  const payoff = ordered.length > 1 ? must(ordered[ordered.length - 1]) : undefined;
  const body = payoff ? ordered.slice(0, -1) : ordered;
  const payoffBeats = structure.payoff.beatsPerPhoto;
  const hookBeats =
    structure.hook.unit === 'beats'
      ? structure.hook.length
      : (structure.hook.length * 1000) / beatMs;

  const photos: PlanPhoto[] = [];
  const beatsPerShot: number[] = [];
  let cursor = 0;
  let sectionLeft = structure.beats[0]?.photos ?? Infinity;
  let section = 0;
  const cap = ordered.length * maxPasses;
  while (photos.length < cap - 1) {
    const reached = cursor + payoffBeats >= targetBeats;
    if (reached && photos.length >= body.length) break;
    const inHook = cursor < hookBeats;
    if (!inHook && sectionLeft <= 0 && section < structure.beats.length - 1) {
      section += 1;
      sectionLeft = structure.beats[section]?.photos ?? Infinity;
    }
    const beats = inHook
      ? structure.hook.beatsPerPhoto
      : must(structure.beats[section]).beatsPerPhoto;
    if (!inHook) sectionLeft -= 1;
    photos.push(must(body[photos.length % body.length]));
    beatsPerShot.push(beats);
    cursor += beats;
  }
  if (payoff) {
    photos.push(payoff);
    beatsPerShot.push(payoffBeats);
  }
  return { photos, beatsPerShot };
}

/**
 * Shot end times for a structured cut, one per shot, each on a beat; null when the beat map is too
 * short to carry it (the caller then cuts the way the look always did).
 */
export function structuredEnds(
  chosen: PlanPhoto[],
  structure: Structure,
  maxPasses: number,
  targetMs: number,
  ceilingMs: number,
  beatsMs: number[],
  minCover: number,
): { photos: PlanPhoto[]; ends: number[] } | null {
  const beats = [...new Set(beatsMs)].filter((b) => b >= 0 && b <= ceilingMs).sort((a, b) => a - b);
  if (beats.length < 2) return null;
  const beatMs = (must(beats[beats.length - 1]) - must(beats[0])) / (beats.length - 1);
  const cut = structuredCut(chosen, structure, beatMs, targetMs / beatMs, maxPasses);
  if (!cut) return null;
  let cursor = 0;
  const ends = cut.beatsPerShot.map((n) => (cursor += n));
  if (cursor > beats.length - 1) return null;
  const onBeats = ends.map((i) => must(beats[i]));
  return must(onBeats[onBeats.length - 1]) < minCover * targetMs
    ? null
    : { photos: cut.photos, ends: onBeats };
}
