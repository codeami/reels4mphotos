import { clonePcm, type PcmAudio } from '../audio/pcm';
import type { EncodeOutput } from '../encode/types';
import { RenderError, abortError } from '../errors';
import type { WebCodecsCapabilities } from '../probe';
import type { BeatMap } from '../beat-map';
import type { ReelPlan } from '../../types/reel-plan';
import type { WorkerRenderPath, WorkerRequest, WorkerResponse } from './protocol';

export interface WorkerRenderRequest {
  path: WorkerRenderPath;
  plan: ReelPlan;
  photos: Map<string, Blob>;
  beatmap: BeatMap;
  audio: PcmAudio | null;
}

// The slice of Worker the client uses, so tests can stand in a fake.
export interface WorkerLike {
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(message: WorkerRequest, transfer?: Transferable[]): void;
  terminate(): void;
}

export type WorkerFactory = () => WorkerLike;

const defaultFactory: WorkerFactory = () =>
  new Worker(new URL('./render.worker.ts', import.meta.url), { type: 'module' });

// A worker that cannot even answer a capability probe is treated as absent.
export const PROBE_TIMEOUT_MS = 15_000;

function noWorker(reason: string): WebCodecsCapabilities {
  return {
    videoH264: false,
    audioAac: false,
    audioOpus: false,
    offscreenCanvas: false,
    notes: [reason],
  };
}

// Main-thread handle on one render worker. Once the worker fails, is cancelled or is shut down the
// client is permanently unusable: every waiting request settles at once and every later request
// fails fast, so nothing can wait on a worker that will never answer. Cancelling terminates the
// worker, which frees its encoders, decoded photos and buffers together.
export class RenderWorkerClient {
  private worker: WorkerLike | null = null;
  private failure: Error | null = null;
  private probed: Promise<WebCodecsCapabilities> | null = null;
  private nextId = 1;
  private readonly responders = new Map<number, (response: WorkerResponse) => void>();
  private readonly onFailure = new Set<(error: Error) => void>();

  constructor(factory: WorkerFactory = defaultFactory) {
    try {
      const worker = factory();
      worker.onmessage = (event) => this.responders.get(event.data.id)?.(event.data);
      worker.onerror = (event) =>
        this.shutDown(new RenderError('unsupported', `render worker failed: ${event.message}`));
      worker.onmessageerror = () =>
        this.shutDown(
          new RenderError('unsupported', 'could not read a message from the render worker'),
        );
      this.worker = worker;
    } catch (error) {
      this.failure = new RenderError('unsupported', 'the render worker could not be started', {
        cause: error,
      });
    }
  }

  // False once the worker has failed, been cancelled or been terminated; never true again.
  get usable(): boolean {
    return this.worker !== null && this.failure === null;
  }

  // Asked once per worker and remembered, so concurrent callers share one round trip and a warmed
  // worker costs nothing at export time. Never rejects; a dead worker reports nothing supported.
  probe(): Promise<WebCodecsCapabilities> {
    this.probed ??= this.runProbe();
    return this.probed;
  }

  private runProbe(): Promise<WebCodecsCapabilities> {
    const worker = this.worker;
    if (!worker || this.failure)
      return Promise.resolve(noWorker(this.failure?.message ?? 'no render worker'));

    return new Promise((resolve) => {
      const id = this.nextId++;
      const timer = setTimeout(
        () =>
          this.shutDown(
            new RenderError('unsupported', 'the render worker never answered the probe'),
          ),
        PROBE_TIMEOUT_MS,
      );
      const settle = (capabilities: WebCodecsCapabilities): void => {
        clearTimeout(timer);
        this.responders.delete(id);
        this.onFailure.delete(onFailure);
        resolve(capabilities);
      };
      const onFailure = (error: Error): void => settle(noWorker(error.message));
      this.responders.set(id, (response) => {
        if (response.type === 'probed') settle(response.capabilities);
      });
      this.onFailure.add(onFailure);
      worker.postMessage({ type: 'probe', id });
    });
  }

  render(
    request: WorkerRenderRequest,
    onProgress: (progress: number) => void,
    signal?: AbortSignal,
  ): Promise<EncodeOutput> {
    const worker = this.worker;
    if (!worker || this.failure) {
      return Promise.reject(
        this.failure ?? new RenderError('unsupported', 'render worker is not available'),
      );
    }
    if (signal?.aborted) return Promise.reject(abortError());

    return new Promise<EncodeOutput>((resolve, reject) => {
      const id = this.nextId++;
      const cleanUp = (): void => {
        signal?.removeEventListener('abort', onAbort);
        this.responders.delete(id);
        this.onFailure.delete(onFailure);
      };
      const onAbort = (): void => {
        cleanUp();
        this.shutDown(new RenderError('unsupported', 'the render worker was cancelled'));
        reject(abortError());
      };
      const onFailure = (error: Error): void => {
        cleanUp();
        reject(error);
      };

      signal?.addEventListener('abort', onAbort, { once: true });
      this.onFailure.add(onFailure);
      this.responders.set(id, (response) => {
        if (response.type === 'progress') {
          onProgress(response.progress);
        } else if (response.type === 'done') {
          cleanUp();
          resolve({ blob: response.blob, audio: response.audio, frameCount: response.frameCount });
        } else if (response.type === 'error') {
          cleanUp();
          reject(new RenderError(response.code, response.message));
        }
      });

      // The worker gets its own copy of the samples so the audio stays usable for a later path.
      const audio = request.audio ? clonePcm(request.audio) : null;
      const transfer = audio ? [...new Set(audio.channels.map((channel) => channel.buffer))] : [];
      worker.postMessage({ type: 'render', id, ...request, audio }, transfer);
    });
  }

  terminate(): void {
    this.shutDown(new RenderError('unsupported', 'the render worker was shut down'));
  }

  private shutDown(error: Error): void {
    this.worker?.terminate();
    this.worker = null;
    this.failure ??= error;
    const waiting = [...this.onFailure];
    this.onFailure.clear();
    this.responders.clear();
    for (const notify of waiting) notify(error);
  }
}
