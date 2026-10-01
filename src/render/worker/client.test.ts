/* eslint-disable @typescript-eslint/no-non-null-assertion -- the fake worker's recorded messages always exist */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PcmAudio } from '../audio/pcm';
import type { WebCodecsCapabilities } from '../probe';
import { buildFixtureReel } from '../testing/fixture-plan';
import { PROBE_TIMEOUT_MS, RenderWorkerClient, type WorkerLike } from './client';
import type { WorkerRequest, WorkerResponse } from './protocol';

class FakeWorker implements WorkerLike {
  onmessage: WorkerLike['onmessage'] = null;
  onerror: WorkerLike['onerror'] = null;
  onmessageerror: WorkerLike['onmessageerror'] = null;
  sent: Array<{ message: WorkerRequest; transfer: Transferable[] | undefined }> = [];
  terminated = false;

  postMessage(message: WorkerRequest, transfer?: Transferable[]): void {
    this.sent.push({ message, transfer });
  }
  terminate(): void {
    this.terminated = true;
  }

  reply(response: WorkerResponse): void {
    this.onmessage?.({ data: response } as MessageEvent<WorkerResponse>);
  }
  crash(message = 'boom'): void {
    this.onerror?.({ message } as ErrorEvent);
  }
}

const CAPABILITIES: WebCodecsCapabilities = {
  videoH264: true,
  audioAac: true,
  audioOpus: true,
  offscreenCanvas: true,
  notes: [],
};

const { plan, beatmap } = buildFixtureReel({ shotCount: 2 });
const audio: PcmAudio = {
  sampleRate: 48_000,
  channels: [new Float32Array(480).fill(0.25), new Float32Array(480).fill(0.25)],
};
const request = {
  path: 'webcodecs-aac' as const,
  plan,
  photos: new Map<string, Blob>(),
  beatmap,
  audio,
};

function setup(): { client: RenderWorkerClient; worker: FakeWorker } {
  const worker = new FakeWorker();
  return { client: new RenderWorkerClient(() => worker), worker };
}

const lastId = (worker: FakeWorker): number => worker.sent.at(-1)!.message.id;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('probe', () => {
  it('asks the worker once and remembers the answer', async () => {
    const { client, worker } = setup();
    const first = client.probe();
    worker.reply({ type: 'probed', id: lastId(worker), capabilities: CAPABILITIES });
    await expect(first).resolves.toEqual(CAPABILITIES);
    await expect(client.probe()).resolves.toEqual(CAPABILITIES);
    expect(worker.sent).toHaveLength(1);
  });

  it('gives concurrent callers the same answer from one round trip', async () => {
    const { client, worker } = setup();
    const a = client.probe();
    const b = client.probe();
    worker.reply({ type: 'probed', id: lastId(worker), capabilities: CAPABILITIES });
    await expect(Promise.all([a, b])).resolves.toEqual([CAPABILITIES, CAPABILITIES]);
    expect(worker.sent).toHaveLength(1);
  });

  it('reports a worker that dies while probing as supporting nothing, and stays that way', async () => {
    const { client, worker } = setup();
    const probing = client.probe();
    worker.crash('SyntaxError in module');
    const result = await probing;
    expect(result.videoH264).toBe(false);
    expect(result.notes.join(' ')).toContain('SyntaxError in module');
    expect(client.usable).toBe(false);
    expect(worker.terminated).toBe(true);
    // a later probe does not wait on the dead worker
    await expect(client.probe()).resolves.toEqual(result);
    expect(worker.sent).toHaveLength(1);
  });

  it('gives up on a worker that never answers', async () => {
    const { client, worker } = setup();
    const probing = client.probe();
    await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS + 1);
    const result = await probing;
    expect(result.videoH264).toBe(false);
    expect(result.notes.join(' ')).toContain('never answered');
    expect(client.usable).toBe(false);
    expect(worker.terminated).toBe(true);
  });

  it('treats a worker that cannot be created as absent', async () => {
    const client = new RenderWorkerClient(() => {
      throw new Error('Worker is not defined');
    });
    expect(client.usable).toBe(false);
    expect((await client.probe()).videoH264).toBe(false);
    await expect(client.render(request, () => {})).rejects.toMatchObject({ code: 'unsupported' });
  });
});

