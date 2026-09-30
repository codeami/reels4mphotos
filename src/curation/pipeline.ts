import { decodePhoto, type Decoded } from './decode';
import { collapseDuplicates } from './dedupe';
import { dHash } from './dhash';
import { analyzeExposure } from './exposure';
import { buildPlan } from './plan';
import { classify, mergeThresholds, qualityScore } from './score';
import { selectSpread } from './select';
import { laplacianVariance, sharpnessScore } from './sharpness';
import { normaliseTimes, readExifDate, resolveTimes } from './timestamp';
import type { CurateOptions, CurateResult, PhotoScore, TimelineSummary } from './types';

export interface PipelineDeps {
  decode?: (file: File, maxSize: number) => Promise<Decoded>;
  readExif?: (file: File) => Promise<number | null>;
}

export type CurateOutcome = Omit<CurateResult, 'ranIn'>;

const DEFAULT_TARGET_COUNT = 10;
const DEFAULT_DURATION_MS = 20_000;
const DEFAULT_WORKING_SIZE = 512;

/** What survives from a photo once its pixels have been measured and let go. */
interface Features {
  width: number;
  height: number;
  sharpness: number;
  exposure: NonNullable<PhotoScore['exposure']>;
  quality: number;
  dHash: string;
}

function measure({ pixels, original }: Decoded): Features {
  const sharpness = laplacianVariance(pixels);
  const exposure = analyzeExposure(pixels);
  return {
    width: original.width,
    height: original.height,
    sharpness,
    exposure: {
      meanLuma: exposure.meanLuma,
      shadowClip: exposure.shadowClip,
      highlightClip: exposure.highlightClip,
      verdict: exposure.verdict,
    },
    quality: qualityScore(sharpnessScore(sharpness), exposure.score),
    dHash: dHash(pixels),
  };
}

function summarise(scores: PhotoScore[]): TimelineSummary {
  const count = (source: PhotoScore['timeSource']) => scores.filter((s) => s.timeSource === source).length;
  const summary = { exif: count('exif'), lastModified: count('lastModified'), pickOrder: count('pickOrder') };
  const used = (Object.keys(summary) as (keyof typeof summary)[]).filter((k) => summary[k] > 0);
  return { source: used.length === 1 ? used[0]! : used.length === 0 ? 'pickOrder' : 'mixed', ...summary };
}

/**
 * The whole curation pipeline. Photos are decoded one at a time and only their
 * measurements are kept, so memory stays bounded and nothing derived from a
 * photo outlives this call except numbers and a 64-bit hash.
 */
export async function runCuration(files: File[], opts: CurateOptions, deps: PipelineDeps = {}): Promise<CurateOutcome> {
  const targetCount = Number.isFinite(opts.targetCount) ? Math.max(0, Math.floor(opts.targetCount!)) : DEFAULT_TARGET_COUNT;
  const workingSize = opts.workingSize ?? DEFAULT_WORKING_SIZE;
  const thresholds = mergeThresholds(opts.thresholds);
  const decode = deps.decode ?? ((file, size) => decodePhoto(file, size));
  const readExif = deps.readExif ?? readExifDate;
  if (opts.photoIds && opts.photoIds.length !== files.length) {
    throw new Error('photoIds must have one per file.');
  }
  const ids = files.map((_, i) => opts.photoIds?.[i] ?? `photo-${i}`);
  if (new Set(ids).size !== ids.length) throw new Error('photoIds must be unique.');

  const features: (Features | null)[] = [];
  const decodeErrors: (string | undefined)[] = [];
  const exifMs: (number | null)[] = [];
  for (const [i, file] of files.entries()) {
    exifMs.push(await readExif(file));
    try {
      features.push(measure(await decode(file, workingSize)));
      decodeErrors.push(undefined);
    } catch (err) {
      features.push(null);
      decodeErrors.push(err instanceof Error ? err.message : String(err));
    }
    opts.onProgress?.({ stage: 'analysing', done: i + 1, total: files.length, photoId: ids[i] });
  }
  opts.onProgress?.({ stage: 'selecting', done: files.length, total: files.length });

  const times = resolveTimes(files.map((f, i) => ({ exifMs: exifMs[i]!, lastModified: f.lastModified, index: i })));
  const t = normaliseTimes(times, files.length);

  const scores: PhotoScore[] = files.map((_, i) => {
    const f = features[i];
    return {
      photoId: ids[i]!,
      index: i,
      selected: false,
      dropReason: f ? null : 'decode-failed',
      ...(f
        ? { width: f.width, height: f.height, sharpness: f.sharpness, exposure: f.exposure, quality: f.quality, dHash: f.dHash }
        : { decodeError: decodeErrors[i] }),
      timeMs: times[i]!.timeMs,
      timeSource: times[i]!.source,
    };
  });
  const byId = new Map(scores.map((s) => [s.photoId, s]));

  const survivors: PhotoScore[] = [];
  for (const s of scores) {
    if (!s.dropReason) {
      s.dropReason = classify({ sharpness: s.sharpness!, exposure: s.exposure! }, thresholds);
      if (!s.dropReason) survivors.push(s);
    }
  }

  const { kept, duplicateOf } = collapseDuplicates(
    survivors.map((s) => ({ id: s.photoId, quality: s.quality!, hash: s.dHash! })),
    thresholds.duplicateHamming,
  );
  for (const [dropped, keeper] of duplicateOf) {
    const s = byId.get(dropped)!;
    s.dropReason = 'near-duplicate';
    s.duplicateOf = keeper;
  }

  const chosenIds = new Set(
    selectSpread(
      kept.map((id) => ({ id, quality: byId.get(id)!.quality!, t: t[byId.get(id)!.index]! })),
      targetCount,
      thresholds.spreadWeight,
    ),
  );
  for (const id of kept) {
    const s = byId.get(id)!;
    if (chosenIds.has(id)) s.selected = true;
    else s.dropReason = 'not-selected';
  }

  const chosen = scores
    .filter((s) => s.selected)
    .sort((a, b) => t[a.index]! - t[b.index]! || a.index - b.index);
  const plan = buildPlan(
    chosen.map((s) => ({ photoId: s.photoId, width: s.width, height: s.height })),
    opts.beatmap,
    opts.targetDurationMs ?? DEFAULT_DURATION_MS,
  );

  opts.onProgress?.({ stage: 'done', done: files.length, total: files.length });
  return { plan, scores, timeline: summarise(scores) };
}
