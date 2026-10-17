import { describe, expect, it } from 'vitest';
import type { ReelPlan } from '../../types/reel-plan';
import { RenderError } from '../errors';
import { buildFixtureReel } from '../testing/fixture-plan';
import { assertEnoughPhotos, assertValidPlan } from './validate-plan';

describe('assertValidPlan and the look', () => {
  const { plan } = buildFixtureReel();

  it('takes a plan with no look and one with a known look', () => {
    expect(() => assertValidPlan(plan)).not.toThrow();
    expect(() => assertValidPlan({ ...plan, look: 'cinematic' })).not.toThrow();
  });

  it('refuses a look it does not know instead of rendering the default under its name', () => {
    const bad = { ...plan, look: 'sepia-dream' } as unknown as ReelPlan;
    expect(() => assertValidPlan(bad)).toThrow(RenderError);
    expect(() => assertValidPlan(bad)).toThrow(/unknown look "sepia-dream"/);
  });

  it('does not take an inherited property name for a look', () => {
    const bad = { ...plan, look: 'constructor' } as unknown as ReelPlan;
    expect(() => assertValidPlan(bad)).toThrow(/unknown look/);
  });
});

describe('assertEnoughPhotos', () => {
  const { plan } = buildFixtureReel();
  const fromPhotos = (n: number, look?: ReelPlan['look']): ReelPlan => ({
    ...plan,
    ...(look ? { look } : {}),
    shots: plan.shots.map((s, i) => ({ ...s, photoId: `photo-${i % n}` })),
  });

  it('takes a one-photo reel in a single-photo look', () => {
    for (const look of ['neon-edge-pulse', 'zoom-through', 'glitch-slice'] as const) {
      expect(() => assertEnoughPhotos(fromPhotos(1, look))).not.toThrow();
    }
  });

  it('refuses a one-photo reel in any other look, saying how many it needs', () => {
    expect(() => assertEnoughPhotos(fromPhotos(1))).toThrow(RenderError);
    expect(() => assertEnoughPhotos(fromPhotos(1))).toThrow(
      'Classic needs at least 5 photos (you have 1).',
    );
    expect(() => assertEnoughPhotos(fromPhotos(4, 'zoom-punch'))).toThrow(/you have 4/);
    expect(() => assertEnoughPhotos(fromPhotos(5, 'zoom-punch'))).not.toThrow();
  });

  it('is a separate check: a plan from few photos is still drawable', () => {
    expect(() => assertValidPlan(fromPhotos(1))).not.toThrow();
  });
});
