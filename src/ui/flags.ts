import type { LookFlags } from '../looks';

// Feature flags, read once from the page URL when the app starts. Off unless asked for, so a
// feature behind one is invisible until its URL is opened: `?gallery=1` shows the Gallery look.
export type Flags = LookFlags;

export function readFlags(search: string): Flags {
  const params = new URLSearchParams(search);
  return { gallery: params.get('gallery') === '1' };
}
