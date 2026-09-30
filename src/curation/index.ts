import { curateInWorker } from './client';
import { runCuration } from './pipeline';
import type { CurateOptions, CurateResult } from './types';

export { DEFAULT_THRESHOLDS } from './score';
export type {
  BeatMap,
  CurateOptions,
  CurateProgress,
  CurateResult,
  CurateStage,
  DropReason,
  PhotoScore,
  PixelBuffer,
  Thresholds,
  TimelineSummary,
  TimeSource,
} from './types';

const canUseWorker = () => typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined';

/**
 * Pick the best photos and plan the reel. Runs in a Web Worker; where workers
 * or OffscreenCanvas are missing, or the worker fails, it runs on the calling
 * thread instead, and
 * `ranIn` on the result says which happened. Undecodable photos are reported in
 * `scores` with `dropReason: 'decode-failed'` rather than failing the run.
 */
export async function curate(files: File[], opts: CurateOptions): Promise<CurateResult> {
  if (canUseWorker()) {
    try {
      return { ...(await curateInWorker(files, opts)), ranIn: 'worker' };
    } catch {
      // The worker could not start or died (blocked script, bad bundle path):
      // the main thread can still do the job, and `ranIn` records it.
    }
  }
  return { ...(await runCuration(files, opts)), ranIn: 'main-thread' };
}
