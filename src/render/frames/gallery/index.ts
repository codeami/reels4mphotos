import type { Gallery } from '../../../looks';
import type { ReelPlan } from '../../../types/reel-plan';
import type { LookAssets } from '../assets';
import type { DecodedPhoto } from '../draw';
import { galleryPhotoIds } from './layout';

export { galleryPhotoIds };

// The gallery look's 3D stage, as the rest of the renderer sees it. The three.js code behind it
// (three-stage.ts) is loaded on demand with loadGallery(), so three only reaches a page that shows
// the look: the main bundle stays as it was for everyone else. Inside the render worker the import
// is inlined by the build, so an export fetches nothing.
export interface GalleryStage {
  // The WebGL canvas the room is drawn on; drawFrame copies it into the frame.
  readonly canvas: CanvasImageSource;
  // Hands a photo in and uploads it to the GPU at once: the caller may close the bitmap after.
  addPhoto(photoId: string, photo: DecodedPhoto): Promise<void>;
  // Hangs every photo added so far, in plan order, and works out the camera path for the plan.
  build(plan: ReelPlan): void;
  // Draws the room as the camera sees it `progress` of the way through shot `shotIndex`.
  render(shotIndex: number, progress: number): void;
  dispose(): void;
}

export interface GalleryStageOptions {
  width: number;
  height: number;
  look: Gallery;
}

export type GalleryStageFactory = (options: GalleryStageOptions) => GalleryStage;

let loading: Promise<GalleryStageFactory> | null = null;

// Loads the three.js stage. Called ahead of time by an app that promises no requests after load.
export function loadGallery(): Promise<GalleryStageFactory> {
  loading ??= import('./three-stage').then(
    (module) => module.createGalleryStage,
    (error: unknown) => {
      // a failed load is not remembered, so the next attempt fetches again
      loading = null;
      throw error;
    },
  );
  return loading;
}

/**
 * Gets a renderer's assets ready to draw the gallery look: loads three, builds the stage at the
 * frame size, hangs every photo of the plan and plans the camera path. Does nothing when the stage
 * is already there. Photos are fetched one at a time and uploaded as they come, so a photo store
 * that keeps only a few decoded photos is enough.
 */
export async function prepareGallery(
  assets: LookAssets,
  plan: ReelPlan,
  look: Gallery,
  size: { width: number; height: number },
  photoFor: (photoId: string) => Promise<DecodedPhoto>,
): Promise<void> {
  if (assets.gallery) return;
  const createGalleryStage = await loadGallery();
  const stage = createGalleryStage({ width: size.width, height: size.height, look });
  try {
    for (const photoId of galleryPhotoIds(plan)) {
      await stage.addPhoto(photoId, await photoFor(photoId));
    }
    stage.build(plan);
  } catch (error) {
    stage.dispose();
    throw error;
  }
  assets.gallery = stage;
}
