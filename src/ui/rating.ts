import { MAX_RETRIES, type Attempt, type RerollCandidate } from '../curation/reroll';
import type { Photo } from './store';

export { MAX_RETRIES };
export const RATINGS = [1, 2, 3, 4, 5] as const;
/** Ratings from this one up end the loop. */
export const STOP_RATING = 5;

/** Lives in memory for the open set only. A rating is never stored or sent anywhere. */
export interface RatingState {
  value: number | null;
  /** New versions made so far for this set. */
  retries: number;
  /** Reels the user has already seen for this set. */
  seen: Attempt[];
  /** Which shots crossfade in the reel on screen (see `planReel`). */
  transitionOffset: number;
  note: string | null;
}

export const initialRating = (): RatingState => ({
  value: null,
  retries: 0,
  seen: [],
  transitionOffset: 0,
  note: null,
});

export type RatingDecision = 'stop' | 'retry' | 'cap';

/** 5 stops. 1 to 4 asks for another reel, until the retries are used up. */
export function decideRating(r: RatingState, value: number): RatingDecision {
  if (value >= STOP_RATING) return 'stop';
  return r.retries >= MAX_RETRIES ? 'cap' : 'retry';
}

export const NOTES = {
  stop: 'Glad you like it. Export when you are ready. Your rating stays on this device.',
  cap: `That's ${MAX_RETRIES} new versions. Try changing the photos.`,
  retry: (value: number, retry: number) =>
    `Rated ${value}. Here is a new version (${retry} of ${MAX_RETRIES}).`,
} as const;

/**
 * Photos a new version may use: the ones in the reel, plus good ones that were left out.
 * A photo the user took out by hand stays out.
 */
export function rerollPool(photos: readonly Photo[], order: readonly string[]): RerollCandidate[] {
  return photos
    .filter((p) => {
      if (order.includes(p.id)) return true;
      const { selected, dropReason } = p.score;
      return !selected && (dropReason === null || dropReason === 'not-selected');
    })
    .map((p) => ({
      photoId: p.id,
      width: p.score.width,
      height: p.score.height,
      quality: p.score.quality ?? 0.5,
      timeMs: p.score.timeMs,
    }));
}
