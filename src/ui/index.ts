import './styles.css';
import { createApp } from './app';
import { resolveEngines } from './seams/engines';
import type { Engines } from './seams/types';

/**
 * Mounts the Reels4mPhotos UI into `root` (the `#app` element).
 * `engines` is injectable for tests; by default the real curation and render
 * modules are used when present and marked fakes stand in otherwise.
 */
export async function mountApp(root: HTMLElement, engines?: Engines) {
  // ?fakes=1 pins the deterministic demo engines; the E2E tests rely on it.
  const pinFakes = new URLSearchParams(location.search).get('fakes') === '1';
  const resolved = engines ?? (await resolveEngines(pinFakes));
  return createApp(root, resolved);
}
