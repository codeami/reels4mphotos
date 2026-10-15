import { DEFAULT_THRESHOLDS } from './score';
import type { PhotoScore } from './types';

export type TipKind = 'broll' | 'pacing' | 'order' | 'hook' | 'drop';

export interface Tip {
  id: string;
  kind: TipKind;
  text: string;
  /** The facts that fired this rule, so the card can show its working. */
  because: string[];
  /** Lower comes first. */
  priority: number;
}

/** Everything the rules read. All of it comes from scores curation already computed. */
export interface SetFacts {
  total: number;
  selected: number;
  portrait: number;
  landscape: number;
  square: number;
  blurry: number;
  dark: number;
  bright: number;
  duplicates: number;
  /** Photos whose time came from EXIF. Times from file dates or pick order say nothing about the shoot. */
  exifCount: number;
  spanMs: number | null;
  maxGapMs: number | null;
  /** Sharpness of the first photo in the reel, when it was measured. */
  openerSharpness: number | null;
}

export interface SetAdvice {
  facts: SetFacts;
  summary: string;
  strengths: string[];
  tips: Tip[];
}

export const MAX_TIPS = 3;
const MIN_USABLE = 5;
const ONE_SHAPE_SHARE = 0.7;
const MIN_SHAPED = 5;
const MIN_EXIF = 5;
const GAP_MS = 3 * 3_600_000;
const ONE_MOMENT_MS = 30 * 60_000;
const SPREAD_MS = 3_600_000;
const DUPLICATES_MIN = 3;
const WEAK_MIN = 3;
const SOFT_OPENER = DEFAULT_THRESHOLDS.blurVariance * 1.5;
const PORTRAIT_BELOW = 0.9;
const LANDSCAPE_ABOVE = 1.1;

const count = (scores: PhotoScore[], reason: PhotoScore['dropReason']) =>
  scores.filter((s) => s.dropReason === reason).length;

/** The plain facts about a set, from the scores of every photo that was picked. */
export function analyseSet(scores: readonly PhotoScore[]): SetFacts {
  const decoded = scores.filter((s) => s.dropReason !== 'decode-failed');
  const shape = (s: PhotoScore) => (s.width && s.height ? s.width / s.height : null);
  const ratios = decoded.flatMap((s) => shape(s) ?? []);
  const times = decoded
    .filter((s) => s.timeSource === 'exif')
    .map((s) => s.timeMs)
    .sort((a, b) => a - b);
  const gaps = times.slice(1).map((t, i) => t - (times[i] ?? t));
  const opener = decoded
    .filter((s) => s.selected)
    .sort((a, b) => a.timeMs - b.timeMs || a.index - b.index)[0];
  return {
    total: decoded.length,
    selected: decoded.filter((s) => s.selected).length,
    portrait: ratios.filter((r) => r < PORTRAIT_BELOW).length,
    landscape: ratios.filter((r) => r > LANDSCAPE_ABOVE).length,
    square: ratios.filter((r) => r >= PORTRAIT_BELOW && r <= LANDSCAPE_ABOVE).length,
    blurry: count(decoded, 'blurry'),
    dark: count(decoded, 'underexposed'),
    bright: count(decoded, 'overexposed'),
    duplicates: count(decoded, 'near-duplicate'),
    exifCount: times.length,
    spanMs: times.length >= 2 ? (times[times.length - 1] ?? 0) - (times[0] ?? 0) : null,
    maxGapMs: gaps.length > 0 ? Math.max(...gaps) : null,
    openerSharpness: opener?.sharpness ?? null,
  };
}

/** "20 minutes", "1 hour", "5 hours". */
export function formatSpan(ms: number): string {
  if (ms < 3_600_000) return `${Math.max(1, Math.round(ms / 60_000))} minutes`;
  const hours = Math.round(ms / 3_600_000);
  return hours === 1 ? '1 hour' : `${hours} hours`;
}

type Rule = (f: SetFacts) => Tip | null;

