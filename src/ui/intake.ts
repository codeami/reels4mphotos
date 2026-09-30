import { isHeic } from './logic';
import type { Skipped } from './store';

export interface IntakeResult {
  files: File[];
  skipped: Skipped[];
}

/**
 * Decode-checks each pick. A file the browser cannot decode is reported and
 * skipped, never dropped silently. HEIC gets its own wording because desktop
 * Chrome cannot decode it (docs/scout-technical.md section 3).
 */
export async function intake(picked: File[]): Promise<IntakeResult> {
  const files: File[] = [];
  const skipped: Skipped[] = [];
  for (const file of picked) {
    try {
      const bmp = await createImageBitmap(file, { resizeWidth: 64 });
      bmp.close();
      files.push(file);
    } catch {
      skipped.push({
        name: file.name,
        reason: isHeic(file) ? 'HEIC not supported in this browser' : 'Could not read this image',
      });
    }
  }
  return { files, skipped };
}
