import type { Engines, LoadedTrack, PhotoScore, ReelPlan } from './seams/types';

export type Step = 'add' | 'pick' | 'track' | 'preview' | 'export';
export const STEPS: Step[] = ['add', 'pick', 'track', 'preview', 'export'];

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
  | { kind: 'done'; file: File; silent: boolean; url: string; saved: boolean }
  | { kind: 'error'; message: string };

export interface State {
  step: Step;
  busy: string | null; // label while decoding / curating
  files: File[]; // accepted, decodable files, in pick order
  skipped: Skipped[];
  notice: string | null; // count-range message etc.
  photos: Photo[]; // after selection, in `files` order
  order: string[]; // photoIds in the reel, in play order
  plan: ReelPlan | null;
  trackId: string | null;
  track: LoadedTrack | null;
  exp: ExportState;
  announce: string; // aria-live text
}

export const initialState = (): State => ({
  step: 'add',
  busy: null,
  files: [],
  skipped: [],
  notice: null,
  photos: [],
  order: [],
  plan: null,
  trackId: null,
  track: null,
  exp: { kind: 'idle' },
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
