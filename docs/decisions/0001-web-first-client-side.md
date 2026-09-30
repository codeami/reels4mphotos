# 0001 — Web first, fully client-side

Date: 2026-10-01 · Status: accepted

## Context

Goals: showcase app-dev skill, prep for the Claude Certified Architect exam, privacy-first positioning, later an iOS app and a bundled messenger. Captain's Mac is Intel, which limits local iOS tooling and Apple Intelligence.

## Decision

Build the MVP as a client-side web app (PWA) deployed to GitHub Pages. All curation and rendering happen in the browser. iOS native follows, reusing the `ReelPlan` format.

## Consequences

- Fast to ship and test (Playwright), shareable by URL, runs on the captain's iPhone today.
- Depends on browser media APIs (WebCodecs, Web Share) — iOS Safari support must be verified.
- Privacy is enforceable and testable (CSP + zero-request E2E).
