# How it was planned

Reconstructed on 2026-11-01 from git history, `README.md`, `AGENTS.md`, `docs/mvp-brief.md`, `docs/scout-technical.md`, `docs/decisions/0001-web-first-client-side.md` and `docs/claims-checklist.md`. Anything marked (inferred) is my reading, not a recorded fact.

## 1. Goal

Turn a handful of photos into a 9:16 reel entirely on the device, so photos are never uploaded (README, "Problem"). The decision record names the wider goals: showcase app-development skill, privacy-first positioning, later an iOS app and a bundled messenger.

## 2. The plan on day one (2026-10-01)

The first commit scaffolded the repo with the README as the product requirements and `docs/mvp-brief.md` as the work order. The brief fixed:

- **Objective:** the core loop, photos in, best ~10 chosen, 9:16 beat-cut reel, MP4 out, 100% client-side.
- **MVP gate:** six steps on a real iPhone in Safari, plus a Playwright run on desktop Chromium that asserts the export metadata and zero requests after load.
- **Five workstreams** meant to run in parallel: scaffold and CI, curation engine, render engine, UI, music.
- **Four open technical questions:** WebCodecs on iOS Safari, HEIC input, MP4 muxer, music licence.
- **Constraints:** no ffmpeg (Intel dev machine), strongest model for planning and review.

## 3. Decisions and trade-offs

| Date | Decision | Trade-off | Source |
| --- | --- | --- | --- |
| 2026-10-01 | Web first, fully client-side PWA on GitHub Pages; iOS native later | Fast to ship and test, but depends on browser media APIs whose iOS support had to be verified | `docs/decisions/0001-web-first-client-side.md` |
| 2026-10-01 | H.264 High@4.0 1080x1920 at 30 fps plus AAC-LC 128 kbps | Needs iOS 26 Safari; fallbacks listed (Opus, MediaRecorder, silent video) | `docs/scout-technical.md` section 1 |
| 2026-10-01 | mediabunny for muxing and for reading MP4 metadata in tests | MPL-2.0 licence, fine beside MIT code if its files stay unmodified | section 2 |
| 2026-10-01 | `accept="image/*"` only; skip HEIC on desktop Chrome | Avoids Safari converting every pick to HEIC; no HEIC decoder bundled | section 3, `src/ui/screens/add.ts:40` |
| 2026-10-01 | Share sheet as the primary action, download as fallback; do not claim Instagram | Instagram did not appear in the sheet on the test iPhone | section 4 |
| 2026-10-01 | CC0 tracks only, licence file beside each | Small catalogue, no attribution burden | section 5 |
| 2026-10-01 | Curation by plain image maths, no model; "AI-powered" is a banned claim | Less clever selection, simpler privacy story | README, `docs/claims-checklist.md` |
| 2026-10-01 | Hard rules in `AGENTS.md`: no network, no phoning-home dependency, no unbacked privacy claim | Slower to add features; every claim needs a test | `AGENTS.md` |
| 2026-10-17 | Looks added and silent export added, in scope | Silent export exists because Instagram song choice cannot be driven by the app | README, PR #12 |
| 2026-10-21 | Looks moved from TypeScript to JSON recipes with a schema check | A frozen fixture is kept to prove nothing changed | PR #14, `src/looks/recipes.test.ts` |

## 4. Sequence of delivery

Dates are merge-commit dates from `git log`.

1. 2026-10-01: scaffold, CI, PWA, E2E harness (#1); UI (#2); music and beat maps (#3); curation engine (#4); render engine (#7). Two small fixes and a docs change (#5, #6) the same day. The five workstreams in the brief map to these PRs (inferred).
2. 2026-10-03: renderer and tracks warmed at load so an export makes no request (#8). Matches gate step 6.
3. 2026-10-05: "play first, ask later" and explanations for left-out photos (#9).
4. 2026-10-15: advice card, rating loop, honest clear (#10); review grid (#11).
5. 2026-10-17 to 2026-10-21: looks (#12, #13, #14). This goes beyond the original brief; `README.md` now lists it as in scope.
6. 2026-10-27: iPhone 15 Pro Max evidence recorded (#15).

## 5. How the gate is checked

`docs/claims-checklist.md` ties each public claim to a named E2E spec or a device measurement and a date. A claim without evidence is not made. Direct PRs were used while prototyping; `AGENTS.md` says the no-mistakes gate turns on once the MVP gate passes. It has not passed yet (see ROADMAP.md).

## 6. Gaps in this record

- No recorded reason for adding looks beyond the MVP brief (inferred: product polish).
- Only one decision record exists; the others live in `docs/scout-technical.md` and PR titles.
- PR descriptions and review comments were not read for this document.
