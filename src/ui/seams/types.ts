// LOCAL COPY of the shared seams so this branch builds before the sibling
// workstreams land. At merge, replace the ReelPlan block with
//   export type { Rect, Transition, ReelShot, ReelPlan } from '../../types/reel-plan';
// (owned by the curation workstream). The shapes below are the agreed ones.
export type Rect = { x: number; y: number; w: number; h: number };
export type Transition = 'cut' | 'crossfade';
export interface ReelShot {
  photoId: string;
  startMs: number;
  durationMs: number;
  transition: Transition;
  kenBurns: { from: Rect; to: Rect };
}
export interface ReelPlan {
  version: 1;
  width: 1080;
  height: 1920;
  fps: 30;
  trackId: string;
  totalMs: number;
  shots: ReelShot[];
}

export interface BeatMap {
  version: 1;
  trackId: string;
  durationMs: number;
  bpm: number;
  beatsMs: number[];
}

// Curation is split the way the flow is: photos are chosen first (no beat map
// exists yet), and a plan is built once a track is picked. These are the real
// curation types, so a drift in their shape fails the build here.
import type { PhotoScore, PlanPhoto, SelectOptions, SelectResult } from '../../curation/types';
export type { PhotoScore, PlanPhoto, SelectOptions };
/** What the UI reads from a selection run. */
export type Selection = Pick<SelectResult, 'chosen' | 'scores'>;

export interface Track {
  id: string;
  title: string;
  mood: string;
}
export interface LoadedTrack extends Track {
  audioUrl: string;
  beatmap: BeatMap;
}

export interface RenderOutcome {
  blob: Blob;
  silent: boolean; // render engine produced video without an audio track
}

export interface Engines {
  /** Choose the best photos, in reel order. Needs no track. */
  select(files: File[], opts: SelectOptions): Promise<Selection>;
  /** Plan a reel from these photos, in this order, on a track's beats. */
  plan(photos: PlanPhoto[], beatmap: BeatMap): ReelPlan;
  render(
    plan: ReelPlan,
    photos: Map<string, Blob>,
    beatmap: BeatMap,
    onProgress: (p: number) => void,
  ): Promise<RenderOutcome>;
  tracks: Track[];
  loadTrack(id: string): Promise<LoadedTrack>;
  // true when any part is a local fake, so the UI can say so out loud
  fake: boolean;
}
