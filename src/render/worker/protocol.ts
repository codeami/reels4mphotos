import type { PcmAudio } from '../audio/pcm';
import type { RenderErrorCode } from '../errors';
import type { AudioOutcome } from '../encode/types';
import type { WebCodecsCapabilities } from '../probe';
import type { BeatMap } from '../beat-map';
import type { ReelPlan } from '../../types/reel-plan';

export type WorkerRenderPath = 'webcodecs-aac' | 'webcodecs-opus' | 'silent';

// Every request carries an id and every response echoes it, so a late message from an earlier
// request can never be taken for the answer to the current one.
export type WorkerRequest =
  | { type: 'probe'; id: number }
  | {
      type: 'render';
      id: number;
      path: WorkerRenderPath;
      plan: ReelPlan;
      photos: Map<string, Blob>;
      beatmap: BeatMap;
      audio: PcmAudio | null;
    };

export type WorkerResponse =
  | { type: 'probed'; id: number; capabilities: WebCodecsCapabilities }
  | { type: 'progress'; id: number; progress: number }
  | { type: 'done'; id: number; blob: Blob; audio: AudioOutcome; frameCount: number | null }
  | { type: 'error'; id: number; code: RenderErrorCode; message: string };
