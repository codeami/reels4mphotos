import { describe, expect, it } from 'vitest';
import { syntheticBeatMap } from './__fixtures__/beatmap';
import { exifFile, makeScene } from './__fixtures__/scenes';
import { curateInWorker, type WorkerLike } from './client';
import type { WorkerRequest, WorkerResponse } from './protocol';
import { handleRequest } from './worker';

const beatmap = syntheticBeatMap(120, 60_000);
const deps = { decode: async () => ({ pixels: makeScene(3), original: { width: 400, height: 300 } }) };

describe('handleRequest (the worker body)', () => {
  it('posts progress messages then one result', async () => {
    const out: WorkerResponse[] = [];
    const files = [exifFile('a.jpg', null), exifFile('b.jpg', null)];
    await handleRequest({ type: 'curate', files, opts: { beatmap } }, (m) => out.push(m), deps);
    expect(out.filter((m) => m.type === 'progress').length).toBeGreaterThanOrEqual(2);
    expect(out[out.length - 1]!.type).toBe('result');
    expect(out.filter((m) => m.type === 'result')).toHaveLength(1);
  });

  it('turns a thrown error into an error message instead of rejecting', async () => {
    const out: WorkerResponse[] = [];
    const bad = { type: 'curate', files: null, opts: { beatmap } } as unknown as WorkerRequest;
    await handleRequest(bad, (m) => out.push(m), deps);
    expect(out[out.length - 1]!.type).toBe('error');
  });
});

/** A worker that runs the real handler in-process, so the client protocol is exercised end to end. */
function inProcessWorker(): WorkerLike & { terminated: boolean; received: WorkerRequest[] } {
  const w = {
    terminated: false,
    received: [] as WorkerRequest[],
    onmessage: null as ((e: { data: WorkerResponse }) => void) | null,
    onerror: null as ((e: { message?: string }) => void) | null,
    onmessageerror: null as ((e: unknown) => void) | null,
    postMessage(req: WorkerRequest) {
      w.received.push(req);
      void handleRequest(req, (data) => w.onmessage?.({ data }), deps);
    },
    terminate() {
      w.terminated = true;
    },
  };
  return w;
}

describe('curateInWorker', () => {
  it('resolves with the plan and scores, forwards progress, and terminates the worker', async () => {
    const worker = inProcessWorker();
    const files = [exifFile('a.jpg', null), exifFile('b.jpg', null), exifFile('c.jpg', null)];
    const steps: number[] = [];
    const res = await curateInWorker(files, { beatmap, onProgress: (p) => p.stage === 'analysing' && steps.push(p.done) }, () => worker);
    expect(res.scores).toHaveLength(3);
    expect(steps).toEqual([1, 2, 3]);
    expect(worker.terminated).toBe(true);
  });

  it('never sends a function across the worker boundary', async () => {
    const worker = inProcessWorker();
    await curateInWorker([exifFile('a.jpg', null)], { beatmap, onProgress: () => {} }, () => worker);
    expect(worker.received[0]!.opts).not.toHaveProperty('onProgress');
  });

  it('rejects when the worker reports an error, and still terminates it', async () => {
    const worker = inProcessWorker();
    worker.postMessage = () => worker.onmessage?.({ data: { type: 'error', message: 'nope' } });
    await expect(curateInWorker([], { beatmap }, () => worker)).rejects.toThrow('nope');
    expect(worker.terminated).toBe(true);
  });

  it('rejects when the worker script itself fails to load, and terminates it', async () => {
    const worker = inProcessWorker();
    worker.postMessage = () => worker.onerror?.({ message: 'script error' });
    await expect(curateInWorker([], { beatmap }, () => worker)).rejects.toThrow(/script error/);
    expect(worker.terminated).toBe(true);
  });

  it('gives a worker error with an empty message a readable one', async () => {
    const worker = inProcessWorker();
    worker.postMessage = () => worker.onerror?.({ message: '' });
    await expect(curateInWorker([], { beatmap }, () => worker)).rejects.toThrow(/worker failed/);
  });

  it('terminates the worker and rejects when postMessage throws (e.g. DataCloneError)', async () => {
    const worker = inProcessWorker();
    worker.postMessage = () => {
      throw new Error('could not be cloned');
    };
    await expect(curateInWorker([], { beatmap }, () => worker)).rejects.toThrow(/cloned/);
    expect(worker.terminated).toBe(true);
  });

  it('terminates the worker and rejects when a message cannot be deserialised', async () => {
    const worker = inProcessWorker();
    worker.postMessage = () => worker.onmessageerror?.({});
    await expect(curateInWorker([], { beatmap }, () => worker)).rejects.toThrow(/deserialis/);
    expect(worker.terminated).toBe(true);
  });
});
