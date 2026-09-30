import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { readMp4Metadata } from './metadata';

const fixture = async (name: string): Promise<Uint8Array<ArrayBuffer>> =>
  new Uint8Array(await readFile(new URL(`./testdata/${name}`, import.meta.url)));

describe('readMp4Metadata', () => {
  it('reads resolution, frame rate, duration and the audio track of an MP4', async () => {
    const meta = await readMp4Metadata(await fixture('with-audio.mp4'));
    expect(meta).toMatchObject({
      container: 'MP4',
      width: 1080,
      height: 1920,
      frameCount: 60,
      videoCodec: 'avc',
      hasAudio: true,
      audioCodec: 'aac',
      audioSampleRate: 48_000,
      audioChannels: 2,
    });
    expect(meta.fps).toBeCloseTo(30, 1);
    expect(meta.durationSec).toBeCloseTo(2, 1);
  });

  it('reports a file without sound as having no audio track', async () => {
    const meta = await readMp4Metadata(await fixture('silent.mp4'));
    expect(meta).toMatchObject({
      width: 1080,
      height: 1920,
      hasAudio: false,
      audioCodec: null,
      audioSampleRate: null,
    });
  });

  it('accepts a Blob as well as bytes', async () => {
    const meta = await readMp4Metadata(
      new Blob([await fixture('with-audio.mp4')], { type: 'video/mp4' }),
    );
    expect(meta.hasAudio).toBe(true);
    expect(meta.height).toBe(1920);
  });

  it('rejects something that is not a media file', async () => {
    await expect(readMp4Metadata(new Uint8Array([1, 2, 3, 4]))).rejects.toThrow();
  });
});
