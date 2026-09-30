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
