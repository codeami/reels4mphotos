import { test } from '@playwright/test';

// PLACEHOLDER for the render workstream. Fill this in; do not delete it.
// MVP gate, step 4: load fixture photos, export a reel, read the MP4 metadata in
// JavaScript (no ffmpeg) and assert 1080x1920, 30 fps, 15-30 s duration, audio present.
// Also attach the metadata to the PR, per AGENTS.md "Evidence over assertion".
test.skip('exports a 1080x1920, 30 fps, 15-30 s MP4 with audio', async () => {
  // TODO(render workstream): drive the UI with fixture photos, capture the exported Blob,
  // parse the MP4, assert the metadata above.
});
