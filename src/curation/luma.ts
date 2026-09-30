import type { PixelBuffer } from './types';

/** BT.601 luma, one byte per pixel. */
export function toLuma(px: PixelBuffer): Uint8Array {
  const n = px.width * px.height;
  const out = new Uint8Array(n);
  const d = px.data;
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    out[i] = (299 * (d[j] ?? 0) + 587 * (d[j + 1] ?? 0) + 114 * (d[j + 2] ?? 0)) / 1000;
  }
  return out;
}
