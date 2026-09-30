import { describe, expect, it } from 'vitest';
import { syntheticBeatMap } from './__fixtures__/beatmap';
import { exifFile } from './__fixtures__/scenes';
import { afterEach, vi } from 'vitest';
import { curate } from './index';

describe('curate', () => {
  it('runs on the main thread, and says so, where there is no Worker', async () => {
    // Node has neither Worker nor createImageBitmap: every photo fails to decode, the run does not.
    const res = await curate([exifFile('a.heic', null), exifFile('b.heic', null)], { beatmap: syntheticBeatMap(120, 60_000) });
    expect(res.ranIn).toBe('main-thread');
    expect(res.scores.map((s) => s.dropReason)).toEqual(['decode-failed', 'decode-failed']);
    expect(res.plan.shots).toEqual([]);
  });
});

describe('curate worker fallback', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('runs on the main thread, and says so, when the worker cannot start', async () => {
    class BrokenWorker {
      constructor() {
        throw new Error('worker blocked');
      }
    }
    vi.stubGlobal('Worker', BrokenWorker);
    vi.stubGlobal('OffscreenCanvas', class {});
    const res = await curate([exifFile('a.heic', null)], { beatmap: syntheticBeatMap(120, 60_000) });
    expect(res.ranIn).toBe('main-thread');
  });

  it('reports ranIn: worker when the worker path succeeds', async () => {
    class OkWorker {
      onmessage: ((e: { data: unknown }) => void) | null = null;
      onerror = null;
      onmessageerror = null;
      postMessage() {
        this.onmessage?.({ data: { type: 'result', result: { plan: {}, scores: [], timeline: {} } } });
      }
      terminate() {}
    }
    vi.stubGlobal('Worker', OkWorker);
    vi.stubGlobal('OffscreenCanvas', class {});
    const res = await curate([], { beatmap: syntheticBeatMap(120, 60_000) });
    expect(res.ranIn).toBe('worker');
  });
});
