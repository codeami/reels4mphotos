import { FPS, FRAME_HEIGHT, FRAME_WIDTH } from '../constants';
import type { Rect, ReelPlan, ReelShot, Transition } from '../../types/reel-plan';
import type { BeatMap } from '../beat-map';
import { at } from '../util';

export const FIXTURE_TRACK_ID = 'fixture-120bpm';

export interface FixturePlanOptions {
  bpm?: number;
  shotCount?: number;
  beatsPerShot?: number;
  // Aspect ratio (w / h) of the photo behind shot k; its Ken Burns crops are 9:16 in those pixels.
  photoAspectFor?: (shotIndex: number) => number;
}

export interface FixtureReel {
  plan: ReelPlan;
  beatmap: BeatMap;
}

const FRAME_ASPECT = FRAME_WIDTH / FRAME_HEIGHT;

// A normalised crop of a photo with the reel's 9:16 aspect, `zoom` >= 1 shrinks it.
function frameRect(photoAspect: number, zoom: number, cx: number, cy: number): Rect {
  const fullW = Math.min(1, FRAME_ASPECT / photoAspect);
  const fullH = Math.min(1, photoAspect / FRAME_ASPECT);
  const w = fullW / zoom;
  const h = fullH / zoom;
  const x = Math.min(Math.max(cx - w / 2, 0), 1 - w);
  const y = Math.min(Math.max(cy - h / 2, 0), 1 - h);
  return { x, y, w, h };
}

export function buildFixtureReel(options: FixturePlanOptions = {}): FixtureReel {
  const bpm = options.bpm ?? 120;
  const shotCount = options.shotCount ?? 10;
  const beatsPerShot = options.beatsPerShot ?? 4;
  const photoAspectFor = options.photoAspectFor ?? (() => 4 / 3);

  const beatMs = 60_000 / bpm;
  const totalBeats = shotCount * beatsPerShot;
  const beatsMs = Array.from({ length: totalBeats + 1 }, (_, i) => Math.round(i * beatMs));
  const boundaries = Array.from({ length: shotCount + 1 }, (_, k) => at(beatsMs, k * beatsPerShot));

  const shots: ReelShot[] = Array.from({ length: shotCount }, (_, k) => {
    const zoomIn = k % 2 === 0;
    const transition: Transition = k === 0 || k % 3 !== 0 ? 'cut' : 'crossfade';
    const photoAspect = photoAspectFor(k);
    const from = frameRect(photoAspect, zoomIn ? 1 : 1.35, zoomIn ? 0.5 : 0.65, 0.5);
    const to = frameRect(photoAspect, zoomIn ? 1.35 : 1, zoomIn ? 0.6 : 0.5, 0.5);
    return {
      photoId: `photo-${k}`,
      startMs: at(boundaries, k),
      durationMs: at(boundaries, k + 1) - at(boundaries, k),
      transition,
      kenBurns: { from, to },
    };
  });

  const plan: ReelPlan = {
    version: 1,
    width: FRAME_WIDTH,
    height: FRAME_HEIGHT,
    fps: FPS,
    trackId: FIXTURE_TRACK_ID,
    totalMs: at(boundaries, shotCount),
    shots,
  };
  const beatmap: BeatMap = {
    version: 1,
    trackId: FIXTURE_TRACK_ID,
    durationMs: plan.totalMs + 2_000,
    bpm,
    beatsMs,
  };
  return { plan, beatmap };
}
