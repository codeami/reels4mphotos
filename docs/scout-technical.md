# Technical scout — open questions from mvp-brief.md

Run by Claude (Cowork) on 2026-10-01 from public sources. Each answer ends with a **verify** step: a check the build must make on a real iPhone before relying on it.

## 1. WebCodecs encoding on iOS Safari

- Safari 26.0 added `AudioEncoder` / `AudioDecoder`. Video encoding (`VideoEncoder`) shipped earlier. Source: WebKit, "WebKit Features in Safari 26.0".
- Existing proof: an iOS 26 PWA (kimymt/iphone-video-compressor) encodes H.264/HEVC video and re-encodes audio with `AudioEncoder`, all on-device.
- AAC encoding in Safari isn't explicitly documented. Treat it as likely but unproven.
- **Decision:** H.264 (`avc1.640028`, High@4.0) at 1080×1920 / 30 fps + AAC-LC 128 kbps. Min target: iOS 26 Safari.
- **Verify:** `VideoEncoder.isConfigSupported` and `AudioEncoder.isConfigSupported` for exactly these configs on the captain's iPhone. If AAC fails, fallback order: (a) Opus in MP4 if supported, (b) MediaRecorder capturing canvas + audio graph, (c) silent video with a "add sound in Instagram" hint.

## 2. MP4 muxer

- **Mediabunny** (Vanilagy) is the successor to mp4-muxer, which is now outdated. It's zero-dependency and tree-shakeable, and writes MP4 with H.264 + AAC from WebCodecs output. Licence: MPL-2.0 (file-level copyleft: fine alongside MIT app code, as long as mediabunny's own files stay unmodified).
- **Decision:** use mediabunny for muxing, and for reading MP4 metadata back in E2E tests (no ffmpeg; Intel Mac).
- **Verify:** production bundle size of the MP4-only import.

## 3. HEIC input

- iOS Safari decodes HEIC natively (`createImageBitmap` / `<img>`), so HEIC files are fine on the primary target.
- Gotcha: `accept="image/*,image/heic"` makes Safari 17+ silently convert *all* picks (even JPEGs) to HEIC (Apple Developer Forums thread 743049). Use `accept="image/*"` only.
- Desktop Chrome can't decode HEIC. For the MVP, show a "HEIC not supported in this browser" chip and skip the file; lazy-load a decoder only if users ask for it.
- **Verify:** whether picks from the iOS photo sheet keep EXIF `DateTimeOriginal` (needed for the time-spread score). If it's stripped, fall back to `File.lastModified` and pick order.

## 4. Share / save on iPhone

- `navigator.share({ files: [mp4] })` opens the iOS share sheet (available since iOS 15). Save to Photos, AirDrop and messaging apps all work. Instagram's presence in the sheet depends on the installed app. Very large files can fail in the share sheet, so offer a download fallback.
- **Decision:** primary button = Share (`navigator.canShare({files})` guarded); secondary = Download.
- **Verify:** Instagram appears in the sheet for an MP4 from the page, and "Save Video" lands in Photos.

## 5. Music licence

- Use CC0 tracks only: they're redistributable in a public repo with no attribution burden. Candidate sources: HoliznaCC0 (Free Music Archive, "Public Domain Lofi"), SoundSafari/CC0-1.0-Music on GitHub.
- **Decision:** 3 tracks (chill, upbeat, cinematic), 30–60 s loops, each with `LICENSE.txt` + source URL beside it in `public/music/`. Beat maps pre-computed offline by a script and committed as JSON.
- **Verify:** the licence text on each track's source page at download time. Check that the track is CC0 itself, not just hosted on a CC0-friendly site.

## Resulting stack

Vite + TypeScript (no framework, or Preact if the UI grows) · Web Worker curation · Canvas 2D render · WebCodecs + mediabunny · Vitest + Playwright · GitHub Actions + Pages · PWA service worker.

## Sources

- https://webkit.org/blog/17333/webkit-features-in-safari-26-0/
- https://github.com/kimymt/iphone-video-compressor
- https://mediabunny.dev/guide/introduction
- https://github.com/Vanilagy/mp4-muxer
- https://developer.apple.com/forums/thread/743049
- https://freemusicarchive.org/music/holiznacc0/public-domain-lofi
- https://github.com/SoundSafari/CC0-1.0-Music
