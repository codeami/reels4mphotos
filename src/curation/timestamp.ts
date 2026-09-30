import { must } from './must';
import { parse } from 'exifr/dist/lite.esm.mjs';
import type { TimeSource } from './types';

export interface TimeInput {
  /** EXIF DateTimeOriginal as epoch ms, or null when absent. */
  exifMs: number | null;
  lastModified: number;
  index: number;
}

export interface ResolvedTime {
  /** Epoch ms for `exif` / `lastModified`; the pick index for `pickOrder`. */
  timeMs: number;
  source: TimeSource;
}

/** File times that all sit within this window say nothing about when photos were taken. */
const UNINFORMATIVE_SPREAD_MS = 2000;

/**
 * DateTimeOriginal as epoch ms, or null when the file has none or cannot be
 * parsed. EXIF dates carry no zone, so exifr reads them as local wall-clock time.
 * The whole file is read into memory: HEIC keeps its Exif item deep in the file.
 */
export async function readExifDate(file: Blob): Promise<number | null> {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const tags = await parse(bytes, { exif: { pick: ['DateTimeOriginal'] }, tiff: false });
    const date: unknown = tags?.DateTimeOriginal;
    return date instanceof Date && Number.isFinite(date.getTime()) ? date.getTime() : null;
  } catch {
    return null;
  }
}

const isUsableFileTime = (ms: number) => Number.isFinite(ms) && ms > 0;

/**
 * Decide, per photo, where its time comes from: EXIF if present, else
 * `File.lastModified`, else the order the photos were picked in. When the
 * photos lacking EXIF all share (nearly) one lastModified, that value is a copy
 * time rather than a capture time, so those photos use pick order instead.
 */
export function resolveTimes(inputs: TimeInput[]): ResolvedTime[] {
  const fallbackTimes = inputs
    .filter((i) => i.exifMs === null && isUsableFileTime(i.lastModified))
    .map((i) => i.lastModified);
  const noExif = inputs.filter((i) => i.exifMs === null).length;
  const uninformative =
    noExif > 1 &&
    fallbackTimes.length > 0 &&
    Math.max(...fallbackTimes) - Math.min(...fallbackTimes) < UNINFORMATIVE_SPREAD_MS;

  return inputs.map((i): ResolvedTime => {
    if (i.exifMs !== null) return { timeMs: i.exifMs, source: 'exif' };
    if (isUsableFileTime(i.lastModified) && !uninformative)
      return { timeMs: i.lastModified, source: 'lastModified' };
    return { timeMs: i.index, source: 'pickOrder' };
  });
}

/** Offset that keeps a pick-order photo just after the stamped photo picked before it. */
const PICK_NEIGHBOUR_STEP = 1e-6;

/**
 * Map resolved times to 0..1 positions on the timeline. Stamped photos (EXIF or
 * lastModified) are placed by rank, so one stray timestamp cannot flatten the
 * rest. Pick-order photos sit beside the nearest stamped photo picked before
 * them (or after, if none); with no stamped photos at all they spread evenly.
 */
export function normaliseTimes(times: ResolvedTime[], total: number): number[] {
  const stamped = times
    .map((t, i) => ({ i, ms: t.timeMs, stamped: t.source !== 'pickOrder' }))
    .filter((x) => x.stamped)
    .sort((a, b) => a.ms - b.ms || a.i - b.i);
  const rank = new Map(
    stamped.map((x, r) => [x.i, stamped.length > 1 ? r / (stamped.length - 1) : 0]),
  );

  return times.map((t, i) => {
    const own = rank.get(i);
    if (own !== undefined) return own;
    if (stamped.length === 0) return total > 1 ? t.timeMs / (total - 1) : 0;
    const before = stamped
      .filter((x) => x.i < i)
      .reduce((best, x) => (x.i > best ? x.i : best), -1);
    if (before >= 0) return must(rank.get(before)) + (i - before) * PICK_NEIGHBOUR_STEP;
    const after = Math.min(...stamped.filter((x) => x.i > i).map((x) => x.i));
    return Math.max(0, must(rank.get(after)) - (after - i) * PICK_NEIGHBOUR_STEP);
  });
}
