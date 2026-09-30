// The plan format shared by the curation, render and UI workstreams.
// Keep this file dependency-free: other branches compile against it.

/** Normalised 0..1 in the photo's own coordinate space (origin top-left). */
export type Rect = { x: number; y: number; w: number; h: number };

export type Transition = 'cut' | 'crossfade';

export interface ReelShot {
  /** Stable id the UI and render engine both use. */
  photoId: string;
  startMs: number;
  durationMs: number;
  /** Transition INTO this shot. */
  transition: Transition;
  /**
   * Crop windows the camera moves between. Each rect is a crop of the source
   * photo whose pixel aspect is 9:16, so the renderer can draw it straight
   * into the 1080x1920 frame without cover-fitting first.
   */
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
