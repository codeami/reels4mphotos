import type { BeatMap, CurateOptions, CurateResult, Engines, LoadedTrack, ReelPlan, RenderOutcome, Track } from './types';
import { fakeEngines } from './fakes';

// Real modules are picked up when they exist on the branch; glob resolves to
// {} when they do not, so this file compiles and runs before they land.
const curationMods = import.meta.glob('../../curation/index.ts');
const renderMods = import.meta.glob('../../render/index.ts');

// Track ids are owned by the music workstream (public/music/<trackId>/).
// ASSUMED until that lands: the three moods named in docs/scout-technical.md.
export const TRACKS: Track[] = [
  { id: 'chill', title: 'Chill', mood: 'Slow lo-fi, soft cuts' },
  { id: 'upbeat', title: 'Upbeat', mood: 'Bright and quick' },
  { id: 'cinematic', title: 'Cinematic', mood: 'Wide and dramatic' },
];

async function loadRealTrack(track: Track): Promise<LoadedTrack> {
  const base = `${import.meta.env.BASE_URL}music/${track.id}/`;
  const res = await fetch(`${base}beatmap.json`);
  if (!res.ok) throw new Error(`Beat map for "${track.title}" is missing (${res.status}).`);
  const beatmap = (await res.json()) as BeatMap;
  return { ...track, audioUrl: `${base}track.m4a`, beatmap };
}

export async function realEngines(): Promise<Partial<Engines>> {
  const out: Partial<Engines> = {};
  const curateLoader = curationMods['../../curation/index.ts'];
  if (curateLoader) {
    const mod = (await curateLoader()) as {
      curate: (f: File[], o: CurateOptions) => Promise<CurateResult>;
    };
    out.curate = mod.curate;
  }
  const renderLoader = renderMods['../../render/index.ts'];
  if (renderLoader) {
    const mod = (await renderLoader()) as {
      renderReel: (p: ReelPlan, ph: Map<string, Blob>, b: BeatMap, cb: (n: number) => void) => Promise<Blob>;
    };
    out.render = async (plan, photos, beatmap, onProgress): Promise<RenderOutcome> => {
      const blob = await mod.renderReel(plan, photos, beatmap, onProgress);
      // ASSUMED: the render engine flags a silent fallback on the blob itself.
      return { blob, silent: (blob as Blob & { silent?: boolean }).silent === true };
    };
  }
  return out;
}

/** Real engines where present, marked fakes elsewhere. */
export async function resolveEngines(forceFake = false): Promise<Engines> {
  const fake = fakeEngines();
  if (forceFake) return fake;
  const real = await realEngines();
  const usesFake = !real.curate || !real.render;
  return {
    curate: real.curate ?? fake.curate,
    render: real.render ?? fake.render,
    tracks: TRACKS,
    loadTrack: (id) => {
      const track = TRACKS.find((t) => t.id === id);
      if (!track) throw new Error(`Unknown track ${id}`);
      return loadRealTrack(track).catch((err) => {
        // Music workstream not landed: fall back to the fake demo track.
        if (usesFake) return fake.loadTrack(id);
        throw err;
      });
    },
    fake: usesFake,
  };
}
