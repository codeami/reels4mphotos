import { FPS, FRAME_HEIGHT, FRAME_WIDTH } from '../constants';
import { RenderError } from '../errors';
import type { Rect, ReelPlan } from '../../types/reel-plan';
import { at } from '../util';

const RECT_EPSILON = 1e-6;

function invalid(message: string): never {
  throw new RenderError('invalid-plan', message);
}

function assertRect(rect: Rect, label: string): void {
  const { x, y, w, h } = rect;
  if (![x, y, w, h].every(Number.isFinite)) invalid(`${label} has a non-finite value`);
  if (w <= 0 || h <= 0) invalid(`${label} has no area`);
  if (
    x < -RECT_EPSILON ||
    y < -RECT_EPSILON ||
    x + w > 1 + RECT_EPSILON ||
    y + h > 1 + RECT_EPSILON
  ) {
    invalid(`${label} leaves the photo (normalised 0..1)`);
  }
}

// Fails fast on a plan the frame generator cannot honour, instead of rendering nonsense.
export function assertValidPlan(plan: ReelPlan): void {
  if (plan.version !== 1) invalid(`unsupported plan version ${String(plan.version)}`);
  if (plan.width !== FRAME_WIDTH || plan.height !== FRAME_HEIGHT || plan.fps !== FPS) {
    invalid(`plan must be ${FRAME_WIDTH}x${FRAME_HEIGHT} at ${FPS} fps`);
  }
  if (!Number.isFinite(plan.totalMs) || plan.totalMs <= 0) invalid('plan has no duration');
  if (plan.shots.length === 0) invalid('plan has no shots');

  const frameMs = 1000 / FPS;
  plan.shots.forEach((shot, k) => {
    const label = `shot ${k}`;
    if (
      !Number.isFinite(shot.startMs) ||
      !Number.isFinite(shot.durationMs) ||
      shot.durationMs <= 0
    ) {
      invalid(`${label} has an invalid start or duration`);
    }
    if (shot.transition !== 'cut' && shot.transition !== 'crossfade') {
      invalid(`${label} has an unknown transition "${String(shot.transition)}"`);
    }
    assertRect(shot.kenBurns.from, `${label} kenBurns.from`);
    assertRect(shot.kenBurns.to, `${label} kenBurns.to`);

    if (k === 0) {
      if (shot.startMs !== 0) invalid('the first shot must start at 0 ms');
      return;
    }
    const previous = at(plan.shots, k - 1);
    if (shot.startMs <= previous.startMs) invalid(`${label} does not start after shot ${k - 1}`);
    if (Math.abs(previous.startMs + previous.durationMs - shot.startMs) > frameMs) {
      invalid(`${label} does not follow shot ${k - 1} without a gap or overlap`);
    }
  });

  const last = at(plan.shots, plan.shots.length - 1);
  if (Math.abs(last.startMs + last.durationMs - plan.totalMs) > frameMs) {
    invalid('shots do not add up to totalMs');
  }
}

// Every shot must have its photo before any encoder, worker or recorder is started.
export function assertPhotosPresent(plan: ReelPlan, photos: ReadonlyMap<string, Blob>): void {
  const missing = [...new Set(plan.shots.map((s) => s.photoId))].filter((id) => !photos.has(id));
  if (missing.length > 0) {
    throw new RenderError('missing-photo', `no photo supplied for: ${missing.join(', ')}`);
  }
}
