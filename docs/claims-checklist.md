# Claims checklist

Use before any README, site, store listing, post or video. Every public claim must be backed by evidence in this repo.

## Claims we want to make (need evidence before use)

| Claim | Evidence required | Status |
|---|---|---|
| "Your photos never leave your device" | E2E test asserting zero network requests after load + CSP `connect-src 'self'` | supported: `e2e/zero-requests.spec.ts`, `e2e/ui/flow.spec.ts` (no requests beyond app origin, no CSP violations), `connect-src 'self'` in `index.html`; passing 2026-10-01 |
| "Works offline" | E2E run with network disabled after first load | supported: `e2e/offline.spec.ts`; passing 2026-10-01 |
| "No account, no tracking" | No auth code, no analytics deps (dependency audit in CI) | supported: `tools/audit-deps.mjs` runs in CI lint step and passes; no auth code in repo |
| "Reel in under 30 seconds" | Timed export on a named iPhone model | not yet |
| "Clearing the app does not delete your originals" | E2E: the clear flow names what goes and what stays, and leaves no blob URLs or storage behind | supported: `e2e/ui/rules-slice.spec.ts`; passing 2026-10-15 |
| "Your rating stays on this device" | Ratings held in memory only; E2E asserts no foreign request and empty storage | supported: `e2e/ui/rules-slice.spec.ts`; passing 2026-10-15 |

## Never claim

- "Released", "available", "production" before a tagged release exists.
- "AI-powered" for the MVP (curation is deterministic heuristics).
- Anything about trending audio or Instagram integration beyond the system share sheet.
