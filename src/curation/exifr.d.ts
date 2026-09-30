// exifr's own typings accept a URL string, which it would fetch. Narrow the
// surface to in-memory bytes so a network read cannot type-check.
declare module 'exifr/dist/lite.esm.mjs' {
  export function parse(
    bytes: Uint8Array,
    options: { exif: { pick: string[] }; tiff: false },
  ): Promise<{ DateTimeOriginal?: unknown } | undefined>;
}
