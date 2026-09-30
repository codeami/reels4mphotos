// FAKE ENGINES - local stand-ins for the curation, render and music
// workstreams so the UI runs and tests before they land. They contain no real
// curation or encoding logic and must never ship as the real thing: the UI
// shows a "demo engine" badge whenever any of this is in use.
import type { BeatMap, CurateOptions, CurateResult, Engines, LoadedTrack, ReelPlan, ReelShot, Track } from './types';

const FAKE_TRACKS: Array<Track & { bpm: number }> = [
  { id: 'chill', title: 'Chill', mood: 'Slow lo-fi, soft cuts', bpm: 84 },
  { id: 'upbeat', title: 'Upbeat', mood: 'Bright and quick', bpm: 128 },
  { id: 'cinematic', title: 'Cinematic', mood: 'Wide and dramatic', bpm: 96 },
];
const TRACK_MS = 24000;

function fakeBeatmap(id: string, bpm: number): BeatMap {
  const step = 60000 / bpm;
  const beatsMs: number[] = [];
  for (let t = 0; t < TRACK_MS; t += step) beatsMs.push(Math.round(t));
  return { version: 1, trackId: id, durationMs: TRACK_MS, bpm, beatsMs };
}

/** A quiet click track as a WAV blob URL, so previews have audible beats. */
function clickWav(beatsMs: number[], durationMs: number): string {
  const rate = 8000;
  const n = Math.floor((durationMs / 1000) * rate);
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVEfmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true);
  v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
  for (const b of beatsMs) {
    const s = Math.floor((b / 1000) * rate);
    for (let i = 0; i < 400 && s + i < n; i++) {
      const amp = Math.sin((i / rate) * 2 * Math.PI * 880) * (1 - i / 400) * 9000;
      v.setInt16(44 + (s + i) * 2, amp, true);
    }
  }
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}

const REASONS = ['Looks blurry', 'Near-duplicate of another shot', 'Too dark', 'Overexposed'];

function buildPlan(order: Array<{ photoId: string }>, beatmap: BeatMap | undefined): ReelPlan {
  const beats = beatmap?.beatsMs ?? Array.from({ length: 80 }, (_, i) => i * 500);
  // Each shot spans 4 beats; cuts land exactly on beat times.
  const stride = Math.max(2, Math.round(2200 / ((beats[1] ?? 500) - beats[0])));
  const shots: ReelShot[] = order.map((p, i) => {
    const startMs = beats[Math.min(i * stride, beats.length - 1)];
    const endMs = beats[Math.min((i + 1) * stride, beats.length - 1)];
    const zoomIn = i % 2 === 0;
    const wide = { x: 0.1, y: 0.05, w: 0.8, h: 0.9 };
    const tight = { x: 0.25, y: 0.2, w: 0.5, h: 0.6 };
    return {
      photoId: p.photoId,
      startMs,
      durationMs: Math.max(500, endMs - startMs),
      transition: i % 3 === 2 ? 'crossfade' : 'cut',
      kenBurns: zoomIn ? { from: wide, to: tight } : { from: tight, to: wide },
    };
  });
  const last = shots[shots.length - 1];
  return {
    version: 1, width: 1080, height: 1920, fps: 30,
    trackId: beatmap?.trackId ?? 'chill',
    totalMs: last ? last.startMs + last.durationMs : 0,
    shots,
  };
}

async function fakeCurate(files: File[], opts: CurateOptions): Promise<CurateResult> {
  const scored = files.map((f, fileIndex) => {
    const r = hash(`${f.name}:${f.size}`);
    return {
      photoId: `fake-${fileIndex}-${f.size}`,
      fileIndex,
      score: Math.round(r * 100) / 100,
      reason: undefined as string | undefined,
    };
  });
  let chosen: number[];
  if (opts.include) chosen = opts.include;
  else {
    const target = Math.min(opts.targetCount ?? 10, scored.length);
    chosen = [...scored].sort((a, b) => b.score - a.score).slice(0, target).map((s) => s.fileIndex).sort((a, b) => a - b);
  }
  const scores = scored.map((s) => ({
    ...s,
    reason: chosen.includes(s.fileIndex) ? undefined : REASONS[Math.floor(hash(s.photoId) * REASONS.length)],
  }));
  await new Promise((r) => setTimeout(r, 250));
  return { plan: buildPlan(chosen.map((i) => scored[i]), opts.beatmap), scores };
}

export function fakeEngines(): Engines {
  const params = new URLSearchParams(globalThis.location?.search ?? '');
  return {
    fake: true,
    curate: fakeCurate,
    tracks: FAKE_TRACKS,
    async loadTrack(id): Promise<LoadedTrack> {
      const t = FAKE_TRACKS.find((x) => x.id === id);
      if (!t) throw new Error(`Unknown track ${id}`);
      const beatmap = fakeBeatmap(id, t.bpm);
      return { id: t.id, title: t.title, mood: t.mood, beatmap, audioUrl: clickWav(beatmap.beatsMs, TRACK_MS) };
    },
    async render(_plan, _photos, _beatmap, onProgress) {
      for (let i = 1; i <= 10; i++) {
        await new Promise((r) => setTimeout(r, 120));
        onProgress(i / 10);
      }
      // Not a playable MP4: a labelled placeholder so share/download can run.
      const blob = new Blob([new Uint8Array(2048)], { type: 'video/mp4' });
      return { blob, silent: params.get('silent') === '1' };
    },
  };
}
