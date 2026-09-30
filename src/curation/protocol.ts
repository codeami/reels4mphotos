import type { CurateProgress, SelectOptions } from './types';
import type { SelectOutcome } from './pipeline';

/** Everything in SelectOptions that can cross postMessage (no callbacks). */
export type WorkerOptions = Omit<SelectOptions, 'onProgress'>;

export type WorkerRequest = { type: 'curate'; files: File[]; opts: WorkerOptions };

export type WorkerResponse =
  | { type: 'progress'; progress: CurateProgress }
  | { type: 'result'; result: SelectOutcome }
  | { type: 'error'; message: string };
