# Pending work

Open items, 2026-11-01. Size: S under a day, M a few days, L a week or more (inferred estimates). Priority: P1 blocks the MVP gate, P2 should follow, P3 nice to have. Items marked "owner" need the project owner, not an agent (`AGENTS.md`, "Ask the captain").

| # | Item | Size | Priority | Why it is open |
| --- | --- | --- | --- | --- |
| 1 | Run the full MVP gate on an iPhone with 20 real camera-roll photos | S | P1 | `docs/mvp-brief.md` gate steps 1-4. Only 12 generated photos were measured (`docs/claims-checklist.md`, "Reel in under 30 seconds"). Owner. |
| 2 | Record a device network log for gate step 6 | S | P1 | Zero-request proof exists only on desktop Chromium (`e2e/zero-requests.spec.ts`). The "never leave your device" claim is supported there only. |
| 3 | Decide the Instagram step: reword gate step 5 or find another route | S | P1 | `docs/scout-technical.md` section 4: Instagram did not appear in the share sheet. Gate step 5 cannot pass as written. Owner. |
| 4 | Check that the exported MP4 plays in Apple Photos | S | P1 | The claims checklist says Photos playback and the share sheet are "not yet evidenced". Owner. |
| 5 | Cut a tagged release and update the README status line | S | P1 | README says "pre-MVP. Nothing here is released"; `docs/claims-checklist.md` forbids "released" before a tag. |
| 6 | Run E2E on WebKit and a mobile viewport in CI | M | P2 | `playwright.config.ts:13` has a single Chromium project; iOS Safari is the primary target. |
| 7 | Split `src/ui/app.ts` | M | P2 | 575 lines, the largest source file. See TECH-DEBT.md item 2. |
| 8 | Add a coverage threshold | S | P2 | `vite.config.ts:14` reports coverage but enforces none. |
| 9 | Add `SECURITY.md` and `CONTRIBUTING.md` | S | P2 | The repo has neither (inferred from `git ls-files`). It is public and makes privacy claims. |
| 10 | Add a HEIC decoder for desktop Chrome | M | P3 | Desktop skips HEIC with a message (`src/ui/intake.ts:25`). Scout says add one only if users ask. |
| 11 | Opt-in Claude planner | L | P3 | README "Later" item 1. Adds network access, so it needs an owner decision first. |
| 12 | iOS native app | L | P3 | README "Later" item 2. |

Top items are filed as GitHub Issues under the milestone "MVP gate"; the PR that added this file lists them.
