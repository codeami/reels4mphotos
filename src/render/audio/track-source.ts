import { RenderError, errorMessage } from '../errors';

const TRACK_ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/i;

// public/music/<trackId>/track.m4a, resolved against the app's base path so it also works under
// GitHub Pages' /<repo>/ prefix. Same-origin only; nothing here leaves the device.
export function trackUrl(trackId: string, baseUrl: string = import.meta.env.BASE_URL): string {
  if (!TRACK_ID_PATTERN.test(trackId)) {
    throw new RenderError('invalid-plan', `"${trackId}" is not a valid track id`);
  }
  return `${baseUrl.replace(/\/?$/, '/')}music/${trackId}/track.m4a`;
}

export interface TrackSourceOptions {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

export async function loadTrackBytes(
  trackId: string,
  options: TrackSourceOptions = {},
): Promise<ArrayBuffer> {
  const url = trackUrl(trackId);
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(url, { signal: options.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.arrayBuffer();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new RenderError('track-fetch-failed', `could not load ${url}: ${errorMessage(error)}`, {
      cause: error,
    });
  }
}
