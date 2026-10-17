export type { Rect, Transition, LookId, ReelShot, ReelPlan } from '../../types/reel-plan';
import type { LookId, ReelPlan } from '../../types/reel-plan';

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

/** What the user chose on the export screen. */
export interface RenderChoices {
  /** Export the video with no music, so a song can be added inside Instagram. */
  withoutMusic?: boolean;
}

export interface RenderOutcome {
  blob: Blob;
  silent: boolean; // render engine produced video without an audio track
}

export interface Engines {
  /** Choose the best photos, in reel order. Needs no track. */
  select(files: File[], opts: SelectOptions): Promise<Selection>;
  /** Plan a reel from these photos, in this order, on a track's beats. */
  plan(
    photos: PlanPhoto[],
    beatmap: BeatMap,
    targetMs?: number,
    transitionOffset?: number,
    look?: LookId,
  ): ReelPlan;
  render(
    plan: ReelPlan,
    photos: Map<string, Blob>,
    beatmap: BeatMap,
    onProgress: (p: number) => void,
    /** The music track's bytes, when the caller holds them, so the renderer fetches nothing. */
    trackBytes?: ArrayBuffer,
    options?: RenderChoices,
  ): Promise<RenderOutcome>;
  /** Best-effort background preparation (worker, capability probe) so an export makes no request. */
  warmUp?(): Promise<void>;
  tracks: Track[];
  loadTrack(id: string): Promise<LoadedTrack>;
  // true when any part is a local fake, so the UI can say so out loud
  fake: boolean;
}
