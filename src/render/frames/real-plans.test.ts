/* eslint-disable @typescript-eslint/no-non-null-assertion -- indexes fixtures that always exist */
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildPlan } from '../../curation/plan';
import type { PlanPhoto } from '../../curation/types';
import { beatMapSchemaOk } from '../testing/beatmap-check';
import type { BeatMap } from '../beat-map';
import { measureBeatAlignment } from '../beat-alignment';
import { CROSSFADE_FRAMES, FPS } from '../constants';
import { assertCropAspect } from './kenburns';
import { buildTimeline } from './timeline';

// The renderer against what curation really produces: its own planner run over each bundled
// track's committed beat map, with photos of mixed shapes. Checks the cut timing the gate promises
// (shots start on beats, the frame count is duration x fps) and the 9:16 crop contract.

const MUSIC_DIR = new URL('../../../public/music/', import.meta.url);
const trackIds = readdirSync(MUSIC_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

const SIZES = [
  { width: 4032, height: 3024 },
  { width: 3024, height: 4032 },
  { width: 3000, height: 3000 },
  { width: 1600, height: 1200 },
];
const photos: PlanPhoto[] = Array.from({ length: 10 }, (_, i) => ({
  photoId: `photo-${i}`,
  ...SIZES[i % SIZES.length]!,
}));

describe.each(trackIds)('curation plan for %s', (trackId) => {
  const beatmap = JSON.parse(
    readFileSync(new URL(`${trackId}/beatmap.json`, MUSIC_DIR), 'utf8'),
  ) as BeatMap;
  const plan = buildPlan(photos, beatmap, 20_000);
  const timeline = buildTimeline(plan);

  it('reads as a beat map the renderer understands', () => {
    expect(beatMapSchemaOk(beatmap, trackId)).toBe(true);
    expect(plan.totalMs).toBeGreaterThanOrEqual(15_000);
    expect(plan.totalMs).toBeLessThanOrEqual(30_000);
  });

  it('has duration x fps frames', () => {
    expect(timeline.frameCount).toBe(Math.round((plan.totalMs * FPS) / 1000));
    expect(timeline.shotFrameCounts.reduce((a, b) => a + b, 0)).toBe(timeline.frameCount);
  });

  it('starts every cut within half a frame of a beat', () => {
    plan.shots.forEach((shot, k) => {
      if (k === 0) return;
      const frameTimeMs = (timeline.shotStartFrames[k]! * 1000) / FPS;
      const nearestBeat = Math.min(...beatmap.beatsMs.map((b) => Math.abs(b - frameTimeMs)));
      expect(nearestBeat).toBeLessThanOrEqual(1000 / FPS / 2 + 1e-6);
    });
    expect(measureBeatAlignment(plan, beatmap).offBeat).toEqual([]);
  });

  it('gives each crossfade shot the frames it claims, centred on its beat', () => {
    const crossfades = plan.shots.flatMap((shot, k) =>
      k > 0 && shot.transition === 'crossfade' ? [k] : [],
    );
    expect(timeline.transitions.map((t) => t.shotIndex)).toEqual(crossfades);
    for (const window of timeline.transitions) {
      expect(window.frameCount).toBeLessThanOrEqual(CROSSFADE_FRAMES);
      expect(window.startFrame + Math.floor(window.frameCount / 2)).toBe(
        timeline.shotStartFrames[window.shotIndex],
      );
    }
  });

  it('draws only 9:16 crops of every photo, at both ends of every move', () => {
    plan.shots.forEach((shot, k) => {
      const size = SIZES[k % SIZES.length]!;
      assertCropAspect(shot.kenBurns.from, size.width, size.height, `shot ${k} from`);
      assertCropAspect(shot.kenBurns.to, size.width, size.height, `shot ${k} to`);
    });
  });
});
