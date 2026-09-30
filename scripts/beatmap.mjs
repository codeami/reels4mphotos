#!/usr/bin/env node
// Authoring-time tool: audio file -> beat map JSON. Never shipped to the browser.
//
//   node scripts/beatmap.mjs <audio-file> --track-id <id> [--out <beatmap.json>]
//
// Onset strength (log-band spectral flux) -> tempo (autocorrelation with a
// log-normal prior) -> beats (Ellis 2007 dynamic programming). Pure arithmetic
// on the decoded samples, so the same input always gives the same output.
import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import decode from 'audio-decode';

const FFT_SIZE = 2048;
const HOP_PER_SECOND = 100; // onset frames per second
const BANDS = 40;
const BAND_MIN_HZ = 30;
const BAND_MAX_HZ = 8000;
const BPM_MIN = 60;
const BPM_MAX = 200;
const BPM_PRIOR_CENTRE = 120;
const BPM_PRIOR_SIGMA_OCTAVES = 1.4;
const DP_TIGHTNESS = 100;

/** In-place radix-2 FFT over parallel real/imag arrays. */
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        [cr, ci] = [cr * wr - ci * wi, cr * wi + ci * wr];
      }
    }
  }
}

function toMono(channels) {
  const out = new Float32Array(channels[0].length);
  for (const ch of channels) for (let i = 0; i < out.length; i++) out[i] += ch[i] / channels.length;
  return out;
}

/** Positive log-band spectral flux, one value per hop. */
export function onsetStrength(samples, sampleRate) {
  const hop = Math.round(sampleRate / HOP_PER_SECOND);
  const frames = Math.max(0, Math.floor((samples.length - FFT_SIZE) / hop) + 1);
  const window = Float64Array.from(
    { length: FFT_SIZE },
    (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / FFT_SIZE),
  );
  const edges = Array.from({ length: BANDS + 1 }, (_, b) =>
    Math.round((BAND_MIN_HZ * (BAND_MAX_HZ / BAND_MIN_HZ) ** (b / BANDS) * FFT_SIZE) / sampleRate),
  );
  const re = new Float64Array(FFT_SIZE);
  const im = new Float64Array(FFT_SIZE);
  let prev = new Float64Array(BANDS);
  const env = new Float64Array(frames);
  for (let f = 0; f < frames; f++) {
    for (let i = 0; i < FFT_SIZE; i++) {
      re[i] = samples[f * hop + i] * window[i];
      im[i] = 0;
    }
    fft(re, im);
    const cur = new Float64Array(BANDS);
    for (let b = 0; b < BANDS; b++) {
      const lo = edges[b];
      const hi = Math.max(edges[b + 1], lo + 1);
      let sum = 0;
      for (let k = lo; k < hi; k++) sum += Math.hypot(re[k], im[k]);
      cur[b] = Math.log1p(100 * (sum / (hi - lo)));
    }
    if (f > 0) for (let b = 0; b < BANDS; b++) env[f] += Math.max(0, cur[b] - prev[b]);
    prev = cur;
  }
  return { env, frameSeconds: hop / sampleRate };
}

function normalise(env) {
  const mean = env.reduce((a, b) => a + b, 0) / env.length;
  const sd = Math.sqrt(env.reduce((a, b) => a + (b - mean) ** 2, 0) / env.length) || 1;
  return env.map((v) => (v - mean) / sd);
}

/** Beat period in frames: strongest autocorrelation lag under a tempo prior. */
export function estimatePeriod(env, frameSeconds) {
  const minLag = Math.floor(60 / BPM_MAX / frameSeconds);
  const maxLag = Math.ceil(60 / BPM_MIN / frameSeconds);
  let best = { lag: minLag, score: -Infinity };
  for (let lag = minLag; lag <= maxLag; lag++) {
    let acc = 0;
    for (let i = lag; i < env.length; i++) acc += env[i] * env[i - lag];
    const bpm = 60 / (lag * frameSeconds);
    const octaves = Math.log2(bpm / BPM_PRIOR_CENTRE);
    const score =
      (acc / (env.length - lag)) * Math.exp(-0.5 * (octaves / BPM_PRIOR_SIGMA_OCTAVES) ** 2);
    if (score > best.score) best = { lag, score };
  }
  // Parabolic refinement so the period is not quantised to whole frames.
  const at = (lag) => {
    let acc = 0;
    for (let i = lag; i < env.length; i++) acc += env[i] * env[i - lag];
    return acc / (env.length - lag);
  };
  const [a, b, c] = [at(best.lag - 1), at(best.lag), at(best.lag + 1)];
  const denom = a - 2 * b + c;
  return best.lag + (denom < 0 ? (0.5 * (a - c)) / denom : 0);
}

/** Ellis dynamic-programming beat tracker; returns beat frame indices. */
export function trackBeats(env, period) {
  const n = env.length;
  const score = new Float64Array(n);
  const back = new Int32Array(n).fill(-1);
  for (let t = 0; t < n; t++) {
    let bestPrev = -1;
    let best = 0;
    const lo = Math.max(0, Math.floor(t - 2 * period));
    const hi = Math.floor(t - period / 2);
    for (let p = lo; p <= hi; p++) {
      const penalty = -DP_TIGHTNESS * Math.log((t - p) / period) ** 2;
      if (score[p] + penalty > best) {
        best = score[p] + penalty;
        bestPrev = p;
      }
    }
    score[t] = env[t] + best;
    back[t] = bestPrev;
  }
  // Start from the best-scoring frame in the last beat period so the chain covers the whole track.
  let end = n - 1;
  for (let t = Math.max(0, Math.floor(n - period)); t < n; t++) if (score[t] > score[end]) end = t;
  const beats = [];
  for (let t = end; t >= 0; t = back[t]) {
    beats.push(t);
    if (back[t] < 0) break;
  }
  return beats.reverse();
}

/** Decoded channels -> beat map in the shared-seams shape. */
export function analyse({ channels, sampleRate }, trackId) {
  const { env, frameSeconds } = onsetStrength(toMono(channels), sampleRate);
  const norm = normalise(env);
  const period = estimatePeriod(norm, frameSeconds);
  const beatsMs = trackBeats(norm, period).map((f) => Math.round(f * frameSeconds * 1000));
  const gaps = beatsMs
    .slice(1)
    .map((ms, i) => ms - beatsMs[i])
    .sort((a, b) => a - b);
  const medianGap = gaps[Math.floor(gaps.length / 2)];
  return {
    version: 1,
    trackId,
    durationMs: Math.round((channels[0].length / sampleRate) * 1000),
    bpm: Math.round((60000 / medianGap) * 10) / 10,
    beatsMs,
  };
}

async function main(argv) {
  const args = argv.slice(2);
  const flag = (name) => {
    const i = args.indexOf(name);
    return i === -1 ? undefined : args[i + 1];
  };
  const file = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
  const trackId = flag('--track-id') ?? basename(dirname(file ?? ''));
  if (!file || !trackId) {
    console.error(
      'usage: node scripts/beatmap.mjs <audio-file> --track-id <id> [--out <beatmap.json>]',
    );
    process.exit(2);
  }
  const audio = await decode(await readFile(file));
  const map = analyse({ channels: audio.channelData, sampleRate: audio.sampleRate }, trackId);
  const out = flag('--out') ?? join(dirname(file), 'beatmap.json');
  await writeFile(out, `${JSON.stringify(map)}\n`);
  console.log(`${out}: ${map.beatsMs.length} beats, ${map.bpm} bpm, ${map.durationMs} ms`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main(process.argv);
