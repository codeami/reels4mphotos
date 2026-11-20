# 0002 — three.js, bundled, for the Gallery look (behind a flag)

Date: 2026-11-20 · Status: accepted

## Context

The Room3D KingBench scout (firstmate `data/room3d-kingbench/report.md`, 2026-11-19) ran one "3D room with six photos on the walls" prompt on three Claude models and scored the pages. The captain chose to turn the winner into a product feature: a "Gallery fly-through" look in which the user's photos hang in a 3D room and a camera flies from one to the next on the beat. Every other look is canvas 2D with no dependency. A 3D room needs WebGL, and writing a renderer by hand is not the smallest thing that works.

`AGENTS.md`: never add a dependency that phones home; adding a runtime dependency is a captain decision; no CDN assets at runtime; the CSP keeps `connect-src 'self'`.

## Decision

Captain, 2026-11-20 ("Yes to all, recommended"): add the look as one more chip **behind a feature flag, off by default** (`?gallery=1`), and **bundle three.js with Vite** once the dependency audit passes. No DeepSeek or Gemini keys; no model API calls; no walk mode and no other room styles in the MVP.

## The audit

- **Package:** `three@0.187.0`, pinned exactly (like `mediabunny`). Licence **MIT** (`node_modules/three/LICENSE`, "Copyright © 2010-2026 three.js authors"). **No dependencies, no install scripts** (`npm view three@0.187.0 dependencies scripts`: none of `preinstall`, `install`, `postinstall`).
- **Network-capable code:** in `build/three.core.js` the only `fetch(` calls are in `FileLoader` and `ImageBitmapLoader`; `XMLHttpRequest` appears three times, in the same loaders. `build/three.module.js` has none. The `http(s)://` strings in both files are comments (Wikipedia, MDN, Khronos). The app imports no loader: textures are made from the decoded photos and canvases drawn in the app. The hand-written type declaration `src/render/frames/gallery/three.d.ts` declares no loader, so a call to one cannot type-check. `@types/three` was not added: it pulls in six more packages.
- **At runtime:** bundled by Vite, same origin, no CDN; `index.html`'s CSP is unchanged. The E2E with the flag on exports a reel with zero requests after page load (`e2e/gallery.spec.ts`), and the flag-off zero-request E2E is unchanged.
- **Bundle size** (`npm run build`, 2026-11-20): the three.js stage is its own chunk, `three-stage-*.js`, **568 KB minified, 143 KB gzip**, loaded only when the flag is on. The main-thread entry chunks are unchanged. The render worker chunk inlines it (Vite's `iife` worker format inlines dynamic imports): **734 KB minified**, from about 165 KB before; the worker is fetched once at page load and precached by the service worker. The whole `dist/assets` folder is 1.5 MB minified.

## Consequences

- A WebGL dependency in a project that was canvas 2D only. The look needs WebGL2 on an OffscreenCanvas in the render worker; where that is missing the export of this look fails with the renderer's usual error and the other looks are untouched.
- A 568 KB chunk for users who open the flag URL; nothing more for anyone else until the flag is dropped.
- Frame-by-frame rendering keeps the export path identical to every other look (1080x1920, 30 fps, H.264 + AAC, pure function of the plan), rather than recording the screen with MediaRecorder as the scout pages did.
- Not yet run on a phone. `docs/claims-checklist.md` says so; the claim stays desktop-only until a device run is recorded.
