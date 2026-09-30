import type { CurateOptions, CurateProgress } from './types';
import type { CurateOutcome } from './pipeline';

/** Everything in CurateOptions that can cross postMessage (no callbacks). */
export type WorkerOptions = Omit<CurateOptions, 'onProgress'>;

export type WorkerRequest = { type: 'curate'; files: File[]; opts: WorkerOptions };

export type WorkerResponse =
  | { type: 'progress'; progress: CurateProgress }
  | { type: 'result'; result: CurateOutcome }
  | { type: 'error'; message: string };
