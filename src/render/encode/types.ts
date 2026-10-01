import type { PcmAudio } from '../audio/pcm';
import type { RenderPathId } from '../probe';
import type { ReelPlan } from '../../types/reel-plan';

export interface EncodeJob {
  plan: ReelPlan;
  photos: ReadonlyMap<string, Blob>;
  // The music, already decoded and fitted to the reel's length. Null only for the silent path.
  audio: PcmAudio | null;
  signal?: AbortSignal;
  // 0..1 through this encoder's own work.
  onProgress(progress: number): void;
  // MediaRecorder path only: an AudioContext created inside the user's tap, so Safari lets it run.
  audioContext?: AudioContext | null;
}

export type AudioOutcome = 'aac' | 'opus' | 'recorder' | 'none';

export interface EncodeOutput {
  blob: Blob;
  audio: AudioOutcome;
  // Frames encoded, or null where the path cannot count them (MediaRecorder decides for itself).
  frameCount: number | null;
}

// One interface for every way of turning a plan into a file. The probe picks the implementation.
export interface ReelEncoder {
  readonly path: RenderPathId;
  encode(job: EncodeJob): Promise<EncodeOutput>;
}
