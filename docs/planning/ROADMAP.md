# Roadmap

Status as of 2026-11-01. Sources: git history on `main`, `README.md`, `docs/mvp-brief.md`, `docs/claims-checklist.md`. Nothing here is released; the README status line still says pre-MVP.

## Shipped

| Date | PR | What |
| --- | --- | --- |
| 2026-10-01 | #1 | Vite + TypeScript scaffold, CI, PWA offline, E2E harnesses |
| 2026-10-01 | #2 | Mobile-first UI for the core loop |
| 2026-10-01 | #3 | Three CC0 tracks with offline beat-map tooling |
| 2026-10-01 | #4 | On-device photo curation engine and `ReelPlan` types |
| 2026-10-01 | #5, #6 | Choose photos before a track exists; shipped music catalogue read; claims wording |
| 2026-10-01 | #7 | Render engine: probed WebCodecs / MediaRecorder export, MP4 metadata reader |
| 2026-10-03 | #8 | Renderer and tracks warmed at load so an export makes no request |
| 2026-10-05 | #9 | Play first, ask later; left-out photos explained by group |
| 2026-10-15 | #10 | Set advice card, rate-and-retry loop, honest clear of app copies |
| 2026-10-15 | #11 | Review grid with large keep/remove thumbnails |
| 2026-10-17 | #12 | Five looks, look chips, export without music |
| 2026-10-19 | #13 | Three single-photo looks |
| 2026-10-21 | #14 | Looks as JSON recipes with a schema check; reel structure in the planner |
| 2026-10-27 | #15 | iPhone 15 Pro Max evidence: 6.3 s reel, AAC confirmed |

## Next: close the MVP gate

The gate is in `docs/mvp-brief.md` ("MVP done"). Status per step, from the repo:

| Gate step | Status |
| --- | --- |
| 1-3 Pick photos, deselect and reorder, choose a track, preview | Built; covered by `e2e/ui/flow.spec.ts` and `e2e/ui/touch-reorder.spec.ts`. Not recorded as run by hand with 20 real camera-roll photos. |
| 4 Export 1080x1920, 30 fps, 15-30 s, audio, cuts on beats | Evidenced on one iPhone with 12 generated photos (19.7 s). Not yet with real photos. |
| 5 Share sheet to Instagram, plays there | Not met. Save to Photos worked; Instagram did not appear in the sheet (`docs/scout-technical.md` section 4). Playback in Photos is not evidenced. |
| 6 Zero requests after load, on device | Desktop evidence only (`e2e/zero-requests.spec.ts`). No device network log recorded. |

Milestone "MVP gate": finish the device run, decide what to do about the Instagram step, then publish.

## Later

From `README.md` "Later (post-MVP)" and "Out of scope for MVP":

1. Opt-in Claude planner that sends text metadata only and returns a `ReelPlan`. Needs an owner decision (it adds network access).
2. iOS native app sharing the `ReelPlan` format.
3. Bundle with the privacy-first messenger.
4. Captions and text overlays, video clips as input, more tracks and looks (inferred: no doc commits to these).
