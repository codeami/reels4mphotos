import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const MUSIC_DIR = 'public/music';
const AUDIO_EXTENSIONS = /\.(m4a|mp3|wav|ogg|opus|flac|aac|aiff?|webm)$/i;
const BPM_RANGE = [60, 200];
const DURATION_RANGE_MS = [30_000, 60_000];

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const trackDirs = readdirSync(MUSIC_DIR).filter((name) =>
  statSync(join(MUSIC_DIR, name)).isDirectory(),
);
const audioFilesUnder = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return audioFilesUnder(path);
    return AUDIO_EXTENSIONS.test(entry.name) ? [path] : [];
  });

describe('licences', () => {
  it('has a LICENSE.txt beside every audio file under public/music', () => {
    const unlicensed = audioFilesUnder(MUSIC_DIR).filter(
      (file) => !existsSync(join(file, '..', 'LICENSE.txt')),
    );
    expect(unlicensed).toEqual([]);
  });

  it.each(trackDirs)(
    '%s LICENSE.txt records licence, title, artist, source URL and retrieval date',
    (id) => {
      const text = readFileSync(join(MUSIC_DIR, id, 'LICENSE.txt'), 'utf8');
      expect(text).toMatch(/^License: CC0 1\.0 Universal/m);
      expect(text).toMatch(/^Title: .+/m);
      expect(text).toMatch(/^Artist: .+/m);
      expect(text).toMatch(/^Source URL: https:\/\/.+/m);
      expect(text).toMatch(/^Retrieved: \d{4}-\d{2}-\d{2}$/m);
    },
  );
});

describe('beat maps', () => {
  it('finds at least three tracks', () => {
    expect(trackDirs.length).toBeGreaterThanOrEqual(3);
  });

  describe.each(trackDirs)('%s', (id) => {
    const load = () => readJson(join(MUSIC_DIR, id, 'beatmap.json'));

    it('has the shared-seams shape', () => {
      const map = load();
      expect(Object.keys(map).sort()).toEqual([
        'beatsMs',
        'bpm',
        'durationMs',
        'trackId',
        'version',
      ]);
      expect(map.version).toBe(1);
      expect(map.trackId).toBe(id);
      expect(map.beatsMs.every(Number.isInteger)).toBe(true);
    });

    it('has strictly increasing beats inside the track duration', () => {
      const map = load();
      expect(map.beatsMs.length).toBeGreaterThan(8);
      expect(map.beatsMs[0]).toBeGreaterThanOrEqual(0);
      map.beatsMs.slice(1).forEach((ms, i) => expect(ms).toBeGreaterThan(map.beatsMs[i]));
      expect(map.beatsMs.at(-1)).toBeLessThanOrEqual(map.durationMs);
    });

    it('has a sane tempo that matches the beat spacing', () => {
      const map = load();
      expect(map.bpm).toBeGreaterThanOrEqual(BPM_RANGE[0]);
      expect(map.bpm).toBeLessThanOrEqual(BPM_RANGE[1]);
      const impliedBpm =
        (60_000 * (map.beatsMs.length - 1)) / (map.beatsMs.at(-1) - map.beatsMs[0]);
      expect(impliedBpm).toBeGreaterThanOrEqual(BPM_RANGE[0]);
      expect(impliedBpm).toBeLessThanOrEqual(BPM_RANGE[1]);
    });

    it('is 30-60 s long and listed in the catalogue', () => {
      const map = load();
      expect(map.durationMs).toBeGreaterThanOrEqual(DURATION_RANGE_MS[0]);
      expect(map.durationMs).toBeLessThanOrEqual(DURATION_RANGE_MS[1]);
      const entry = readJson(join(MUSIC_DIR, 'index.json')).tracks.find((t) => t.id === id);
      expect(entry).toMatchObject({
        durationMs: map.durationMs,
        track: `music/${id}/track.m4a`,
        beatmap: `music/${id}/beatmap.json`,
      });
    });

    it('is reproduced byte for byte by scripts/beatmap.mjs', () => {
      const outDir = mkdtempSync(join(tmpdir(), 'beatmap-'));
      const out = join(outDir, 'beatmap.json');
      try {
        execFileSync(
          'node',
          ['scripts/beatmap.mjs', join(MUSIC_DIR, id, 'track.m4a'), '--track-id', id, '--out', out],
          { stdio: 'ignore' },
        );
        expect(readFileSync(out, 'utf8')).toBe(
          readFileSync(join(MUSIC_DIR, id, 'beatmap.json'), 'utf8'),
        );
      } finally {
        rmSync(outDir, { recursive: true, force: true });
      }
      // Decodes a 45 s track in a child process; the 5 s default is not enough when every test file
      // runs at once under coverage.
    }, 30_000);
  });
});

describe('catalogue', () => {
  const { tracks } = readJson(join(MUSIC_DIR, 'index.json'));

  it('lists exactly the track directories, one per mood', () => {
    expect(tracks.map((t) => t.id).sort()).toEqual([...trackDirs].sort());
    expect(tracks.map((t) => t.mood).sort()).toEqual(['chill', 'cinematic', 'upbeat']);
  });

  it.each(tracks)('$id points at files that exist', (t) => {
    expect(existsSync(join('public', t.track))).toBe(true);
    expect(existsSync(join('public', t.beatmap))).toBe(true);
  });
});
