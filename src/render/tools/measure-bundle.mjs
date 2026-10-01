// Measures what the render engine costs in a production build, including the scout's open verify
// step: the size of the MP4-only mediabunny import. Run: node src/render/tools/measure-bundle.mjs
import { Buffer } from 'node:buffer';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { build } from 'vite';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const renderDir = join(root, 'src/render');
const scratch = join(root, 'node_modules/.cache/r4p-bundle');
mkdirSync(scratch, { recursive: true });

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

function sizes(code) {
  const raw = Buffer.from(code);
  return {
    min: raw.length,
    gzip: gzipSync(raw, { level: 9 }).length,
    brotli: brotliCompressSync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
  };
}

function productionSources(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return ['e2e', 'testing', 'testdata', 'tools'].includes(entry.name)
        ? []
        : productionSources(path);
    }
    const isSource = path.endsWith('.ts') && !path.endsWith('.test.ts');
    return isSource && entry.name !== 'metadata.ts' ? [path] : [];
  });
}

// Every mediabunny name the shipped code imports (the metadata reader is test-only and excluded).
function mediabunnyImports() {
  const names = new Set();
  for (const file of productionSources(renderDir)) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/import\s*\{([^}]*)\}\s*from\s*'mediabunny'/g)) {
      for (const name of match[1].split(',')) if (name.trim()) names.add(name.trim());
    }
  }
  return [...names].sort();
}

async function bundle(input, label) {
  const result = await build({
    root,
    logLevel: 'silent',
    configFile: false,
    build: {
      write: false,
      target: 'es2022',
      minify: true,
      rollupOptions: { input, preserveEntrySignatures: 'exports-only' },
    },
  });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap((r) => r.output);
  return outputs.map((o) => ({
    label,
    name: o.fileName,
    kind: o.type,
    code: o.type === 'chunk' ? o.code : String(o.source),
  }));
}

const imports = mediabunnyImports();
const entry = join(scratch, 'mediabunny-mp4-only.ts');
writeFileSync(entry, `export { ${imports.join(', ')} } from 'mediabunny';\n`);

const rows = [];
for (const out of await bundle(entry, 'mediabunny, MP4-only import')) rows.push(out);
for (const out of await bundle(join(renderDir, 'worker/render.worker.ts'), 'render worker'))
  rows.push(out);
for (const out of await bundle(join(renderDir, 'index.ts'), 'render/index.ts (main thread)'))
  rows.push(out);

console.log(`mediabunny symbols imported by shipped code: ${imports.join(', ')}\n`);
for (const row of rows.filter((r) => r.kind === 'chunk')) {
  const s = sizes(row.code);
  console.log(
    `${row.label.padEnd(32)} ${row.name.padEnd(36)} min ${kb(s.min).padStart(9)}   gzip ${kb(s.gzip).padStart(9)}   brotli ${kb(s.brotli).padStart(9)}`,
  );
}

// Network-capable APIs left in what ships. The one expected is the same-origin fetch of the bundled
// music track (a bare `fetch` in the main-thread chunk); mediabunny's URL-reading code is tree-shaken out.
// `fetch` must stand alone: error codes such as 'track-fetch-failed' are not calls.
const networkApis = {
  fetch: /(?<![\w-])fetch(?![\w-])/g,
  XMLHttpRequest: /XMLHttpRequest/g,
  sendBeacon: /sendBeacon/g,
  WebSocket: /WebSocket/g,
  EventSource: /EventSource/g,
  importScripts: /importScripts/g,
};
console.log('\nnetwork-capable API occurrences per shipped chunk:');
for (const row of rows.filter(
  (r) => r.kind === 'chunk' && r.label !== 'mediabunny, MP4-only import',
)) {
  const found = Object.entries(networkApis)
    .map(([name, pattern]) => [name, (row.code.match(pattern) ?? []).length])
    .filter(([, n]) => n > 0);
  const note = row.code.includes('track.m4a') ? '  <- the same-origin music track loader' : '';
  console.log(
    `  ${row.name.padEnd(36)} ${found.length ? found.map(([api, n]) => `${api} x${n}`).join(', ') : 'none'}${note}`,
  );
}
