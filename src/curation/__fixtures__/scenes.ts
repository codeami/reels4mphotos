// Fixtures are generated, not committed as binaries: every image the tests use
// can be explained by the few lines that draw it.
import type { PixelBuffer } from '../types';

export function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function blank(width: number, height: number): PixelBuffer {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

/**
 * A mid-tone scene with hard edges: a gradient backdrop plus a handful of
 * bright and dark rectangles and discs. Luma stays inside roughly 40..215 so the
 * unmodified scene is well exposed, and the edges give it real sharpness.
 */
export function makeScene(seed: number, width = 256, height = 256): PixelBuffer {
  const rand = seededRandom(seed);
  const px = blank(width, height);
  const baseR = 90 + rand() * 60;
  const baseG = 90 + rand() * 60;
  const baseB = 90 + rand() * 60;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const g = (x / width - 0.5) * 30 + (y / height - 0.5) * 20;
      const i = (y * width + x) * 4;
      px.data[i] = baseR + g;
      px.data[i + 1] = baseG + g;
      px.data[i + 2] = baseB + g;
      px.data[i + 3] = 255;
    }
  }
  const shapes = 9;
  for (let s = 0; s < shapes; s++) {
    const cx = rand() * width;
    const cy = rand() * height;
    const r = 12 + rand() * 40;
    const light = rand() > 0.5;
    const tone = light ? 195 + rand() * 20 : 45 + rand() * 20;
    const disc = rand() > 0.5;
    for (let y = Math.max(0, Math.floor(cy - r)); y < Math.min(height, cy + r); y++) {
      for (let x = Math.max(0, Math.floor(cx - r)); x < Math.min(width, cx + r); x++) {
        if (disc && (x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
        const i = (y * width + x) * 4;
        px.data[i] = tone;
        px.data[i + 1] = tone;
        px.data[i + 2] = tone;
      }
    }
  }
  return px;
}

/** Separable box blur, used to fake an out-of-focus shot. */
export function boxBlur(src: PixelBuffer, radius: number): PixelBuffer {
  const { width, height } = src;
  const tmp = blank(width, height);
  const out = blank(width, height);
  const span = radius * 2 + 1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (let k = -radius; k <= radius; k++) {
          const xx = Math.min(width - 1, Math.max(0, x + k));
          sum += src.data[(y * width + xx) * 4 + c]!;
        }
        tmp.data[(y * width + x) * 4 + c] = sum / span;
      }
      tmp.data[(y * width + x) * 4 + 3] = 255;
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (let k = -radius; k <= radius; k++) {
          const yy = Math.min(height - 1, Math.max(0, y + k));
          sum += tmp.data[(yy * width + x) * 4 + c]!;
        }
        out.data[(y * width + x) * 4 + c] = sum / span;
      }
      out.data[(y * width + x) * 4 + 3] = 255;
    }
  }
  return out;
}

/** out = in * gain + offset, per colour channel, clamped. */
export function tone(src: PixelBuffer, gain: number, offset = 0): PixelBuffer {
  const out = blank(src.width, src.height);
  for (let i = 0; i < src.data.length; i += 4) {
    out.data[i] = src.data[i]! * gain + offset;
    out.data[i + 1] = src.data[i + 1]! * gain + offset;
    out.data[i + 2] = src.data[i + 2]! * gain + offset;
    out.data[i + 3] = 255;
  }
  return out;
}

/** Blown highlights: most of the frame pinned at 255. */
export const clippedHighlights = (src: PixelBuffer): PixelBuffer => tone(src, 3, 60);

/** Crushed shadows: most of the frame pinned near 0. */
export const crushedShadows = (src: PixelBuffer): PixelBuffer => tone(src, 0.15, -10);

/** A second frame of the same scene: a touch of sensor noise and a small brightness shift. */
export function nearDuplicate(src: PixelBuffer, seed: number, noise = 6, shift = 4): PixelBuffer {
  const rand = seededRandom(seed);
  const out = blank(src.width, src.height);
  for (let i = 0; i < src.data.length; i += 4) {
    const n = (rand() - 0.5) * 2 * noise;
    out.data[i] = src.data[i]! + shift + n;
    out.data[i + 1] = src.data[i + 1]! + shift + n;
    out.data[i + 2] = src.data[i + 2]! + shift + n;
    out.data[i + 3] = 255;
  }
  return out;
}

export function flat(width: number, height: number, value: number): PixelBuffer {
  const px = blank(width, height);
  for (let i = 0; i < px.data.length; i += 4) {
    px.data[i] = value;
    px.data[i + 1] = value;
    px.data[i + 2] = value;
    px.data[i + 3] = 255;
  }
  return px;
}

/**
 * The smallest JPEG that carries an EXIF DateTimeOriginal: SOI, one APP1
 * segment holding a two-IFD TIFF block, EOI. Not decodable as a picture, which
 * is fine: EXIF reading and pixel decoding are separate steps.
 */
export function exifJpegBytes(dateTimeOriginal: string | null): Uint8Array {
  if (dateTimeOriginal === null) return Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
  const tiff = new Uint8Array(64);
  const v = new DataView(tiff.buffer);
  tiff.set([0x49, 0x49], 0); // little endian
  v.setUint16(2, 42, true);
  v.setUint32(4, 8, true); // IFD0 offset
  v.setUint16(8, 1, true); // IFD0: one entry
  v.setUint16(10, 0x8769, true); // ExifIFDPointer
  v.setUint16(12, 4, true); // LONG
  v.setUint32(14, 1, true);
  v.setUint32(18, 26, true); // Exif IFD offset
  v.setUint32(22, 0, true); // no next IFD
  v.setUint16(26, 1, true); // Exif IFD: one entry
  v.setUint16(28, 0x9003, true); // DateTimeOriginal
  v.setUint16(30, 2, true); // ASCII
  v.setUint32(32, 20, true);
  v.setUint32(36, 44, true); // string offset
  v.setUint32(40, 0, true);
  for (let i = 0; i < dateTimeOriginal.length; i++) tiff[44 + i] = dateTimeOriginal.charCodeAt(i);
  const header = [0xff, 0xd8, 0xff, 0xe1, 0x00, 72, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00];
  return Uint8Array.from([...header, ...tiff, 0xff, 0xd9]);
}

export function exifFile(name: string, dateTimeOriginal: string | null, lastModified = 0): File {
  return new File([exifJpegBytes(dateTimeOriginal).slice()], name, { type: 'image/jpeg', lastModified });
}
