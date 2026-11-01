# Tech debt

Found by reading the code on 2026-11-01. Each item has a location, the impact and a proposed fix. There are no `TODO` or `FIXME` comments in `src/`, so this list comes from review, not from markers. Impact ratings are inferred.

| # | Where | Debt | Impact | Proposed fix |
| --- | --- | --- | --- | --- |
| 1 | `vite.config.ts:14` | Coverage is collected (`npm test` runs `--coverage`) but no threshold is set. | A drop in coverage passes CI unnoticed. Low. | Add `coverage.thresholds` at the current level and ratchet up. |
| 2 | `src/ui/app.ts:1` (575 lines) | One file holds the largest share of UI wiring; the `screens/` folder already exists beside it. | Hard to review and change; raises the cost of the next UI feature. Medium. | Move flow logic into `screens/` modules or a small controller, keeping behaviour. |
| 3 | `src/render/e2e/harness.ts:513` | Fixed 750 ms `setTimeout` wait inside the E2E harness. | Can flake on a slow runner or waste time on a fast one. Medium. | Wait on an observable event (frame count, worker message) instead of a delay. |
| 4 | `src/ui/seams/fakes.ts:123` and `:155` | Fakes use fixed 250 ms and 120 ms sleeps to imitate work. | Same timing sensitivity in UI tests. Low. | Resolve fakes on a promise the test controls. |
| 5 | `src/render/encode/mediarecorder.ts:47` and `:57` | Fallback encoder uses a 10 ms sleep and a frame-fallback timer. | The fallback path is slow-by-design and timing based. The scout recorded WebCodecs AAC working on iOS 26, so the path may now be rarely used (inferred). Low. | Keep, but add a test for the timer branch, or retire the path once more devices confirm WebCodecs. |
| 6 | `src/looks/legacy-looks.fixture.ts:1` (216 lines) | A frozen TypeScript copy of the looks, kept only so `src/looks/recipes.test.ts:3` can prove the JSON recipes match. | Two sources of truth for eight looks. Any new look needs a fixture or a gap in the test. Low. | Replace with a snapshot of the validated recipes once the JSON format settles. |
| 7 | `playwright.config.ts:13` | Only a Chromium desktop project. | The primary target, iOS Safari, is covered by manual device runs only. High. | Add a WebKit project and a mobile viewport; keep the real-device run for WebCodecs. |
| 8 | `.github/workflows/ci.yml:3-5` | CI runs on every push and every PR, so a branch with an open PR runs twice. | Wasted CI minutes. Low. | Limit `push` to `main`. |
| 9 | `docs/claims-checklist.md:12` ("Reel in under 30 seconds") | Device evidence comes from one phone and 12 generated photos. | The speed claim is narrower than its wording. Medium. | Repeat on real photos and a second device; narrow the wording until then. |
| 10 | `docs/looks.md:7` | `docs/looks.md` points at a data path in another repository (the scout output) for the look numbers. | A reader of this public repo cannot follow the reference. Low. | Copy the needed numbers into `docs/looks.md` or drop the pointer. |
