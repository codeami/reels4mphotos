/* eslint-disable @typescript-eslint/no-non-null-assertion -- the fixtures indexed here always exist */
import { describe, expect, it } from 'vitest';
import {
  AAC_PROBE_CONFIG,
  H264_PROBE_CONFIG,
  probeMainThread,
  probeWebCodecs,
  selectPaths,
  type Capabilities,
  type WebCodecsScope,
} from './probe';

const allOn: Capabilities = {
  webcodecs: {
    videoH264: true,
    audioAac: true,
    audioOpus: true,
    offscreenCanvas: true,
    notes: [],
  },
  main: { audioDecode: true, mediaRecorder: true, canvasCapture: true, audioContext: true },
};

function caps(patch: {
  webcodecs?: Partial<Capabilities['webcodecs']>;
  main?: Partial<Capabilities['main']>;
}): Capabilities {
  return {
    webcodecs: { ...allOn.webcodecs, ...patch.webcodecs },
    main: { ...allOn.main, ...patch.main },
  };
}

describe('selectPaths', () => {
  it('prefers H.264 + AAC and lists every other viable path behind it', () => {
    expect(selectPaths(allOn)).toEqual({
      candidates: ['webcodecs-aac', 'webcodecs-opus', 'mediarecorder', 'silent'],
      skipped: [],
    });
  });

  it('falls to Opus in MP4 when AAC cannot be encoded', () => {
    const selection = selectPaths(caps({ webcodecs: { audioAac: false } }));
    expect(selection.candidates).toEqual(['webcodecs-opus', 'mediarecorder', 'silent']);
    expect(selection.skipped).toEqual([
      { path: 'webcodecs-aac', reason: expect.stringContaining('mp4a.40.2') },
    ]);
  });

  it('falls to MediaRecorder when no WebCodecs audio codec is available', () => {
    const selection = selectPaths(caps({ webcodecs: { audioAac: false, audioOpus: false } }));
    expect(selection.candidates).toEqual(['mediarecorder', 'silent']);
    expect(selection.skipped.map((s) => s.path)).toEqual(['webcodecs-aac', 'webcodecs-opus']);
  });

  it('ends at a silent video when audio is impossible everywhere, and says why', () => {
    const selection = selectPaths(
      caps({ webcodecs: { audioAac: false, audioOpus: false }, main: { mediaRecorder: false } }),
    );
    expect(selection.candidates).toEqual(['silent']);
    expect(selection.skipped.map((s) => s.path)).toEqual([
      'webcodecs-aac',
      'webcodecs-opus',
      'mediarecorder',
    ]);
    expect(selection.skipped.every((s) => s.reason.length > 0)).toBe(true);
  });

  it('needs to decode the music track, so every audio path is skipped where it cannot', () => {
    const selection = selectPaths(caps({ main: { audioDecode: false } }));
    expect(selection.candidates).toEqual(['silent']);
    expect(selection.skipped.map((s) => s.path)).toEqual([
      'webcodecs-aac',
      'webcodecs-opus',
      'mediarecorder',
    ]);
    expect(selection.skipped[0]?.reason).toContain('decode');
  });

  it('does not need WebCodecs AudioDecoder: AAC is decoded by the platform', () => {
    expect(selectPaths(allOn).candidates[0]).toBe('webcodecs-aac');
  });

  it('uses only MediaRecorder when H.264 cannot be encoded at all', () => {
    const selection = selectPaths(caps({ webcodecs: { videoH264: false } }));
    expect(selection.candidates).toEqual(['mediarecorder']);
    expect(selection.skipped.map((s) => s.path)).toEqual([
      'webcodecs-aac',
      'webcodecs-opus',
      'silent',
    ]);
  });

  it('needs OffscreenCanvas in the worker for any WebCodecs path', () => {
    expect(selectPaths(caps({ webcodecs: { offscreenCanvas: false } })).candidates).toEqual([
      'mediarecorder',
    ]);
  });

  it('has nothing to offer on a device with no encoder and no recorder', () => {
    const none = caps({ webcodecs: { videoH264: false }, main: { mediaRecorder: false } });
    expect(selectPaths(none).candidates).toEqual([]);
  });

  it('requires canvas capture and an AudioContext for MediaRecorder to count', () => {
    expect(selectPaths(caps({ main: { canvasCapture: false } })).skipped[0]!.path).toBe(
      'mediarecorder',
    );
    expect(selectPaths(caps({ main: { audioContext: false } })).candidates).not.toContain(
      'mediarecorder',
    );
  });
});

