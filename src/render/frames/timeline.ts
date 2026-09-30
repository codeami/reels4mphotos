import { CROSSFADE_FRAMES, FPS } from '../constants';
import { RenderError } from '../errors';
import type { ReelPlan } from '../../types/reel-plan';
import { assertValidPlan } from './validate-plan';
import { at } from '../util';

export interface FrameLayer {
  readonly shotIndex: number;
  // 0..1 through the shot's own frames; held at the ends while a crossfade overlaps.
  readonly progress: number;
  readonly alpha: number;
}

export interface FrameDescriptor {
  readonly index: number;
  readonly timeMs: number;
  // Bottom to top. The bottom layer is always opaque.
  readonly layers: readonly FrameLayer[];
}

export interface TransitionWindow {
  readonly shotIndex: number;
  readonly startFrame: number;
  readonly frameCount: number;
}

export interface Timeline {
  readonly fps: number;
  readonly frameCount: number;
  readonly shotStartFrames: readonly number[];
  readonly shotFrameCounts: readonly number[];
  readonly transitions: readonly TransitionWindow[];
  describeFrame(index: number): FrameDescriptor;
}

const toFrame = (ms: number): number => Math.round((ms * FPS) / 1000);
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

// Maps plan time to frames with integer maths only, so the same plan always yields the same
// frames. A shot begins on the frame nearest its startMs (<= half a frame from the beat). A
// crossfade into shot k is centred on that boundary frame: it claims the CROSSFADE_FRAMES
// around it, shrunk when either neighbouring shot is shorter, and is dropped below 2 frames.
export function buildTimeline(plan: ReelPlan): Timeline {
  assertValidPlan(plan);

  const frameCount = toFrame(plan.totalMs);
  const shotStartFrames = plan.shots.map((shot, k) => (k === 0 ? 0 : toFrame(shot.startMs)));
  const shotFrameCounts = shotStartFrames.map(
    (start, k) => (shotStartFrames[k + 1] ?? frameCount) - start,
  );

  const tooShort = shotFrameCounts.findIndex((n) => n < 1);
  if (tooShort !== -1) {
    throw new RenderError('invalid-plan', `shot ${tooShort} is shorter than one frame`);
  }

  const transitions: TransitionWindow[] = [];
  plan.shots.forEach((shot, k) => {
    if (k === 0 || shot.transition !== 'crossfade') return;
    const length = Math.min(CROSSFADE_FRAMES, at(shotFrameCounts, k - 1), at(shotFrameCounts, k));
    if (length < 2) return;
    transitions.push({
      shotIndex: k,
      startFrame: at(shotStartFrames, k) - Math.floor(length / 2),
      frameCount: length,
    });
  });

  const progressOf = (shotIndex: number, frame: number): number => {
    const length = at(shotFrameCounts, shotIndex);
    return length <= 1 ? 0 : clamp01((frame - at(shotStartFrames, shotIndex)) / (length - 1));
  };

  const shotAt = (frame: number): number => {
    let k = shotStartFrames.length - 1;
    while (k > 0 && at(shotStartFrames, k) > frame) k--;
    return k;
  };

  return {
    fps: FPS,
    frameCount,
    shotStartFrames,
    shotFrameCounts,
    transitions,
    describeFrame(index: number): FrameDescriptor {
      if (!Number.isInteger(index) || index < 0 || index >= frameCount) {
        throw new RangeError(`frame ${index} is outside 0..${frameCount - 1}`);
      }
      const timeMs = (index * 1000) / FPS;
      const window = transitions.find(
        (t) => index >= t.startFrame && index < t.startFrame + t.frameCount,
      );
      if (window) {
        const incoming = window.shotIndex;
        const alpha = (index - window.startFrame + 1) / (window.frameCount + 1);
        return {
          index,
          timeMs,
          layers: [
            { shotIndex: incoming - 1, progress: progressOf(incoming - 1, index), alpha: 1 },
            { shotIndex: incoming, progress: progressOf(incoming, index), alpha },
          ],
        };
      }
      const k = shotAt(index);
      return {
        index,
        timeMs,
        layers: [{ shotIndex: k, progress: progressOf(k, index), alpha: 1 }],
      };
    },
  };
}
