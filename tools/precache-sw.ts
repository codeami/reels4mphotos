import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { Plugin } from 'vite';

export function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

/** Turns the service worker template into the final script for a given file list. */
export function renderServiceWorker(template: string, files: string[]): string {
  const version = createHash('sha256').update(files.join('\n')).digest('hex').slice(0, 12);
  return template.replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify(files));
}

/** Writes dist/sw.js listing every built file, so the app runs offline after first load. */
export function precacheServiceWorker(): Plugin {
  let outDir = 'dist';
  let root = process.cwd();
  return {
    name: 'r4p-precache-sw',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
      root = config.root;
    },
    closeBundle() {
      const dist = join(root, outDir);
      const files = listFiles(dist)
        .map((f) => relative(dist, f).split(sep).join('/'))
        .filter((f) => f !== 'sw.js')
        .sort();
      const template = readFileSync(join(root, 'sw', 'sw.js'), 'utf8');
      writeFileSync(join(dist, 'sw.js'), renderServiceWorker(template, ['./', ...files]));
    },
  };
}
