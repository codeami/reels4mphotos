import { describe, expect, it } from 'vitest';
import type { ReelPlan } from '../../types/reel-plan';
import { RenderError } from '../errors';
import { buildFixtureReel } from '../testing/fixture-plan';
import { assertValidPlan } from './validate-plan';

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
