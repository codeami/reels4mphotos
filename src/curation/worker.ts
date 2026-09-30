// Web Worker entry: runs the curation pipeline off the main thread.
import { runCuration, type PipelineDeps } from './pipeline';
import type { WorkerRequest, WorkerResponse } from './protocol';

/** The worker body, separated from `self` so it can be tested in-process. */
export async function handleRequest(
  request: WorkerRequest,
  post: (message: WorkerResponse) => void,
  deps?: PipelineDeps,
): Promise<void> {
  try {
    const result = await runCuration(
      request.files,
      { ...request.opts, onProgress: (progress) => post({ type: 'progress', progress }) },
      deps,
    );
    post({ type: 'result', result });
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
}

// Only wire up messaging when actually running as a dedicated worker.
const WorkerScope = (globalThis as { WorkerGlobalScope?: abstract new () => object }).WorkerGlobalScope;
if (WorkerScope && self instanceof WorkerScope) {
  self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
    void handleRequest(event.data, (message) => (self as unknown as Worker).postMessage(message));
  });
}
