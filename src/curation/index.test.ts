import { describe, expect, it } from 'vitest';
import { exifFile } from './__fixtures__/scenes';
import { afterEach, vi } from 'vitest';
import { selectPhotos } from './index';

describe('selectPhotos', () => {
  it('runs on the main thread, and says so, where there is no Worker', async () => {
    // Node has neither Worker nor createImageBitmap: every photo fails to decode, the run does not.
    const res = await selectPhotos([exifFile('a.heic', null), exifFile('b.heic', null)], {});
    expect(res.ranIn).toBe('main-thread');
    expect(res.scores.map((s) => s.dropReason)).toEqual(['decode-failed', 'decode-failed']);
    expect(res.chosen).toEqual([]);
  });
});

describe('selectPhotos worker fallback', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('runs on the main thread, and says so, when the worker cannot start', async () => {
    vi.stubGlobal('Worker', function BrokenWorker() {
      throw new Error('worker blocked');
    });
    vi.stubGlobal('OffscreenCanvas', function FakeOffscreenCanvas() {});
    const res = await selectPhotos([exifFile('a.heic', null)], {});
    expect(res.ranIn).toBe('main-thread');
  });

  it('reports ranIn: worker when the worker path succeeds', async () => {
    class OkWorker {
      onmessage: ((e: { data: unknown }) => void) | null = null;
      onerror = null;
      onmessageerror = null;
      postMessage() {
        this.onmessage?.({
          data: { type: 'result', result: { chosen: [], scores: [], timeline: {} } },
        });
      }
      terminate() {}
    }
    vi.stubGlobal('Worker', OkWorker);
    vi.stubGlobal('OffscreenCanvas', function FakeOffscreenCanvas() {});
    const res = await selectPhotos([], {});
    expect(res.ranIn).toBe('worker');
  });
});
