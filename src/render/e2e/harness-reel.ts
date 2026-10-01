import { buildPlan } from '../../curation/plan';
import type { PlanPhoto } from '../../curation/types';
import type { BeatMap } from '../beat-map';
import type { ReelPlan } from '../../types/reel-plan';

export const GATE_TRACK_ID = 'upbeat-ruby-2';
export const BUNDLED_TRACK_IDS = [
  'chill-ease-into-night',
  'upbeat-ruby-2',
  'cinematic-dangerous-voyage',
];

// The photos the harness makes alternate 4:3 landscape and 3:4 portrait (see harness.ts).
export const harnessPhotoSize = (index: number): { width: number; height: number } =>
  index % 2 === 0 ? { width: 1600, height: 1200 } : { width: 1200, height: 1600 };

export interface HarnessReel {
  plan: ReelPlan;
  beatmap: BeatMap;
}

// A plan built by curation's own planner from a bundled track's committed beat map, so the
// renderer is exercised on what the app really produces: cuts on real beats, real Ken Burns crops.
// `shotCount` keeps the first shots only, for renders that need not run the full 20 s.
const beatmaps = new Map<string, Promise<BeatMap>>();

// Fetched once per page, the way the app loads a beat map when a track is picked.
function loadBeatMap(trackId: string): Promise<BeatMap> {
  const cached = beatmaps.get(trackId);
  if (cached) return cached;
  const loading = fetch(`/music/${trackId}/beatmap.json`).then(async (response) => {
    if (!response.ok) throw new Error(`no beat map for ${trackId}: HTTP ${response.status}`);
    return (await response.json()) as BeatMap;
  });
  beatmaps.set(trackId, loading);
  return loading;
}

export async function buildHarnessReel(
  trackId: string = GATE_TRACK_ID,
  shotCount = 10,
): Promise<HarnessReel> {
  const beatmap = await loadBeatMap(trackId);
  const photos: PlanPhoto[] = Array.from({ length: 10 }, (_, i) => ({
    photoId: `photo-${i}`,
    ...harnessPhotoSize(i),
  }));
  const full = buildPlan(photos, beatmap, 20_000);
  const shots = full.shots.slice(0, shotCount);
  const last = shots[shots.length - 1];
  if (!last) throw new Error('the harness plan has no shots');
  return { plan: { ...full, shots, totalMs: last.startMs + last.durationMs }, beatmap };
}
