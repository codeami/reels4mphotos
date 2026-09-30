import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// AGENTS.md: nothing derived from a photo leaves memory. This is a cheap tripwire
// over the curation sources, not a substitute for the privacy-auditor review.
const FORBIDDEN: [string, RegExp][] = [
  ['network fetch', /\bfetch\s*\(/],
  ['XMLHttpRequest', /XMLHttpRequest/],
  ['WebSocket', /\bWebSocket\b/],
  ['EventSource', /\bEventSource\b/],
  ['sendBeacon', /sendBeacon/],
  ['importScripts', /importScripts/],
  ['IndexedDB', /indexedDB/i],
  ['web storage', /\b(localStorage|sessionStorage)\b/],
  ['Cache API', /\bcaches\b\s*\./],
  ['console output', /\bconsole\s*\./],
  ['remote URL', /https?:\/\//],
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === '__fixtures__' ? [] : sourceFiles(p);
    return /\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name) ? [p] : [];
  });
}

describe('curation privacy tripwire', () => {
  const files = sourceFiles(__dirname);
  it('finds the curation sources', () => {
    expect(files.length).toBeGreaterThan(5);
  });
  for (const [label, pattern] of FORBIDDEN) {
    it(`uses no ${label}`, () => {
      const hits = files.filter((f) => pattern.test(readFileSync(f, 'utf8')));
      expect(hits).toEqual([]);
    });
  }
});
