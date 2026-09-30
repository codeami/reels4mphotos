/* eslint-disable @typescript-eslint/no-non-null-assertion -- the fixtures indexed here always exist */
import { describe, expect, it, vi } from 'vitest';
import type { AudioOutcome, EncodeOutput } from './encode/types';
import { RenderError } from './errors';
import { orchestrate, type RenderDeps, type RenderOptions } from './orchestrate';
import type { PcmAudio } from './audio/pcm';
import type { MainThreadCapabilities, RenderPathId, WebCodecsCapabilities } from './probe';
import { buildFixtureReel } from './testing/fixture-plan';

const { plan, beatmap } = buildFixtureReel();
const photos = new Map(plan.shots.map((s) => [s.photoId, new Blob([s.photoId])]));
const trackBytes = new ArrayBuffer(8);
const decodedTrack: PcmAudio = {
  sampleRate: 48_000,
  channels: [new Float32Array(48_000 * 25).fill(0.5), new Float32Array(48_000 * 25).fill(0.5)],
};

const fullWebCodecs: WebCodecsCapabilities = {
  videoH264: true,
  audioAac: true,
  audioOpus: true,
  offscreenCanvas: true,
  notes: [],
};
const fullMain: MainThreadCapabilities = {
  audioDecode: true,
  mediaRecorder: true,
  canvasCapture: true,
  audioContext: true,
};

const AUDIO_OF: Record<RenderPathId, AudioOutcome> = {
  'webcodecs-aac': 'aac',
  'webcodecs-opus': 'opus',
  mediarecorder: 'recorder',
  silent: 'none',
};

interface Harness {
  deps: RenderDeps;
  ran: RenderPathId[];
}

function harness(
  overrides: {
    webcodecs?: Partial<WebCodecsCapabilities>;
    main?: Partial<MainThreadCapabilities>;
    decodeTrack?: RenderDeps['decodeTrack'];
    failing?: Partial<Record<RenderPathId, Error>>;
    loadTrack?: RenderDeps['loadTrack'];
    progress?: number[];
  } = {},
): Harness {
  const ran: RenderPathId[] = [];
  const run = async (
    path: RenderPathId,
    onProgress: (p: number) => void,
  ): Promise<EncodeOutput> => {
    ran.push(path);
    for (const p of overrides.progress ?? [0.2, 0.6, 1]) onProgress(p);
    const failure = overrides.failing?.[path];
    if (failure) throw failure;
    return { blob: new Blob(['x'], { type: 'video/mp4' }), audio: AUDIO_OF[path], frameCount: 600 };
  };
  const deps: RenderDeps = {
    probeWebCodecs: async () => ({ ...fullWebCodecs, ...overrides.webcodecs }),
    probeMainThread: () => ({ ...fullMain, ...overrides.main }),
    loadTrack: overrides.loadTrack ?? (async () => trackBytes),
    decodeTrack: overrides.decodeTrack ?? (async () => decodedTrack),
    runWorkerPath: (path, _job, onProgress) => run(path, onProgress),
    runRecorderPath: (job) => run('mediarecorder', job.onProgress),
  };
  return { deps, ran };
}

function render(
  h: Harness,
  options: RenderOptions = {},
  onProgress: (p: number) => void = () => {},
) {
  return orchestrate(plan, photos, beatmap, onProgress, options, h.deps, null);
}

