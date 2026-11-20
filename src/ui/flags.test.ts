import { describe, expect, it } from 'vitest';
import { readFlags } from './flags';

describe('readFlags', () => {
  it('is all off with no query, and off for anything but gallery=1', () => {
    expect(readFlags('')).toEqual({ gallery: false });
    expect(readFlags('?fakes=1')).toEqual({ gallery: false });
    expect(readFlags('?gallery=yes')).toEqual({ gallery: false });
    expect(readFlags('?gallery=0')).toEqual({ gallery: false });
  });

  it('turns the gallery look on with ?gallery=1, alongside other parameters', () => {
    expect(readFlags('?gallery=1')).toEqual({ gallery: true });
    expect(readFlags('?fakes=1&gallery=1')).toEqual({ gallery: true });
  });
});
