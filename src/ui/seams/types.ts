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

// ASSUMED shape of the curation result: the brief only says "the chosen
// ReelPlan plus per-photo scores". Isolated here and in seams/engines.ts.
export interface PhotoScore {
  photoId: string;
  fileIndex: number; // index into the files array passed to curate()
  score: number; // 0..1, higher is better
  reason?: string; // why it was dropped, e.g. "blurry", "near-duplicate"
}
export interface CurateOptions {
  targetCount?: number;
  beatmap?: BeatMap;
  // Plan exactly these files (indexes into `files`) in this order. Used when
  // the user toggles or reorders, so the UI never re-implements planning.
  include?: number[];
}
export interface CurateResult {
  plan: ReelPlan;
  scores: PhotoScore[];
}

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
  curate(files: File[], opts: CurateOptions): Promise<CurateResult>;
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