describe('probeWebCodecs', () => {
  function fakeScope(answers: { video?: boolean; aac?: boolean; opus?: boolean }) {
    const asked: Array<{ api: string; config: Record<string, unknown> }> = [];
    const api = (name: string, answer: (config: Record<string, unknown>) => boolean) => ({
      async isConfigSupported(config: never) {
        asked.push({ api: name, config: config as Record<string, unknown> });
        return { supported: answer(config as Record<string, unknown>) };
      },
    });
    const scope: WebCodecsScope = {
      VideoEncoder: api('VideoEncoder', () => answers.video ?? true),
      AudioEncoder: api('AudioEncoder', (c) =>
        c.codec === 'opus' ? (answers.opus ?? true) : (answers.aac ?? true),
      ),
      OffscreenCanvas: function OffscreenCanvas() {},
    };
    return { scope, asked };
  }

  it('asks for exactly the scout-decided configs before anything is encoded', async () => {
    const { scope, asked } = fakeScope({});
    await probeWebCodecs(scope);
    const video = asked.find((a) => a.api === 'VideoEncoder')!.config;
    expect(video).toMatchObject({ codec: 'avc1.640028', width: 1080, height: 1920, framerate: 30 });
    expect(video).toEqual(H264_PROBE_CONFIG);
    expect(
      asked.find((a) => a.api === 'AudioEncoder' && a.config.codec === 'mp4a.40.2')!.config,
    ).toEqual(AAC_PROBE_CONFIG);
    expect(AAC_PROBE_CONFIG).toMatchObject({
      codec: 'mp4a.40.2',
      bitrate: 128_000,
      numberOfChannels: 2,
    });
  });

  it('reports what the device answered, with notes for what is missing', async () => {
    const { scope } = fakeScope({ aac: false });
    const result = await probeWebCodecs(scope);
    expect(result).toMatchObject({ videoH264: true, audioAac: false, audioOpus: true });
    expect(result.notes.join(' ')).toContain('mp4a.40.2');
  });

  it('treats a missing API as unsupported', async () => {
    const result = await probeWebCodecs({});
    expect(result).toMatchObject({
      videoH264: false,
      audioAac: false,
      audioOpus: false,
      offscreenCanvas: false,
    });
  });

  it('treats a throwing isConfigSupported as unsupported instead of failing the probe', async () => {
    const throwing = {
      isConfigSupported: async () => {
        throw new TypeError('bad codec string');
      },
    };
    const result = await probeWebCodecs({ VideoEncoder: throwing, AudioEncoder: throwing });
    expect(result.videoH264).toBe(false);
    expect(result.notes.join(' ')).toContain('bad codec string');
  });
});

describe('probeMainThread', () => {
  const constructor = function Stub() {};

  it('reports nothing available on a bare scope', () => {
    expect(probeMainThread({})).toEqual({
      audioDecode: false,
      mediaRecorder: false,
      canvasCapture: false,
      audioContext: false,
    });
  });

  it('needs MediaRecorder, canvas capture, AudioContext and a way to decode audio', () => {
    const document = {
      createElement: () => ({ captureStream: () => ({}) }),
    } as unknown as Document;
    expect(
      probeMainThread({
        MediaRecorder: constructor,
        AudioContext: constructor,
        OfflineAudioContext: constructor,
        document,
      }),
    ).toEqual({ audioDecode: true, mediaRecorder: true, canvasCapture: true, audioContext: true });
  });

  it('accepts the prefixed OfflineAudioContext older Safari shipped', () => {
    expect(probeMainThread({ webkitOfflineAudioContext: constructor }).audioDecode).toBe(true);
  });
});
