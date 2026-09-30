import type { BeatAlignment } from './beat-alignment';
import type { AudioOutcome } from './encode/types';
import type { Capabilities, RenderPathId, SkippedPath } from './probe';

// Shown by the UI when a reel had to be exported without sound.
export interface SilentHint {
  code: 'add-sound-in-instagram';
  // Why no audio could be put in the file.
  reason: string;
}

export interface FailedAttempt {
  path: RenderPathId;
  error: string;
}

// Everything the caller needs to know about how a reel was made. Nothing is chosen quietly.
//
// width, height and fps are what the export was configured for, not measured from the file, and a
// MediaRecorder recording may miss them (it drops frames under load). For what the file really
// holds, read it back with readMp4Metadata (src/render/metadata.ts).
export interface RenderReport {
  path: RenderPathId;
  // What the path attached to the file. For 'recorder' that is "an audio track was fed to the
  // recorder"; the recording itself is not inspected.
  audio: AudioOutcome;
  hasAudio: boolean;
  mimeType: string;
  width: 1080;
  height: 1920;
  fps: 30;
  // Frames encoded; null when the path cannot count them.
  frameCount: number | null;
  silentHint: SilentHint | null;
  // Better paths ruled out by the probe before encoding, and why.
  skipped: SkippedPath[];
  // Paths that started and then failed, before the one that finished.
  failedAttempts: FailedAttempt[];
  capabilities: Capabilities;
  beatAlignment: BeatAlignment;
  elapsedMs: number;
}
