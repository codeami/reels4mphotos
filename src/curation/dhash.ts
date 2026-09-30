import { toLuma } from './luma';
import type { PixelBuffer } from './types';

const COLS = 9;
const ROWS = 8;
const HEX = '0123456789abcdef';
const POPCOUNT = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];

/** Mean luma of each cell of a COLS x ROWS grid laid over the image (area average). */
function cellMeans(px: PixelBuffer): number[] {
  const luma = toLuma(px);
  const { width, height } = px;
  const sums = new Float64Array(COLS * ROWS);
  const counts = new Uint32Array(COLS * ROWS);
  for (let y = 0; y < height; y++) {
    const row = Math.min(ROWS - 1, Math.floor((y * ROWS) / height));
    for (let x = 0; x < width; x++) {
      const cell = row * COLS + Math.min(COLS - 1, Math.floor((x * COLS) / width));
      sums[cell] = sums[cell]! + luma[y * width + x]!;
      counts[cell] = counts[cell]! + 1;
    }
  }
  return Array.from(sums, (s, i) => (counts[i]! > 0 ? s / counts[i]! : 0));
}

/** 64-bit difference hash, as 16 hex digits: one bit per "is this cell darker than its right neighbour". */
export function dHash(px: PixelBuffer): string {
  const cells = cellMeans(px);
  let hex = '';
  let nibble = 0;
  let bits = 0;
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS - 1; x++) {
      nibble = (nibble << 1) | (cells[y * COLS + x]! < cells[y * COLS + x + 1]! ? 1 : 0);
      if (++bits === 4) {
        hex += HEX[nibble];
        nibble = 0;
        bits = 0;
      }
    }
  }
  return hex;
}

/** Number of differing bits between two hashes from `dHash`. */
export function hamming(a: string, b: string): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    d += POPCOUNT[parseInt(a[i]!, 16) ^ parseInt(b[i]!, 16)]!;
  }
  return d;
}
