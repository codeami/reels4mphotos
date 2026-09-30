# Reels4mPhotos

Turn a handful of photos into a scroll-ready 9:16 reel in seconds — without your photos ever leaving your device.

> Status: pre-MVP. Nothing here is released. See `docs/claims-checklist.md` before saying otherwise.

## Problem

Making a reel from photos today means one of two trade-offs:

- **Built-ins** (Apple Photos Memories, Google Photos) choose photos for you but export landscape-ish movies that aren't reel-native.
- **Editors** (CapCut, VN, InShot, Canva) make great reels but you hand-pick every photo and tap through templates. CapCut is also unavailable in India.

Nobody does the whole loop — pick the best shots, cut them to a beat, export 9:16 — and keeps the photos private.

## Target user

Someone with a camera roll full of trip / event photos who wants a reel to post today, and doesn't want to upload their library to a server to get it.

## MVP (core loop)

1. **Add photos** — choose 5–50 photos from the device (file picker / iOS photo sheet).
2. **Auto-select** — the app picks the best ~10 on-device: drops blurry, badly exposed and near-duplicate shots, keeps a spread across time. The user can toggle any photo in or out and drag to reorder.
3. **Pick a beat** — one of 3 bundled royalty-free tracks, each with a pre-computed beat map.
4. **Preview** — 1080×1920, 30 fps: Ken Burns pan/zoom on each photo, cuts land on beats, 2 transition styles. Target 15–30 s.
5. **Export & share** — MP4 (H.264 + AAC) saved to the device or shared through the system share sheet.

Everything runs in the browser. No account, no server, no network after the page loads.

## Out of scope for MVP

AI planner (Claude), captions/text overlays, trending audio, templates marketplace, video clips as input, accounts, cloud sync, the iOS native app, the messenger bundle.

## Non-functional

- **Private by construction:** CSP `connect-src 'self'`; no analytics; works offline after first load (PWA).
- **Fast:** 10 photos → exported 20 s reel in under 30 s on a recent iPhone.
- **Works on:** iOS Safari (primary), desktop Chrome/Safari.

## Later (post-MVP)

1. Opt-in Claude planner: sends text metadata only (scores, timestamps, scene tags — never pixels), returns a JSON `ReelPlan` (order, per-shot duration, beat cuts, caption). Offline fallback = the MVP's deterministic planner.
2. iOS native app (SwiftUI, PhotoKit, Vision, AVFoundation) sharing the same `ReelPlan` format.
3. Bundle with the privacy-first messenger: send a reel end-to-end encrypted.

## License

MIT - see [LICENSE](LICENSE).
