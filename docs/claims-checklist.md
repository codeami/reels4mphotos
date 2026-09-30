# Claims checklist

Use before any README, site, store listing, post or video. Every public claim must be backed by evidence in this repo.

## Claims we want to make (need evidence before use)

| Claim | Evidence required | Status |
|---|---|---|
| "Your photos never leave your device" | E2E test asserting zero network requests after load + CSP `connect-src 'self'` | supported: `e2e/zero-requests.spec.ts`, `e2e/ui/flow.spec.ts` (no requests beyond app origin, no CSP violations), `connect-src 'self'` in `index.html`; passing 2026-10-01 |
| "Works offline" | E2E run with network disabled after first load | supported: `e2e/offline.spec.ts`; passing 2026-10-01 |
| "No account, no tracking" | No auth code, no analytics deps (dependency audit in CI) | supported: `tools/audit-deps.mjs` runs in CI lint step and passes; no auth code in repo |
| "Reel in under 30 seconds" | Timed export on a named iPhone model | not yet |

## Never claim

- "Released", "available", "production" before a tagged release exists.
- "AI-powered" for the MVP (curation is deterministic heuristics).
- Anything about trending audio or Instagram integration beyond the system share sheet.