describe('orchestrate', () => {
  it('runs H.264 + AAC when the device supports it, and says so', async () => {
    const h = harness();
    const { report, blob } = await render(h);
    expect(h.ran).toEqual(['webcodecs-aac']);
    expect(report).toMatchObject({
      path: 'webcodecs-aac',
      audio: 'aac',
      hasAudio: true,
      silentHint: null,
      skipped: [],
      failedAttempts: [],
    });
    expect(blob.type).toBe('video/mp4');
  });

  it('falls to Opus in MP4 when AAC cannot be encoded, and names why', async () => {
    const h = harness({ webcodecs: { audioAac: false } });
    const { report } = await render(h);
    expect(h.ran).toEqual(['webcodecs-opus']);
    expect(report.path).toBe('webcodecs-opus');
    expect(report.audio).toBe('opus');
    expect(report.skipped[0]).toMatchObject({ path: 'webcodecs-aac' });
  });

  it('falls to MediaRecorder when no WebCodecs audio codec works', async () => {
    const h = harness({ webcodecs: { audioAac: false, audioOpus: false } });
    const { report } = await render(h);
    expect(h.ran).toEqual(['mediarecorder']);
    expect(report.path).toBe('mediarecorder');
    expect(report.hasAudio).toBe(true);
  });

  it('produces a silent video with a hint and a reason when no audio path exists', async () => {
    const h = harness({
      webcodecs: { audioAac: false, audioOpus: false },
      main: { mediaRecorder: false },
    });
    const { report } = await render(h);
    expect(h.ran).toEqual(['silent']);
    expect(report).toMatchObject({ path: 'silent', audio: 'none', hasAudio: false });
    expect(report.silentHint?.code).toBe('add-sound-in-instagram');
    expect(report.silentHint?.reason).toContain('mp4a.40.2');
    expect(report.silentHint?.reason).toContain('MediaRecorder');
  });

  it('does not fetch the track when only the silent path can run', async () => {
    const loadTrack = vi.fn(async () => trackBytes);
    await render(
      harness({
        webcodecs: { audioAac: false, audioOpus: false },
        main: { mediaRecorder: false },
        loadTrack,
      }),
    );
    expect(loadTrack).not.toHaveBeenCalled();
  });

  it('hands over to the next path when one fails mid-render, and records the failure', async () => {
    const h = harness({
      failing: { 'webcodecs-aac': new RenderError('encoder-failed', 'AudioEncoder error 12') },
    });
    const { report } = await render(h);
    expect(h.ran).toEqual(['webcodecs-aac', 'webcodecs-opus']);
    expect(report.path).toBe('webcodecs-opus');
    expect(report.failedAttempts).toEqual([
      { path: 'webcodecs-aac', error: 'AudioEncoder error 12' },
    ]);
  });

  it('does not retry another path when the plan or a photo is what is wrong', async () => {
    for (const code of ['invalid-plan', 'missing-photo', 'photo-decode-failed'] as const) {
      const h = harness({ failing: { 'webcodecs-aac': new RenderError(code, 'bad input') } });
      await expect(render(h)).rejects.toMatchObject({ code });
      expect(h.ran).toEqual(['webcodecs-aac']);
    }
  });

  it('exports silent, with the reason, when the music track cannot be loaded', async () => {
    const loadTrack = async () => {
      throw new RenderError('track-fetch-failed', 'could not load /music/x/track.m4a: HTTP 404');
    };
    const h = harness({ loadTrack });
    const { report } = await render(h);
    expect(h.ran).toEqual(['silent']);
    expect(report.silentHint?.reason).toContain('HTTP 404');
  });

  it('exports silent, with the reason, when the music track cannot be decoded', async () => {
    const decodeTrack = async () => {
      throw new RenderError('track-decode-failed', 'EncodingError: unknown content type');
    };
    const h = harness({ decodeTrack });
    const { report } = await render(h);
    expect(h.ran).toEqual(['silent']);
    expect(report.silentHint?.reason).toContain('unknown content type');
  });

  it('decodes the music once and gives every audio path the same samples, fitted to the reel', async () => {
    const decodeTrack = vi.fn(async () => decodedTrack);
    const seen: Array<PcmAudio | null> = [];
    const h = harness({ decodeTrack, main: { mediaRecorder: false } });
    h.deps.runWorkerPath = async (path, job) => {
      seen.push(job.audio);
      h.ran.push(path);
      if (path !== 'silent') throw new RenderError('encoder-failed', 'boom');
      return { blob: new Blob(['x']), audio: 'none', frameCount: 600 };
    };
    await render(h);
    expect(decodeTrack).toHaveBeenCalledTimes(1);
    expect(seen[0]?.channels[0].length).toBe(48_000 * 20);
    expect(seen[0]).toBe(seen[1]);
    expect(seen[2]).toBeNull();
  });

  it('uses the caller-supplied track bytes instead of fetching', async () => {
    const loadTrack = vi.fn(async () => trackBytes);
    await render(harness({ loadTrack }), { trackBytes: new ArrayBuffer(4) });
    expect(loadTrack).not.toHaveBeenCalled();
  });

  it('fails loudly, listing every reason, when every path fails', async () => {
    const boom = new RenderError('encoder-failed', 'boom');
    const h = harness({
      failing: { 'webcodecs-aac': boom, 'webcodecs-opus': boom, mediarecorder: boom, silent: boom },
    });
    await expect(render(h)).rejects.toMatchObject({
      code: 'encoder-failed',
      message: expect.stringContaining('webcodecs-aac: boom'),
    });
  });

  it('refuses up front when the device can encode nothing', async () => {
    const h = harness({ webcodecs: { videoH264: false }, main: { mediaRecorder: false } });
    await expect(render(h)).rejects.toMatchObject({ code: 'unsupported' });
    expect(h.ran).toEqual([]);
  });

  it('runs only a forced path and refuses it if the device cannot', async () => {
    const h = harness();
    const { report } = await render(h, { forcePath: 'silent' });
    expect(h.ran).toEqual(['silent']);
    expect(report.path).toBe('silent');

    const limited = harness({ webcodecs: { audioAac: false } });
    await expect(render(limited, { forcePath: 'webcodecs-aac' })).rejects.toMatchObject({
      code: 'unsupported',
    });
  });

  it('does not fall back when a forced path fails', async () => {
    const h = harness({ failing: { 'webcodecs-aac': new RenderError('encoder-failed', 'boom') } });
    await expect(render(h, { forcePath: 'webcodecs-aac' })).rejects.toMatchObject({
      code: 'encoder-failed',
    });
    expect(h.ran).toEqual(['webcodecs-aac']);
  });

  it('stops at once on cancel instead of trying the next path', async () => {
    const controller = new AbortController();
    const h = harness({
      failing: { 'webcodecs-aac': new DOMException('Render cancelled', 'AbortError') },
    });
    await expect(render(h, { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(h.ran).toEqual(['webcodecs-aac']);
  });

  it('rejects immediately when already cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    const h = harness();
    await expect(render(h, { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(h.ran).toEqual([]);
  });

  it('reports progress that starts at 0, never goes backwards and ends at 1', async () => {
    const seen: number[] = [];
    // the first path fails after reaching 0.6; the next path restarts from 0
    const h = harness({
      failing: { 'webcodecs-aac': new RenderError('encoder-failed', 'late failure') },
      progress: [0.3, 0.6],
    });
    await render(h, {}, (p) => seen.push(p));
    expect(seen[0]).toBe(0);
    expect(seen.at(-1)).toBe(1);
    seen.forEach((p, i) => i > 0 && expect(p).toBeGreaterThanOrEqual(seen[i - 1]!));
    seen.forEach((p) => expect(p).toBeLessThanOrEqual(1));
  });

  it('rejects an invalid plan or a missing photo before probing or spawning anything', async () => {
    const probe = vi.fn(async () => fullWebCodecs);
    const h = harness();
    h.deps.probeWebCodecs = probe;
    await expect(
      orchestrate({ ...plan, shots: [] }, photos, beatmap, () => {}, {}, h.deps, null),
    ).rejects.toMatchObject({ code: 'invalid-plan' });
    await expect(
      orchestrate(plan, new Map(), beatmap, () => {}, {}, h.deps, null),
    ).rejects.toMatchObject({ code: 'missing-photo' });
    expect(probe).not.toHaveBeenCalled();
  });

  it('reports how far each cut sits from a beat', async () => {
    const { report } = await render(harness());
    expect(report.beatAlignment).toEqual({ boundaries: 9, maxErrorMs: 0, offBeat: [] });
  });
});
