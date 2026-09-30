import type {
  BeatMap,
  Engines,
  LoadedTrack,
  PlanPhoto,
  ReelPlan,
  RenderOutcome,
  SelectOptions,
  Selection,
  Track,
} from './types';
import { fakeEngines } from './fakes';

// Real modules are picked up when they exist on the branch; glob resolves to
// {} when they do not, so this file compiles and runs before they land.
const curationMods = import.meta.glob('../../curation/index.ts');
const renderMods = import.meta.glob('../../render/index.ts');

/** One entry of public/music/index.json, written by the music workstream's tooling. */
interface CatalogueTrack extends Track {
  track: string;
  beatmap: string;
}

const CATALOGUE_PATH = 'music/index.json';

/** The shipped tracks, read at runtime so the UI can never offer an id that is not bundled. */
async function loadCatalogue(): Promise<CatalogueTrack[]> {
  const res = await fetch(`${import.meta.env.BASE_URL}${CATALOGUE_PATH}`);
  if (!res.ok) throw new Error(`The music catalogue is missing (${res.status}).`);
  const body = (await res.json()) as { tracks?: CatalogueTrack[] };
  if (!Array.isArray(body.tracks) || body.tracks.length === 0)
    throw new Error('The music catalogue lists no tracks.');
  return body.tracks;
}

async function loadRealTrack(entry: CatalogueTrack): Promise<LoadedTrack> {
  const base = import.meta.env.BASE_URL;
  const res = await fetch(`${base}${entry.beatmap}`);
  if (!res.ok) throw new Error(`Beat map for "${entry.title}" is missing (${res.status}).`);
  const beatmap = (await res.json()) as BeatMap;
  return {
    id: entry.id,
    title: entry.title,
    mood: entry.mood,
    audioUrl: `${base}${entry.track}`,
    beatmap,
  };
}

export async function realEngines(): Promise<Partial<Engines>> {
  const out: Partial<Engines> = {};
  const curateLoader = curationMods['../../curation/index.ts'];
  if (curateLoader) {
    const mod = (await curateLoader()) as {
      selectPhotos: (f: File[], o: SelectOptions) => Promise<Selection>;
      planReel: (p: PlanPhoto[], b: BeatMap) => ReelPlan;
    };
    out.select = mod.selectPhotos;
    out.plan = mod.planReel;
  }
  const renderLoader = renderMods['../../render/index.ts'];
  if (renderLoader) {
    const mod = (await renderLoader()) as {
      renderReel: (
        p: ReelPlan,
        ph: Map<string, Blob>,
        b: BeatMap,
        cb: (n: number) => void,
      ) => Promise<Blob>;
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
  const usesFake = !real.select || !real.plan || !real.render;
  const catalogue = await loadCatalogue();
  return {
    select: real.select ?? fake.select,
    plan: real.plan ?? fake.plan,
    render: real.render ?? fake.render,
    tracks: catalogue.map(({ id, title, mood }) => ({ id, title, mood })),
    loadTrack: async (id) => {
      const entry = catalogue.find((t) => t.id === id);
      if (!entry) throw new Error(`Unknown track ${id}`);
      return loadRealTrack(entry);
    },
    fake: usesFake,
  };
}
