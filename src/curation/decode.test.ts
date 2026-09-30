import { describe, expect, it } from 'vitest';
import { flat } from './__fixtures__/scenes';
import { DecodeError, decodePhoto, fitWithin } from './decode';

describe('fitWithin', () => {
  it('scales the longest side down to the limit and keeps the aspect', () => {
    expect(fitWithin(4000, 3000, 512)).toEqual({ width: 512, height: 384 });
    expect(fitWithin(3000, 4000, 512)).toEqual({ width: 384, height: 512 });
  });

  it('never upscales', () => {
    expect(fitWithin(300, 200, 512)).toEqual({ width: 300, height: 200 });
  });

  it('never returns a zero side', () => {
    expect(fitWithin(10000, 1, 512).height).toBe(1);
  });
});

describe('decodePhoto', () => {
  const file = new File([new Uint8Array(8)], 'a.jpg', { type: 'image/jpeg' });

  it('hands back the downscaled pixels and the original size', async () => {
    const out = await decodePhoto(file, 512, {
      load: async () => ({ width: 4000, height: 3000, close: () => {} }),
      draw: (_bmp, w, h) => flat(w, h, 100),
    });
    expect(out.original).toEqual({ width: 4000, height: 3000 });
    expect(out.pixels.width).toBe(512);
    expect(out.pixels.height).toBe(384);
  });

  it('closes the bitmap after drawing', async () => {
    let closed = false;
    await decodePhoto(file, 512, {
      load: async () => ({ width: 10, height: 10, close: () => { closed = true; } }),
      draw: (_b, w, h) => flat(w, h, 1),
    });
    expect(closed).toBe(true);
  });

  it('turns a browser decode failure into a DecodeError with a reason', async () => {
    const promise = decodePhoto(file, 512, {
      load: async () => { throw new Error('The source image cannot be decoded.'); },
      draw: () => flat(1, 1, 0),
    });
    await expect(promise).rejects.toBeInstanceOf(DecodeError);
    await expect(promise).rejects.toThrow(/cannot be decoded/);
  });

  it('reports a missing decoder (no createImageBitmap) as a DecodeError, not a crash', async () => {
    await expect(decodePhoto(file, 512, { load: undefined, draw: undefined })).rejects.toBeInstanceOf(DecodeError);
  });
});
