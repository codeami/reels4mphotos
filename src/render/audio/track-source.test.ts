import { describe, expect, it } from 'vitest';
import { RenderError } from '../errors';
import { loadTrackBytes, trackUrl } from './track-source';

describe('trackUrl', () => {
  it('resolves under the base path', () => {
    expect(trackUrl('chill', '/')).toBe('/music/chill/track.m4a');
    expect(trackUrl('chill', '/reels4mphotos/')).toBe('/reels4mphotos/music/chill/track.m4a');
    expect(trackUrl('chill', '/reels4mphotos')).toBe('/reels4mphotos/music/chill/track.m4a');
  });

  it('refuses ids that could escape the music folder', () => {
    for (const id of ['../secret', 'a/b', '', 'a b', 'https://evil.example/x']) {
      expect(() => trackUrl(id, '/')).toThrow(RenderError);
    }
  });
});

describe('loadTrackBytes', () => {
  it('returns the bytes of a same-origin track', async () => {
    const fetchImpl = (async () => new Response(new Uint8Array([1, 2, 3]))) as typeof fetch;
    expect(new Uint8Array(await loadTrackBytes('chill', { fetchImpl }))).toEqual(
      new Uint8Array([1, 2, 3]),
    );
  });

  it('reports a missing track as track-fetch-failed', async () => {
    const fetchImpl = (async () => new Response('no', { status: 404 })) as typeof fetch;
    await expect(loadTrackBytes('chill', { fetchImpl })).rejects.toMatchObject({
      code: 'track-fetch-failed',
    });
  });
});
