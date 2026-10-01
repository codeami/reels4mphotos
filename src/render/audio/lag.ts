// How much later `test` is than `reference`, in milliseconds (negative: earlier), found by
// cross-correlating the two over +-maxLagMs. Both are mono at `sampleRate`. Used to verify audio
// against video timing in pure JS, where ffmpeg is not an option.
export function estimateLagMs(
  reference: Float32Array,
  test: Float32Array,
  sampleRate: number,
  maxLagMs = 150,
): number {
  // Work at about 6 kHz: a few samples of resolution cost nothing, the correlation gets 64x cheaper.
  const step = Math.max(1, Math.floor(sampleRate / 6000));
  const ref = decimate(reference, step);
  const tst = decimate(test, step);
  const rate = sampleRate / step;
  const maxLag = Math.round((maxLagMs / 1000) * rate);

  let bestLag = 0;
  let bestScore = -Infinity;
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    const from = Math.max(0, -lag);
    const to = Math.min(ref.length, tst.length - lag);
    let score = 0;
    for (let i = from; i < to; i++) score += (ref[i] ?? 0) * (tst[i + lag] ?? 0);
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }
  return (bestLag / rate) * 1000;
}

function decimate(input: Float32Array, step: number): Float32Array {
  if (step === 1) return input;
  const out = new Float32Array(Math.floor(input.length / step));
  for (let i = 0; i < out.length; i++) {
    let sum = 0;
    for (let k = 0; k < step; k++) sum += input[i * step + k] ?? 0;
    out[i] = sum / step;
  }
  return out;
}
