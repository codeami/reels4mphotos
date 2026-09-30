import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveEngines } from './engines';

const read = (path: string) => readFileSync(`public/${path}`, 'utf8');

/** Serves public/ from disk, as the preview server does, and records what was asked for. */
function stubPublicFetch() {
  const asked: string[] = [];
  vi.stubGlobal('fetch', async (url: string) => {
    const path = url.replace(/^\//, '');
    asked.push(path);
    try {
      return new Response(read(path));
    } catch {
      return new Response('not found', { status: 404 });
    }
  });
  return asked;
}

describe('resolveEngines', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('offers exactly the tracks in public/music/index.json', async () => {
    stubPublicFetch();
    const { tracks } = await resolveEngines();
    const shipped = (JSON.parse(read('music/index.json')) as { tracks: { id: string }[] }).tracks;
    expect(tracks.map((t) => t.id)).toEqual(shipped.map((t) => t.id));
  });

  it('loads every offered track from the paths the catalogue names', async () => {
    const asked = stubPublicFetch();
    const engines = await resolveEngines();
    for (const { id } of engines.tracks) {
      const loaded = await engines.loadTrack(id);
      expect(loaded.beatmap.trackId).toBe(id);
      expect(loaded.audioUrl).toBe(`/music/${id}/track.m4a`);
      expect(asked).toContain(`music/${id}/beatmap.json`);
    }
  });

  it('refuses an unknown track id rather than guessing a path', async () => {
    stubPublicFetch();
    const engines = await resolveEngines();
    await expect(engines.loadTrack('chill')).rejects.toThrow('Unknown track chill');
  });

  it('fails loudly when the catalogue is missing', async () => {
    vi.stubGlobal('fetch', async () => new Response('nope', { status: 404 }));
    await expect(resolveEngines()).rejects.toThrow('music catalogue is missing (404)');
  });
});
