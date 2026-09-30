import { describe, expect, it } from 'vitest';
import { findViolations } from './audit-deps.mjs';

const lockFor = (deps) => ({ packages: { '': { devDependencies: deps } } });

describe('dependency audit', () => {
  it('passes when every direct dependency is allowlisted', () => {
    const pkg = { devDependencies: { vite: '^1' } };
    expect(findViolations(pkg, lockFor({ vite: '^1' }), { allowed: ['vite'] })).toEqual([]);
  });

  it('flags a dependency missing from the allowlist', () => {
    const pkg = { dependencies: { 'analytics-sdk': '^1' } };
    const lock = { packages: { '': { dependencies: { 'analytics-sdk': '^1' } } } };
    const problems = findViolations(pkg, lock, { allowed: [] });
    expect(problems.join('\n')).toContain(
      '"analytics-sdk" is in package.json but not in the allowlist',
    );
  });

  it('flags a lockfile that disagrees with package.json', () => {
    const pkg = { devDependencies: { vite: '^1' } };
    const problems = findViolations(pkg, lockFor({}), { allowed: ['vite'] });
    expect(problems.join('\n')).toContain('differ');
  });
});
