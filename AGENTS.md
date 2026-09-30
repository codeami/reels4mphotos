# Project notes for agents

Reels4mPhotos turns a handful of photos into a 9:16 social reel, entirely on the user's device.
Web first (this repo), iOS native later. Product requirements: README.md. Current work: docs/mvp-brief.md.

## Never do (hard rules)

- Never send photos, thumbnails, EXIF, or anything derived from them off the device. No uploads, no analytics, no telemetry, no third-party scripts, no CDN assets at runtime. The Content-Security-Policy in `index.html` keeps `connect-src 'self'`; do not loosen it.
- Never add a dependency that phones home. Check before adding any package.
- Never claim a privacy property in README, site, or video that `docs/claims-checklist.md` does not back with evidence.
- Never use copyrighted music. Only tracks in `public/music/` with a license file beside them.

## Ask the captain

- Anything that changes what the user sees in the core loop (pick → reel → export).
- Adding a runtime dependency, or any network access at all.
- Scope beyond docs/mvp-brief.md.

## Just do it

- Typos, lint, formatting, test fixes, refactors that keep behaviour.
- Don't ask unless only the captain can do it.

## Working agreements

- Prefer deterministic scripts over agent reasoning for repeatable steps.
- Fix bugs by reproducing them end to end first (Playwright), then unit tests.
- Direct PRs while prototyping; no-mistakes gate turns on once the MVP gate passes.
- Evidence over assertion: a PR that changes the reel output attaches the exported file's metadata (resolution, fps, duration, audio) from the E2E run.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