// The fixed rule list. Order here does not matter: tips are sorted by priority.
const RULES: readonly Rule[] = [
  (f) =>
    f.selected < MIN_USABLE
      ? {
          id: 'too-few',
          kind: 'broll',
          text: `Only ${f.selected} photos made the cut. Add a few more.`,
          because: ['selected_under_5'],
          priority: 1,
        }
      : null,
  (f) =>
    f.openerSharpness !== null && f.openerSharpness < SOFT_OPENER
      ? {
          id: 'soft-opener',
          kind: 'hook',
          text: 'Your first shot is a little soft. Open with a sharper one.',
          because: ['opener_soft'],
          priority: 2,
        }
      : null,
  (f) => {
    const shaped = f.portrait + f.landscape + f.square;
    if (shaped < MIN_SHAPED) return null;
    if (f.portrait / shaped >= ONE_SHAPE_SHARE)
      return {
        id: 'mostly-portrait',
        kind: 'broll',
        text: 'Mostly portrait shots. Add a wide landscape shot of the place as B-roll.',
        because: ['portrait_share_70'],
        priority: 3,
      };
    if (f.landscape / shaped >= ONE_SHAPE_SHARE)
      return {
        id: 'mostly-landscape',
        kind: 'broll',
        text: 'Mostly landscape shots. Add a close-up or a portrait shot as B-roll.',
        because: ['landscape_share_70'],
        priority: 3,
      };
    return null;
  },
  (f) =>
    f.exifCount >= MIN_EXIF && f.maxGapMs !== null && f.maxGapMs >= GAP_MS
      ? {
          id: 'time-gap',
          kind: 'order',
          text: `Your set jumps ${formatSpan(f.maxGapMs)}. Add a shot from in between.`,
          because: ['gap_over_3h'],
          priority: 4,
        }
      : null,
  (f) =>
    f.exifCount >= MIN_EXIF && f.spanMs !== null && f.spanMs < ONE_MOMENT_MS
      ? {
          id: 'one-moment',
          kind: 'broll',
          text: 'All shots are from one moment. Add a wide shot or a detail shot as B-roll.',
          because: ['span_under_30min'],
          priority: 5,
        }
      : null,
  (f) => {
    const weak = f.blurry + f.dark + f.bright;
    return weak >= WEAK_MIN
      ? {
          id: 'weak-shots',
          kind: 'drop',
          text: `${weak} photos are soft, dark or bright. Retake them if you can.`,
          because: ['weak_3_or_more'],
          priority: 6,
        }
      : null;
  },
  (f) =>
    f.duplicates >= DUPLICATES_MIN
      ? {
          id: 'look-alikes',
          kind: 'drop',
          text: `${f.duplicates} photos look alike. Only one of each is used.`,
          because: ['duplicates_3_or_more'],
          priority: 7,
        }
      : null,
];

function strengthsOf(f: SetFacts, tips: readonly Tip[]): string[] {
  const shaped = f.portrait + f.landscape + f.square;
  const mixed =
    shaped >= MIN_SHAPED &&
    f.portrait / shaped < ONE_SHAPE_SHARE &&
    f.landscape / shaped < ONE_SHAPE_SHARE &&
    f.portrait > 0 &&
    f.landscape > 0;
  const spread =
    f.spanMs !== null && f.spanMs >= SPREAD_MS && !tips.some((t) => t.id === 'time-gap');
  return [
    f.selected >= MIN_USABLE ? `${f.selected} sharp, well-lit shots to work with.` : null,
    mixed ? 'A good mix of portrait and landscape.' : null,
    spread && f.spanMs !== null ? `Spread over ${formatSpan(f.spanMs)}.` : null,
  ].flatMap((s) => s ?? []);
}

/** A short plain-English read of the set: what is strong, and up to three things to fix or add. */
export function adviceFor(facts: SetFacts): SetAdvice {
  const all = RULES.flatMap((rule) => rule(facts) ?? []).sort((a, b) => a.priority - b.priority);
  return {
    facts,
    summary: `${facts.total} photos, ${facts.selected} in your reel.`,
    strengths: strengthsOf(facts, all),
    tips: all.slice(0, MAX_TIPS),
  };
}
