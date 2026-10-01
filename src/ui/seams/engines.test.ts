import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveEngines } from './engines';

const read = (path: string) => readFileSync(`public/${path}`);

/** Serves public/ from disk, as the preview server does, and records what was asked for. */
function stubPublicFetch() {
  const asked: string[] = [];
  vi.stubGlobal('fetch', async (url: string) => {
    const path = url.replace(/^\//, '');
    asked.push(path);
    try {
      return new Response(new Uint8Array(read(path)));
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
    const shipped = (
      JSON.parse(read('music/index.json').toString('utf8')) as { tracks: { id: string }[] }
    ).tracks;
    expect(tracks.map((t) => t.id)).toEqual(shipped.map((t) => t.id));
  });

  it('loads every offered track from the paths the catalogue names', async () => {
    const asked = stubPublicFetch();
    const engines = await resolveEngines();
    for (const { id } of engines.tracks) {
      const loaded = await engines.loadTrack(id);
      expect(loaded.beatmap.trackId).toBe(id);
      expect(loaded.audioUrl).toMatch(/^blob:/);
      expect(asked).toContain(`music/${id}/beatmap.json`);
      expect(asked).toContain(`music/${id}/track.m4a`);
    }
  });

  it('fetches each track once, up front, however often it is chosen', async () => {
    const asked = stubPublicFetch();
    const engines = await resolveEngines();
    await engines.warmUp?.();
    const upFront = asked.length;
    for (const { id } of engines.tracks) {
      await engines.loadTrack(id);
      await engines.loadTrack(id);
    }
    expect(asked).toHaveLength(upFront);
    expect(asked.filter((p) => p.endsWith('/track.m4a'))).toHaveLength(engines.tracks.length);
  });

  it('settles warmUp even when a track cannot be fetched, and retries it on use', async () => {
    let failing = true;
    vi.stubGlobal('fetch', async (url: string) => {
      const path = url.replace(/^\//, '');
      if (failing && path.endsWith('track.m4a')) return new Response('down', { status: 503 });
      return new Response(new Uint8Array(read(path)));
    });
    const engines = await resolveEngines();
    await expect(engines.warmUp?.()).resolves.toBeUndefined();
    const id = engines.tracks[0]?.id ?? '';
    await expect(engines.loadTrack(id)).rejects.toThrow('Audio for');
    failing = false;
    await expect(engines.loadTrack(id)).resolves.toMatchObject({ id });
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
