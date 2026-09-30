import { curateInWorker } from './client';
import { runCuration } from './pipeline';
import type { SelectOptions, SelectResult } from './types';

export { buildPlan as planReel } from './plan';
export { DEFAULT_THRESHOLDS } from './score';
export type {
  BeatMap,
  CurateProgress,
  CurateStage,
  DropReason,
  PhotoScore,
  PixelBuffer,
  PlanPhoto,
  SelectOptions,
  SelectResult,
  Thresholds,
  TimelineSummary,
  TimeSource,
} from './types';

const canUseWorker = () => typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined';

/**
 * Pick the best photos, in reel order. No beat map is needed or accepted: once
 * a track is chosen, `planReel` turns `chosen` (or any reordering of it) into a
 * plan. Runs in a Web Worker; where workers or OffscreenCanvas are missing, or
 * the worker fails, it runs on the calling thread instead, and
 * `ranIn` on the result says which happened. Undecodable photos are reported in
 * `scores` with `dropReason: 'decode-failed'` rather than failing the run.
 */
export async function selectPhotos(files: File[], opts: SelectOptions = {}): Promise<SelectResult> {
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
