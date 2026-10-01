import { describe, expect, it, vi } from 'vitest';
import { PhotoStore } from './photo-store';

function fakePhoto() {
  return { image: {} as CanvasImageSource, width: 100, height: 100, close: vi.fn() };
}

function store(ids: string[], capacity = 2) {
  const blobs = new Map(ids.map((id) => [id, new Blob([id])]));
  const decoded = new Map<Blob, ReturnType<typeof fakePhoto>>();
  const decode = vi.fn(async (blob: Blob) => {
    const photo = fakePhoto();
    decoded.set(blob, photo);
    return photo;
  });
  return {
    photos: new PhotoStore(blobs, decode, capacity),
    decode,
    decodedFor: (id: string) => decoded.get(blobs.get(id) as Blob),
  };
}

describe('PhotoStore', () => {
  it('decodes a photo once and serves it from memory afterwards', async () => {
    const { photos, decode } = store(['a']);
    const first = await photos.get('a');
    expect(await photos.get('a')).toBe(first);
    expect(decode).toHaveBeenCalledTimes(1);
  });

  it('shares one decode between concurrent requests for the same photo', async () => {
    const { photos, decode } = store(['a']);
    const [x, y] = await Promise.all([photos.get('a'), photos.get('a')]);
    expect(x).toBe(y);
    expect(decode).toHaveBeenCalledTimes(1);
  });

  it('closes the least recently used photo when over capacity', async () => {
    const { photos, decodedFor } = store(['a', 'b', 'c'], 2);
    await photos.get('a');
    await photos.get('b');
    await photos.get('a'); // a is now the most recent
    await photos.get('c');
    expect(decodedFor('b')?.close).toHaveBeenCalledTimes(1);
    expect(decodedFor('a')?.close).not.toHaveBeenCalled();
    expect(decodedFor('c')?.close).not.toHaveBeenCalled();
  });

  it('refuses a photo that was never supplied', async () => {
    const { photos } = store(['a']);
    await expect(photos.get('nope')).rejects.toMatchObject({ code: 'missing-photo' });
  });

  it('reports an undecodable photo as photo-decode-failed and retries it next time', async () => {
    const blobs = new Map([['a', new Blob(['x'])]]);
    const decode = vi
      .fn<(blob: Blob) => Promise<ReturnType<typeof fakePhoto>>>()
      .mockRejectedValueOnce(new Error('unsupported image'))
      .mockResolvedValueOnce(fakePhoto());
    const photos = new PhotoStore(blobs, decode);
    await expect(photos.get('a')).rejects.toMatchObject({
      code: 'photo-decode-failed',
      message: expect.stringContaining('unsupported image'),
    });
    await expect(photos.get('a')).resolves.toMatchObject({ width: 100 });
  });

  it('closes everything on dispose, including a decode still in flight', async () => {
    const { photos, decode, decodedFor } = store(['a', 'b']);
    await photos.get('a');
    const firstA = decodedFor('a');
    const inFlight = photos.get('b');
    photos.dispose();
    await inFlight;
    expect(firstA?.close).toHaveBeenCalledTimes(1);
    expect(decodedFor('b')?.close).toHaveBeenCalledTimes(1);
    // a disposed store keeps nothing: asking again decodes afresh and closes that one too
    await photos.get('a');
    expect(decode).toHaveBeenCalledTimes(3);
    expect(decodedFor('a')?.close).toHaveBeenCalledTimes(1);
  });
});
