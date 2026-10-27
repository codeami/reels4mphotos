# Claims checklist

Use before any README, site, store listing, post or video. Every public claim must be backed by evidence in this repo.

## Claims we want to make (need evidence before use)

| Claim | Evidence required | Status |
|---|---|---|
| "Your photos never leave your device" | E2E test asserting zero network requests after load + CSP `connect-src 'self'` | supported: `e2e/zero-requests.spec.ts`, `e2e/ui/flow.spec.ts` (no requests beyond app origin, no CSP violations), `connect-src 'self'` in `index.html`; passing 2026-10-01 |
| "Works offline" | E2E run with network disabled after first load | supported: `e2e/offline.spec.ts`; passing 2026-10-01 |
| "No account, no tracking" | No auth code, no analytics deps (dependency audit in CI) | supported: `tools/audit-deps.mjs` runs in CI lint step and passes; no auth code in repo |
| "Reel in under 30 seconds" | Timed export on a named iPhone model | supported: 6.3 s total (curation 0.3 s, preview ready 0.8 s, export 5.5 s) for 12 photos, 10 auto-selected, 9 of 9 cuts on beat, on an iPhone 15 Pro Max (iPhone16,2), iOS 26.6.2, Safari 26.6.1, measured 2026-10-01 over USB with Safari Web Inspector; exported file 1080x1920, 19.741 s, 7.44 MB. One device, 12 generated photos; says nothing about Photos playback or the share sheet, which are not yet evidenced |
| "Clearing the app does not delete your originals" | E2E: the clear flow names what goes and what stays, and leaves no blob URLs or storage behind | supported: `e2e/ui/rules-slice.spec.ts`; passing 2026-10-15 |
| "Looks are drawn on your device" | Looks are canvas 2D code in `src/render/frames`; no new dependency (`dependency-allowlist.json` unchanged), no font or image fetched, CSP unchanged; the zero-request and offline E2E run with looks | supported: `e2e/ui/looks.spec.ts`, `e2e/zero-requests.spec.ts`; passing 2026-10-17 |
| "Three looks work with a single photo" | Plan unit tests from one photo for each look; E2E exports a 1080x1920, 30 fps MP4 from one photo; nothing leaves the device, no model, no new dependency | supported: `src/curation/plan.test.ts`, `e2e/looks.spec.ts`, `e2e/ui/single-photo.spec.ts`; passing 2026-10-17 (to confirm in the PR run). Says nothing about people: the outline follows edges, it does not find a person |
| "Export without music, add a song in Instagram" | E2E exports a video-only MP4 with no audio track and no track fetch; the cuts still land on the chosen track's beats | supported: `e2e/looks.spec.ts`, `src/render/orchestrate.test.ts`; passing 2026-10-17. Says nothing about which songs Instagram offers |
| "Your rating stays on this device" | Ratings held in memory only; E2E asserts no foreign request and empty storage | supported: `e2e/ui/rules-slice.spec.ts`; passing 2026-10-15 |

## Never claim

- "Released", "available", "production" before a tagged release exists.
- "AI-powered" for the MVP (curation is deterministic heuristics).
- Anything about trending audio or Instagram integration beyond the system share sheet. "Add a song inside Instagram" is an instruction to the user, not a feature: the app does not know, suggest or sync to any Instagram song.
- That a look is "trending" or "as used by" any app or creator. The looks are our own recipes; `docs/looks.md` says where each came from.
- "AI-powered" for the looks either: they are fixed recipes with numbers, no model.
