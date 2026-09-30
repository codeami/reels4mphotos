import type { BeatMap } from '../beat-map';

// True when a parsed beat map has the shape the brief fixes: version 1, the track's own id, a
// positive duration and tempo, and beats that are increasing and inside the track.
export function beatMapSchemaOk(beatmap: BeatMap, trackId: string): boolean {
  const { version, trackId: id, durationMs, bpm, beatsMs } = beatmap;
  return (
    version === 1 &&
    id === trackId &&
    durationMs > 0 &&
    bpm > 0 &&
    beatsMs.length > 0 &&
    beatsMs.every(
      (beat, i) => beat >= 0 && beat <= durationMs && (i === 0 || beat > (beatsMs[i - 1] ?? 0)),
    )
  );
}
