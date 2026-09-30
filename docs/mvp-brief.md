# MVP brief — for the first mate

Captain's brief for the first factory run. Read README.md (the PRD) and AGENTS.md first.

## Objective

Ship the web MVP core loop: photos in → best ~10 auto-selected → 9:16 beat-cut reel → MP4 exported/shared. 100% client-side.

## MVP done (the gate)

On an iPhone in Safari, opening the GitHub Pages URL:

1. Pick 20 real photos from the camera roll.
2. The app pre-selects ~10; I deselect one and reorder two.
3. Choose a track, preview plays in sync.
4. Export produces an MP4 that is 1080×1920, 30 fps, 15–30 s, with audio, cuts on beats.
5. Share sheet posts it to Instagram (or saves to Photos), and it plays there.
6. Network log during steps 1–5 shows zero requests after page load.

Plus automated evidence: a Playwright run on desktop Chromium with fixture photos that exports a reel and asserts the metadata in step 4 and the zero-request rule in step 6.

## Suggested workstreams (parallelize)

1. **Scaffold + CI** — Vite + TypeScript, ESLint/Prettier, Vitest, Playwright, GitHub Actions (lint, unit, E2E), GitHub Pages deploy, CSP meta tag, PWA offline. Direct PRs.
2. **Curation engine** (pure TS, unit-tested, runs in a Web Worker) — decode + downscale, sharpness (Laplacian variance), exposure (histogram), near-duplicate (dHash + Hamming), EXIF timestamp spread (exifr), score → pick top N. Returns a `ReelPlan` JSON (see README "Later" — define the schema now so the Claude planner can slot in later).
3. **Render engine** — `ReelPlan` + photos + beat map → frames on Canvas (Ken Burns, 2 transitions) → WebCodecs `VideoEncoder`/`AudioEncoder` → MP4 muxer (evaluate mediabunny / mp4-muxer). Fallback path if WebCodecs audio is missing on iOS Safari (MediaRecorder).
4. **UI** — add photos, selection grid (toggle + drag reorder), track picker, preview, export/share (Web Share API with files, download fallback). Mobile-first.
5. **Music** — 3 royalty-free tracks with licenses in `public/music/`, plus a script that pre-computes each beat map JSON offline.

## Open questions — first answers in docs/scout-technical.md (verify each on device; ask in Lavish where marked)

- iOS Safari support today for WebCodecs video + audio encoding, and `navigator.share` with video files — verify on current iOS, don't assume.
- HEIC input: does the iOS file picker hand the page JPEGs, or do we need an in-browser HEIC decoder?
- MP4 muxer choice and its licence/size.
- Music source with a licence that allows redistribution in an open-source repo.

## Constraints

- Captain's dev machine is an Intel Mac: prefer npm packages over Homebrew binaries (no ffmpeg dependency for tests — read MP4 metadata in JS).
- Efficient models for implementation; strongest model for planning and review.
- Don't ask unless only the captain can do it.
