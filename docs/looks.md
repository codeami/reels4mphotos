# Looks

A look is how a reel is cut and drawn. The photos, their order and the music beats stay the same; the look changes the cut length, the motion, and what is drawn on top. A reel carries only the look's id (`ReelPlan.look`); the numbers live in `src/looks/looks.ts` as plain data, shared by the planner (`src/curation/plan.ts`), the renderer (`src/render/frames/`) and the preview.

Everything is canvas 2D on the device. No text, no font, no image or video file, no dependency, no network call, no model. `ctx.filter` is not used (Safari support is doubtful); the blurred fill is made by shrinking and scaling up.

Numbers come from the scout's recipes in `data/reels-style-catalog-scout/looks.json` (firstmate repo). Those recipes were read from public style descriptions and a few parameters in unlicensed Remotion template snippets (numbers only, no code copied). Treat the looks as our own recipes. Do not call them "trending" or credit any app or creator (`docs/claims-checklist.md`).

## The five looks

| Look | Cut length | Fit and fill | On every cut | Always on | Source recipe |
| --- | --- | --- | --- | --- | --- |
| Classic | about 2 s, every third cut fades (10 frames) | 9:16 crop, black | nothing | nothing | the renderer before looks existed |
| Zoom punch | 1 beat | whole photo inside the frame, blurred copy behind | scale 1.00 to 1.12 over 6 frames, ease-out cubic, then +2% a second | soft vignette (35%) | `zoom-punch` |
| Flash cut | 1 beat | as zoom punch | white flash 80% to 0 over 4 frames; scale 1.05 to 1.00 over the same 4 | light grain (5%), vignette (40%) | `flash-cut` |
| Cinematic | 4 to 8 beats | whole photo inside the frame, black behind | 18 frame smoothstep crossfade into every shot | black bars (10% of the height each), grain (9%), vignette (50%), teal shadows and warm highlights (two translucent fills), Ken Burns zoom 1.10 | `cinematic` |
| Photo dump | 1 to 2 beats | whole photo inside the frame, average photo colour behind | nothing | grain (5%), small handheld drift (0.4% of the width), warm lift (one translucent fill) | `photo-dump` |

Left out on purpose, because they need text or a font: the date stamp (photo dump), the optional title (cinematic). Left out of photo dump: the 20% flash cuts (it would repeat flash cut).

## How cuts are counted

Fast looks count in beats. `buildPlan` picks a whole number of beats per shot from the look's range, so the reel lands near the chosen length (Short, Standard, Long), and every cut is a beat of the chosen track. With few photos and a one-beat cut the photos would run out in seconds, so the set is gone through again, up to three passes, each time with new Ken Burns moves. That is why a quick look can show a photo more than once. If the beat map is too sparse to count beats, cuts fall back to even spacing.

Cinematic never drops a photo: if the track is too slow to give every photo four beats, shots get fewer beats.

## Fit and fill (why a crop may not be 9:16)

The default look fills the frame, so every Ken Burns crop must be 9:16 in the photo's own pixels, and `assertCropAspect` refuses anything else (stretching would be a wrong reel with no visible cause). A look whose `fit` is `contain` draws the crop inside the frame instead, so its crops follow the photo's own shape. For those looks `assertCropAspect` only refuses slivers (wider than 5:1 or taller than 1:5). `assertValidPlan` also refuses an unknown look id. Tests: `kenburns.test.ts`, `validate-plan.test.ts`.

Behind a photo that does not fill the frame:

- **Blurred fill.** The photo's centre 9:16 part is drawn at 96x170, then 24x43, then scaled up to 108x192, all with smoothing. Built once per photo and cached (`BackdropCache`, least recently used, 8 entries), then one `drawImage` per frame.
- **Colour fill.** The same chain, down to one pixel, which is the average photo colour.

## Small pieces

Each is a pure function with unit tests in `src/render/frames/effects.test.ts` and `backdrop.test.ts`.

- `punchScale(frame, punch)` and `flashAlpha(frame, flash)`: the per-beat envelopes. Frame `0` is the cut.
- `letterboxBarHeight`, `vignetteGeometry`, `destRect` (fit, scale about the centre, shift).
- `shakeOffset(frame, amplitude, width)`: two slow sines, bounded, no randomness.
- Grain: one 256 px noise tile from a fixed seed, drawn tiled with a per-frame offset from a seeded generator (`grainOffset`). The tile scales with the frame, so the preview and the export grain look the same. Nothing uses `Math.random`, so a frame is a pure function of (plan, photos, index) and the same reel renders the same pixels.
- `backdropKey(photoId, kind)` and `BackdropCache`.

## Silent export

"Export without music" leaves the music out of the MP4:

- **What the file holds:** a video track only (H.264 in MP4), no audio track. This is the existing `silent` render path, so there is no new encoder code. A silent audio track would have to go through the AAC encoder, which is the part of iOS Safari WebCodecs that has needed workarounds (`aac-config.ts`, `priming.ts`); a file with no audio track avoids all of that, and Instagram then offers its own music cleanly.
- **What it needs:** WebCodecs H.264 and OffscreenCanvas in the worker. A browser with only MediaRecorder cannot do it (MediaRecorder always records the audio it is given), and the app says so.
- **Cuts:** the plan is cut on the chosen track's beats as before, so the user should pick a song with a similar pace. The track is not fetched, decoded or encoded for this export.
- **UI:** a tick box on the export screen with the line "Add a song inside Instagram when you post.", and after export, a note that the cuts follow the beat of the chosen track with its BPM. The app does not name, suggest or sync to any song.

## Speed

Measured by `e2e/looks.spec.ts` ("render time per frame of each look"): headless desktop Chromium on the captain's Intel Mac (6 logical cores, software canvas, nothing else running, one render at a time), 120 frames per look at 1080x1920, photos 3072 px on the long edge. Each frame is drawn and handed to a `VideoFrame`, as the encoder path does. The machine is noisy: the classic look, which did not change, measured 49 to 78 ms across runs, so read the numbers as rough.

| Look | median ms/frame | slowest 5% (ms) | frames that start a shot (median ms, includes decoding the photo) |
| --- | --- | --- | --- |
| Classic | 76 | 134 | 140 |
| Zoom punch | 120 | 208 | 214 |
| Flash cut | 106 | 157 | 160 |
| Cinematic | 76 | 134 | 103 |
| Photo dump | 89 | 132 | 136 |

What looks heavy: every full-frame step (the vignette, a grade fill, the grain, the blurred fill) costs a pass over two million pixels on a CPU canvas. Already done to cut that: the vignette is drawn once and reused, grain is one pattern fill, and the blurred fill is drawn only where the photo leaves the frame bare. Zoom punch is the heaviest look. Fast looks also go round the photos again, and the photo cache holds 3, so they decode a photo at nearly every cut; that is the "shot start" column.

Not tested on a phone. An iPhone canvas is normally GPU-backed, which should make these steps cheaper than here, but that is a guess. To check on the phone: export each look (Standard length) and note the time; watch for the export taking much longer than Classic, the tab being killed, or the preview stuttering while a look plays.
