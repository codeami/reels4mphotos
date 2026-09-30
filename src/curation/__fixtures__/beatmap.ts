import type { BeatMap } from '../types';

/** A constant-BPM beat map. Tests only: the music workstream owns real ones. */
export function syntheticBeatMap(bpm: number, durationMs: number, trackId = 'synthetic'): BeatMap {
  const step = 60_000 / bpm;
  const beatsMs: number[] = [];
  for (let t = 0; t < durationMs; t += step) beatsMs.push(Math.round(t));
  return { version: 1, trackId, durationMs, bpm, beatsMs };
}
