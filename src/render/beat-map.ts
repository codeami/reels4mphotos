// public/music/<trackId>/beatmap.json, owned by the music workstream.
export interface BeatMap {
  version: 1;
  trackId: string;
  durationMs: number;
  bpm: number;
  beatsMs: number[];
}