describe('render', () => {
  it('forwards progress, then resolves with the file', async () => {
    const { client, worker } = setup();
    const progress: number[] = [];
    const rendering = client.render(request, (p) => progress.push(p));
    const id = lastId(worker);
    worker.reply({ type: 'progress', id, progress: 0.4 });
    worker.reply({ type: 'done', id, blob: new Blob(['mp4']), audio: 'aac', frameCount: 600 });
    await expect(rendering).resolves.toMatchObject({ audio: 'aac', frameCount: 600 });
    expect(progress).toEqual([0.4]);
    expect(client.usable).toBe(true);
  });

  it('ignores responses that belong to a different request', async () => {
    const { client, worker } = setup();
    const progress: number[] = [];
    const rendering = client.render(request, (p) => progress.push(p));
    const id = lastId(worker);
    worker.reply({ type: 'progress', id: id + 1, progress: 0.9 });
    worker.reply({
      type: 'done',
      id: id + 1,
      blob: new Blob(['stale']),
      audio: 'aac',
      frameCount: 1,
    });
    worker.reply({ type: 'progress', id, progress: 0.2 });
    worker.reply({ type: 'done', id, blob: new Blob(['mine']), audio: 'aac', frameCount: 600 });
    const output = await rendering;
    expect(output.frameCount).toBe(600);
    expect(progress).toEqual([0.2]);
  });

  it('turns an error response into a RenderError and leaves the worker usable', async () => {
    const { client, worker } = setup();
    const rendering = client.render(request, () => {});
    worker.reply({ type: 'error', id: lastId(worker), code: 'invalid-plan', message: 'not 9:16' });
    await expect(rendering).rejects.toMatchObject({ code: 'invalid-plan', message: 'not 9:16' });
    expect(client.usable).toBe(true);
  });

  it('fails the render and the client when the worker crashes mid-render', async () => {
    const { client, worker } = setup();
    const rendering = client.render(request, () => {});
    worker.crash('out of memory');
    await expect(rendering).rejects.toMatchObject({ code: 'unsupported' });
    expect(client.usable).toBe(false);
    await expect(client.render(request, () => {})).rejects.toMatchObject({ code: 'unsupported' });
  });

  it('fails the render when a response cannot be read', async () => {
    const { client, worker } = setup();
    const rendering = client.render(request, () => {});
    worker.onmessageerror?.({} as MessageEvent);
    await expect(rendering).rejects.toMatchObject({ code: 'unsupported' });
    expect(client.usable).toBe(false);
  });

  it('does not hang a render that follows a probe on a worker that died in between', async () => {
    const { client, worker } = setup();
    const probing = client.probe();
    worker.reply({ type: 'probed', id: lastId(worker), capabilities: CAPABILITIES });
    await probing;
    worker.crash('died while idle');
    await expect(client.render(request, () => {})).rejects.toMatchObject({ code: 'unsupported' });
  });

  it('cancels by terminating the worker, rejecting with AbortError and refusing further work', async () => {
    const { client, worker } = setup();
    const controller = new AbortController();
    const progress: number[] = [];
    const rendering = client.render(request, (p) => progress.push(p), controller.signal);
    const id = lastId(worker);
    controller.abort();
    await expect(rendering).rejects.toMatchObject({ name: 'AbortError' });
    expect(worker.terminated).toBe(true);
    expect(client.usable).toBe(false);
    worker.reply({ type: 'progress', id, progress: 0.7 });
    expect(progress).toEqual([]);
  });

  it('rejects at once when the signal is already aborted', async () => {
    const { client, worker } = setup();
    const controller = new AbortController();
    controller.abort();
    await expect(client.render(request, () => {}, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(worker.sent).toHaveLength(0);
  });

  it('sends the worker its own copy of the audio and leaves the caller its samples', () => {
    const { client, worker } = setup();
    void client.render(request, () => {});
    const { message, transfer } = worker.sent[0]!;
    if (message.type !== 'render') throw new Error('expected a render request');
    expect(message.audio?.channels[0]).not.toBe(audio.channels[0]);
    expect(transfer).toHaveLength(2);
    expect(audio.channels[0].length).toBe(480);
  });

  it('transfers a mono source once', () => {
    const { client, worker } = setup();
    const mono = new Float32Array(480);
    void client.render(
      { ...request, audio: { sampleRate: 48_000, channels: [mono, mono] } },
      () => {},
    );
    expect(worker.sent[0]!.transfer).toHaveLength(1);
  });
});

describe('terminate', () => {
  it('settles everything waiting on the worker', async () => {
    const { client, worker } = setup();
    const rendering = client.render(request, () => {});
    client.terminate();
    await expect(rendering).rejects.toMatchObject({ code: 'unsupported' });
    expect(worker.terminated).toBe(true);
    expect(client.usable).toBe(false);
  });
});
