import { DEFAULT_LENGTH_MS } from './logic';
import type { Staged } from './staging';
import { initialRating, type RatingState } from './rating';
import { DEFAULT_LOOK } from '../looks';
import type { Engines, LoadedTrack, LookId, PhotoScore, ReelPlan } from './seams/types';

// `pick` and `track` are the Customize screens (Photos, Music), reached from the preview.
export type Step = 'add' | 'review' | 'preview' | 'pick' | 'track' | 'export';
/** The stepper shows three stages; the Customize screens count as the preview stage. */
export const STEPS = ['add', 'preview', 'export'] as const;
export const stageOf = (step: Step): (typeof STEPS)[number] =>
  step === 'pick' || step === 'track' ? 'preview' : step === 'review' ? 'add' : step;

export interface Photo {
  id: string; // photoId from curation
  file: File;
  url: string; // object URL for thumbnails; revoked on reset
  score: PhotoScore;
}
export interface Skipped {
  name: string;
  reason: string;
}
export type ExportState =
  | { kind: 'idle' }
  | { kind: 'rendering'; progress: number }
  | {
      kind: 'done';
      file: File;
      silent: boolean;
      withoutMusic: boolean;
      url: string;
      saved: boolean;
    }
  | { kind: 'error'; message: string }
  | { kind: 'cleared' };

export interface State {
  step: Step;
  busy: string | null; // label while decoding / curating
  staged: Staged[]; // just picked, shown in the review grid until Done
  files: File[]; // accepted, decodable files, in pick order
  skipped: Skipped[];
  notice: string | null; // count-range message etc.
  photos: Photo[]; // after selection, in `files` order
  order: string[]; // photoIds in the reel, in play order
  plan: ReelPlan | null;
  trackId: string | null;
  track: LoadedTrack | null;
  lengthMs: number; // target reel length; the plan clamps it to what the track can carry
  look: LookId; // how the reel is cut and drawn; written into the plan and used by the export
  withoutMusic: boolean; // export the video with no music, to add a song inside Instagram
  dropWeak: boolean; // leave out soft, badly exposed and repeat photos when choosing (on by default)
  exp: ExportState;
  rating: RatingState;
  confirmClear: boolean; // the "clear app copies" question is open
  announce: string; // aria-live text
}

export const initialState = (): State => ({
  step: 'add',
  busy: null,
  staged: [],
  files: [],
  skipped: [],
  notice: null,
  photos: [],
  order: [],
  plan: null,
  trackId: null,
  track: null,
  lengthMs: DEFAULT_LENGTH_MS,
  look: DEFAULT_LOOK,
  withoutMusic: false,
  dropWeak: true,
  exp: { kind: 'idle' },
  rating: initialRating(),
  confirmClear: false,
  announce: '',
});

export type Listener = (s: State) => void;
export function createStore() {
  let state = initialState();
  const listeners = new Set<Listener>();
  return {
    get: () => state,
    set(patch: Partial<State>) {
      state = { ...state, ...patch };
      listeners.forEach((l) => l(state));
    },
    subscribe(l: Listener) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    reset() {
      state = initialState();
      listeners.forEach((l) => l(state));
    },
  };
}
export type Store = ReturnType<typeof createStore>;
export type { Engines };
