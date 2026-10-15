/** A photo just picked, not yet sent to curation. The user keeps or removes it in the review grid. */
export interface Staged {
  id: number;
  file: File;
  kept: boolean;
}

export const THUMB_WIDTH = 480;

export const stage = (files: readonly File[]): Staged[] =>
  files.map((file, id) => ({ id, file, kept: true }));

export const toggleKept = (list: readonly Staged[], id: number): Staged[] =>
  list.map((x) => (x.id === id ? { ...x, kept: !x.kept } : x));

export const keptFiles = (list: readonly Staged[]): File[] =>
  list.filter((x) => x.kept).map((x) => x.file);

export interface Thumbs {
  /** One canvas per staged photo, drawn once. The same element is reused across re-renders. */
  canvasFor: (id: number) => HTMLCanvasElement;
  /** Decodes one photo at a time into a small canvas. Never rejects. */
  load: (list: readonly Staged[]) => Promise<void>;
  /** Empties every canvas and stops any decode still in flight. */
  release: () => void;
}

/** Thumbnails live in memory only: a downscaled canvas per photo, no object URLs. */
export function createThumbs(): Thumbs {
  let canvases = new Map<number, HTMLCanvasElement>();
  let generation = 0;

  const canvasFor = (id: number) => {
    let c = canvases.get(id);
    if (!c) {
      c = document.createElement('canvas');
      canvases.set(id, c);
    }
    return c;
  };

  async function load(list: readonly Staged[]) {
    const mine = ++generation;
    for (const x of list) {
      if (mine !== generation) return;
      const canvas = canvasFor(x.id);
      try {
        const bmp = await createImageBitmap(x.file, { resizeWidth: THUMB_WIDTH });
        if (mine === generation) {
          canvas.width = bmp.width;
          canvas.height = bmp.height;
          canvas.getContext('2d')?.drawImage(bmp, 0, 0);
          canvas.dataset.ready = '';
        }
        bmp.close();
      } catch {
        // A photo that cannot be decoded keeps a blank tile; intake reports it after Done.
        canvas.dataset.failed = '';
      }
    }
  }

  function release() {
    generation++;
    canvases.forEach((c) => {
      c.width = 0;
      c.height = 0;
    });
    canvases = new Map();
  }

  return { canvasFor, load, release };
}
