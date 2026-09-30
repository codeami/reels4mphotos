import { createWebCodecsEncoder } from '../encode/webcodecs';
import { RenderError, errorMessage } from '../errors';
import { probeWebCodecs } from '../probe';
import type { WorkerRequest, WorkerResponse } from './protocol';

interface WorkerScope {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerResponse): void;
}

const scope = self as unknown as WorkerScope;

// Cancelling terminates this worker from outside, so nothing here polls for a cancel message.
scope.onmessage = (event) => {
  const request = event.data;
  if (request.type === 'probe') {
    void probeWebCodecs().then((capabilities) =>
      scope.postMessage({ type: 'probed', id: request.id, capabilities }),
    );
    return;
  }
  void run(request);
};

async function run(request: Extract<WorkerRequest, { type: 'render' }>): Promise<void> {
  const { id } = request;
  try {
    const result = await createWebCodecsEncoder(request.path).encode({
      plan: request.plan,
      photos: request.photos,
      audio: request.audio,
      onProgress: (progress) => scope.postMessage({ type: 'progress', id, progress }),
    });
    scope.postMessage({
      type: 'done',
      id,
      blob: result.blob,
      audio: result.audio,
      frameCount: result.frameCount,
    });
  } catch (error) {
    scope.postMessage({
      type: 'error',
      id,
      code: error instanceof RenderError ? error.code : 'encoder-failed',
      message: errorMessage(error),
    });
  }
}
