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

/** A track fetched in full: what the UI needs to play it and what the renderer needs to mix it. */
interface FetchedTrack {
  loaded: LoadedTrack;
  bytes: ArrayBuffer;
}

async function fetchRealTrack(entry: CatalogueTrack): Promise<FetchedTrack> {
  const base = import.meta.env.BASE_URL;
  const [beatmapRes, audioRes] = await Promise.all([
    fetch(`${base}${entry.beatmap}`),
    fetch(`${base}${entry.track}`),
  ]);
  if (!beatmapRes.ok)
    throw new Error(`Beat map for "${entry.title}" is missing (${beatmapRes.status}).`);
  if (!audioRes.ok) throw new Error(`Audio for "${entry.title}" is missing (${audioRes.status}).`);
  const beatmap = (await beatmapRes.json()) as BeatMap;
  const bytes = await audioRes.arrayBuffer();
  // A blob: URL keeps preview and sample playback off the network once the bytes are in memory.
  const audioUrl = URL.createObjectURL(new Blob([bytes], { type: 'audio/mp4' }));
  return {
    loaded: { id: entry.id, title: entry.title, mood: entry.mood, audioUrl, beatmap },
    bytes,
  };
}

/**
 * Every shipped track is fetched once, at mount, so choosing a track, previewing it and exporting
 * make no request. The files are small, same-origin and already precached by the service worker.
 * A fetch that failed is dropped so the next use tries again and reports the error then.
 */
function createTrackStore(catalogue: CatalogueTrack[]) {
  const fetched = new Map<string, Promise<FetchedTrack>>();
  const fetchTrack = (id: string): Promise<FetchedTrack> => {
    const entry = catalogue.find((t) => t.id === id);
    if (!entry) return Promise.reject(new Error(`Unknown track ${id}`));
    const hit = fetched.get(id);
    if (hit) return hit;
    const pending = fetchRealTrack(entry);
    fetched.set(id, pending);
    pending.catch(() => fetched.delete(id));
    return pending;
  };
  return {
    prefetch: () => catalogue.forEach((t) => void fetchTrack(t.id).catch(() => undefined)),
    settled: () => Promise.allSettled(catalogue.map((t) => fetchTrack(t.id))),
    load: async (id: string) => (await fetchTrack(id)).loaded,
    bytes: async (id: string) => (await fetchTrack(id)).bytes,
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
        options?: { trackBytes?: ArrayBuffer },
      ) => Promise<Blob>;
      warmUpRenderer?: () => Promise<void>;
    };
    out.warmUp = mod.warmUpRenderer;
    out.render = async (plan, photos, beatmap, onProgress, trackBytes): Promise<RenderOutcome> => {
      const blob = await mod.renderReel(plan, photos, beatmap, onProgress, { trackBytes });
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
  const trackStore = createTrackStore(catalogue);
  trackStore.prefetch();
  const warmRenderer = real.warmUp;
  const realRender = real.render;
  return {
    select: real.select ?? fake.select,
    plan: real.plan ?? fake.plan,
    render: realRender
      ? async (plan, photos, beatmap, onProgress) =>
          realRender(plan, photos, beatmap, onProgress, await trackStore.bytes(plan.trackId))
      : fake.render,
    // settles once the tracks are in memory and the renderer has warmed up; never rejects
    warmUp: () =>
      Promise.all([trackStore.settled(), warmRenderer?.()]).then(
        () => undefined,
        () => undefined,
      ),
    tracks: catalogue.map(({ id, title, mood }) => ({ id, title, mood })),
    loadTrack: trackStore.load,
    fake: usesFake,
  };
}
