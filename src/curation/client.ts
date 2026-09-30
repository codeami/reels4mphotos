import type { CurateOutcome } from './pipeline';
import type { WorkerRequest, WorkerResponse } from './protocol';
import type { CurateOptions } from './types';

/** The slice of the Worker API the client uses; lets tests stand in a fake. */
export interface WorkerLike {
  onmessage: ((event: { data: WorkerResponse }) => void) | null;
  onerror: ((event: { message?: string }) => void) | null;
  onmessageerror: ((event: unknown) => void) | null;
  postMessage(message: WorkerRequest): void;
  terminate(): void;
}

function createCurationWorker(): WorkerLike {
  return new Worker(new URL('./worker.ts', import.meta.url), {
    type: 'module',
  }) as unknown as WorkerLike;
}

/**
 * Run the curation pipeline in a dedicated Web Worker. Progress callbacks are
 * delivered on the calling thread; the worker is always terminated afterwards.
 */
export function curateInWorker(
  files: File[],
  opts: CurateOptions,
  createWorker: () => WorkerLike = createCurationWorker,
): Promise<CurateOutcome> {
  const { onProgress, ...workerOpts } = opts;
  return new Promise((resolve, reject) => {
    const worker = createWorker();
    const finish = (settle: () => void) => {
      worker.terminate();
      settle();
    };
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') onProgress?.(data.progress);
      else if (data.type === 'result') finish(() => resolve(data.result));
      else finish(() => reject(new Error(data.message)));
    };
    worker.onerror = (event) =>
      finish(() => reject(new Error(event.message || 'The curation worker failed.')));
    worker.onmessageerror = () =>
      finish(() =>
        reject(new Error('The curation worker sent a message that could not be deserialised.')),
      );
    try {
      worker.postMessage({ type: 'curate', files, opts: workerOpts });
    } catch (err) {
      finish(() => reject(err));
    }
  });
}
