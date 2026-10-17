// FAKE ENGINES - local stand-ins for the curation, render and music
// workstreams so the UI runs and tests before they land. They contain no real
// curation or encoding logic and must never ship as the real thing: the UI
// shows a "demo engine" badge whenever any of this is in use.
// The plan is the one exception: it comes from the real planner, because the preview now draws
// frames with the real renderer and that refuses a plan that does not add up.
import { buildPlan } from '../../curation/plan';
import type {
  BeatMap,
  Engines,
  LoadedTrack,
  PhotoScore,
  SelectOptions,
  Selection,
  Track,
} from './types';

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
  const str = (o: number, s: string) =>
    [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + n * 2, true);
  str(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, n * 2, true);
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

const REASONS = [
  'not-selected',
  'near-duplicate',
  'blurry',
  'underexposed',
  'overexposed',
] as const;

const realSizes = new Map<string, { width: number; height: number }>();

async function sizeOf(file: File): Promise<{ width: number; height: number } | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return null;
  }
}

async function fakeSelect(files: File[], opts: SelectOptions): Promise<Selection> {
  const scored = files.map((f, index) => ({
    photoId: `fake-${index}-${f.size}`,
    index,
    quality: Math.round(hash(`${f.name}:${f.size}`) * 100) / 100,
  }));
  const target = Math.min(opts.targetCount ?? 10, scored.length);
  const ranked = [...scored].sort((a, b) => b.quality - a.quality);
  const kept = new Set(ranked.slice(0, target).map((s) => s.index));
  // Every reason shows up in turn, so the UI can be exercised without a lucky draw.
  const dropped = new Map(
    ranked.slice(target).map((s, i) => [s.index, REASONS[i % REASONS.length] ?? 'not-selected']),
  );
  const winner = ranked[0]?.photoId;
  // The scores keep their invented 400x600, but the preview now draws with the real renderer,
  // which checks crops against a photo's true shape, so the plan below is cut on the real size.
  const sizes = await Promise.all(files.map(sizeOf));
  scored.forEach((s, i) => {
    const size = sizes[i];
    if (size) realSizes.set(s.photoId, size);
  });
  const scores: PhotoScore[] = scored.map((s) => {
    const dropReason = dropped.get(s.index) ?? null;
    return {
      ...s,
      selected: kept.has(s.index),
      dropReason,
      width: 400,
      height: 600,
      ...(dropReason === 'near-duplicate' && winner ? { duplicateOf: winner } : {}),
      timeMs: s.index,
      timeSource: 'pickOrder',
    };
  });
  await new Promise((r) => setTimeout(r, 250));
  return { chosen: scores.filter((s) => s.selected).map(({ photoId }) => ({ photoId })), scores };
}

export function fakeEngines(): Engines {
  const params = new URLSearchParams(globalThis.location?.search ?? '');
  return {
    fake: true,
    select: fakeSelect,
    plan: (photos, beatmap, targetMs, offset, look) =>
      buildPlan(
        photos.map((p) => ({ ...p, ...realSizes.get(p.photoId) })),
        beatmap,
        targetMs,
        offset,
        look,
      ),
    tracks: FAKE_TRACKS,
    async loadTrack(id): Promise<LoadedTrack> {
      const t = FAKE_TRACKS.find((x) => x.id === id);
      if (!t) throw new Error(`Unknown track ${id}`);
      const beatmap = fakeBeatmap(id, t.bpm);
      return {
        id: t.id,
        title: t.title,
        mood: t.mood,
        beatmap,
        audioUrl: clickWav(beatmap.beatsMs, TRACK_MS),
      };
    },
    async render(_plan, _photos, _beatmap, onProgress, _bytes, choices) {
      for (let i = 1; i <= 10; i++) {
        await new Promise((r) => setTimeout(r, 120));
        onProgress(i / 10);
      }
      // Not a playable MP4: a labelled placeholder so share/download can run.
      const blob = new Blob([new Uint8Array(2048)], { type: 'video/mp4' });
      return { blob, silent: choices?.withoutMusic === true || params.get('silent') === '1' };
    },
  };
}
