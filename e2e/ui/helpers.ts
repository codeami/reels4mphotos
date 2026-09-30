import type { Page } from '@playwright/test';

export interface Pick {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

/** Real JPEGs drawn in the browser, so decoding and thumbnails are genuine. */
export async function makePhotos(page: Page, n: number): Promise<Pick[]> {
  const b64s = await page.evaluate(async (count) => {
    const out: string[] = [];
    for (let i = 0; i < count; i++) {
      const c = document.createElement('canvas');
      c.width = 400 + (i % 3) * 80;
      c.height = 600;
      const g = c.getContext('2d');
      if (!g) throw new Error('no 2d context');
      g.fillStyle = `hsl(${(i * 37) % 360} 60% ${30 + (i % 4) * 10}%)`;
      g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = '#fff';
      g.font = '120px sans-serif';
      g.fillText(String(i + 1), 40, 200);
      const blob: Blob = await new Promise((r, rej) =>
        c.toBlob((b) => (b ? r(b) : rej(new Error('toBlob failed'))), 'image/jpeg', 0.8),
      );
      const buf = new Uint8Array(await blob.arrayBuffer());
      let s = '';
      buf.forEach((b) => (s += String.fromCharCode(b)));
      out.push(btoa(s));
    }
    return out;
  }, n);
  return b64s.map((b, i) => ({
    name: `IMG_${String(i + 1).padStart(3, '0')}.jpg`,
    mimeType: 'image/jpeg',
    buffer: Buffer.from(b, 'base64'),
  }));
}

export const reelIds = (page: Page) =>
  page
    .locator('[data-reel-list] [data-tile]')
    .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.id));

/**
 * JPEGs with real structure, for specs that run the real curation engine, which
 * drops flat or blurry frames: a mid-tone gradient plus hard-edged shapes drawn
 * from a seeded generator, so every run sees the same photos and no two collapse
 * into near-duplicates. Generated in the page; nothing is committed as a binary.
 */
export async function makeScenePhotos(page: Page, n: number): Promise<Pick[]> {
  const b64s = await page.evaluate(async (count) => {
    const out: string[] = [];
    for (let i = 0; i < count; i++) {
      let seed = (i + 1) * 7919;
      const rand = () => {
        seed = (seed + 0x6d2b79f5) >>> 0;
        let t = seed;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      const c = document.createElement('canvas');
      c.width = 480;
      c.height = 640;
      const g = c.getContext('2d');
      if (!g) throw new Error('no 2d context');
      const base = () => Math.round(90 + rand() * 60);
      const grad = g.createLinearGradient(0, 0, c.width, c.height);
      grad.addColorStop(0, `rgb(${base()} ${base()} ${base()})`);
      grad.addColorStop(1, `rgb(${base()} ${base()} ${base()})`);
      g.fillStyle = grad;
      g.fillRect(0, 0, c.width, c.height);
      for (let s = 0; s < 9; s++) {
        const cx = rand() * c.width;
        const cy = rand() * c.height;
        const r = 20 + rand() * 70;
        const tone = Math.round(rand() > 0.5 ? 195 + rand() * 20 : 45 + rand() * 20);
        g.fillStyle = `rgb(${tone} ${tone} ${tone})`;
        if (rand() > 0.5) {
          g.beginPath();
          g.arc(cx, cy, r, 0, Math.PI * 2);
          g.fill();
        } else g.fillRect(cx - r, cy - r, r * 2, r * 2);
      }
      const blob: Blob = await new Promise((r, rej) =>
        c.toBlob((b) => (b ? r(b) : rej(new Error('toBlob failed'))), 'image/jpeg', 0.85),
      );
      const buf = new Uint8Array(await blob.arrayBuffer());
      let s = '';
      buf.forEach((b) => (s += String.fromCharCode(b)));
      out.push(btoa(s));
    }
    return out;
  }, n);
  return b64s.map((b, i) => ({
    name: `IMG_${String(i + 1).padStart(3, '0')}.jpg`,
    mimeType: 'image/jpeg',
    buffer: Buffer.from(b, 'base64'),
  }));
}
