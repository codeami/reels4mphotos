import { MAX_PHOTO_LONG_EDGE, PHOTO_CACHE_SIZE } from '../constants';
import { RenderError, errorMessage } from '../errors';
import type { DecodedPhoto } from './draw';

export interface PhotoProvider {
  get(photoId: string): Promise<DecodedPhoto>;
  dispose(): void;
}

interface Closable extends DecodedPhoto {
  close(): void;
}

// Decodes honouring EXIF orientation, then shrinks anything larger than MAX_PHOTO_LONG_EDGE so a
// 48 MP photo never stays resident at full size.
export async function decodePhoto(blob: Blob): Promise<Closable> {
  const full = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  const longEdge = Math.max(full.width, full.height);
  if (longEdge <= MAX_PHOTO_LONG_EDGE) {
    return { image: full, width: full.width, height: full.height, close: () => full.close() };
  }
  const scale = MAX_PHOTO_LONG_EDGE / longEdge;
  const width = Math.round(full.width * scale);
  const height = Math.round(full.height * scale);
  try {
    const small = await createImageBitmap(full, {
      resizeWidth: width,
      resizeHeight: height,
      resizeQuality: 'high',
    });
    return { image: small, width: small.width, height: small.height, close: () => small.close() };
  } finally {
    full.close();
  }
}

// Shots play in order, so keeping the last few decoded photos covers the current shot and a
// crossfade either side of it while memory stays bounded. Concurrent requests for one photo share a
// single decode, and nothing decoded after dispose() is kept.
export class PhotoStore implements PhotoProvider {
  private readonly cache = new Map<string, Closable>();
  private readonly decoding = new Map<string, Promise<Closable>>();
  private disposed = false;

  constructor(
    private readonly photos: ReadonlyMap<string, Blob>,
    private readonly decode: (blob: Blob) => Promise<Closable> = decodePhoto,
    private readonly capacity: number = PHOTO_CACHE_SIZE,
  ) {}

  async get(photoId: string): Promise<DecodedPhoto> {
    const cached = this.cache.get(photoId);
    if (cached) {
      this.cache.delete(photoId);
      this.cache.set(photoId, cached);
      return cached;
    }
    const pending = this.decoding.get(photoId) ?? this.startDecode(photoId);
    return pending;
  }

  dispose(): void {
    this.disposed = true;
    for (const photo of this.cache.values()) photo.close();
    this.cache.clear();
  }

  private startDecode(photoId: string): Promise<Closable> {
    const blob = this.photos.get(photoId);
    if (!blob)
      return Promise.reject(new RenderError('missing-photo', `no photo supplied for "${photoId}"`));

    const decoding = this.decode(blob).then(
      (decoded) => {
        this.decoding.delete(photoId);
        if (this.disposed) {
          decoded.close();
        } else {
          this.cache.set(photoId, decoded);
          this.evict();
        }
        return decoded;
      },
      (error: unknown) => {
        this.decoding.delete(photoId);
        throw new RenderError(
          'photo-decode-failed',
          `could not decode "${photoId}": ${errorMessage(error)}`,
          { cause: error },
        );
      },
    );
    this.decoding.set(photoId, decoding);
    return decoding;
  }

  private evict(): void {
    while (this.cache.size > this.capacity) {
      const oldest = this.cache.keys().next().value as string;
      this.cache.get(oldest)?.close();
      this.cache.delete(oldest);
    }
  }
}
