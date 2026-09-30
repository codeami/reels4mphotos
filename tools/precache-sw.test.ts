import { describe, expect, it } from 'vitest';
import { renderServiceWorker } from './precache-sw';

const template = "const CACHE = 'r4p-__VERSION__'; const PRECACHE = __PRECACHE__;";

describe('renderServiceWorker', () => {
  it('embeds the file list as JSON', () => {
    const out = renderServiceWorker(template, ['./', 'assets/a.js']);
    expect(out).toContain('["./","assets/a.js"]');
    expect(out).not.toContain('__PRECACHE__');
  });

  it('changes the cache version when the file list changes', () => {
    const a = renderServiceWorker(template, ['./', 'assets/a.js']);
    const b = renderServiceWorker(template, ['./', 'assets/b.js']);
    expect(a).not.toEqual(b);
    expect(a.match(/r4p-\w+/)?.[0]).not.toEqual(b.match(/r4p-\w+/)?.[0]);
  });
});
