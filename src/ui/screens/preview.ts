import { h } from '../dom';
import { cutsOnBeat, formatSeconds, shotIndexAt } from '../logic';
import { Player } from '../player';
import type { BeatMap, ReelPlan } from '../seams/types';

export interface PreviewHandle {
  el: HTMLElement;
  destroy: () => void;
}

const PREVIEW_W = 540;
const PREVIEW_H = 960;

export function previewScreen(
  plan: ReelPlan,
  bitmaps: Map<string, ImageBitmap>,
  audioUrl: string,
  beatmap: BeatMap,
): PreviewHandle {
  const canvas = h('canvas', {
    class: 'reel-canvas',
    width: PREVIEW_W,
    height: PREVIEW_H,
    'aria-label': 'Reel preview',
    role: 'img',
  });
  const playhead = h('div', { class: 'playhead', 'aria-hidden': 'true' });
  const counter = h(
    'span',
    { class: 'frame-counter' },
    `SHOT 01/${String(plan.shots.length).padStart(2, '0')}`,
  );
  const clock = h('span', { class: 'clock' }, `0.0s / ${formatSeconds(plan.totalMs)}`);
  const playBtn = h(
    'button',
    { class: 'btn btn-primary play', type: 'button', 'aria-label': 'Play preview' },
    '▶ Play',
  );
  const beatFlash = h('span', { class: 'beat-dot', 'aria-hidden': 'true' });

  const audio = new Audio(audioUrl);
  audio.preload = 'auto';
  let lastBeat = -1;
  const player = new Player(canvas, plan, bitmaps, audio, (ms, playing) => {
    playhead.style.left = `${(ms / plan.totalMs) * 100}%`;
    clock.textContent = `${formatSeconds(ms)} / ${formatSeconds(plan.totalMs)}`;
    counter.textContent = `SHOT ${String(shotIndexAt(plan, ms) + 1).padStart(2, '0')}/${String(plan.shots.length).padStart(2, '0')}`;
    const beat = beatmap.beatsMs.filter((b) => b <= ms).length;
    if (playing && beat !== lastBeat) {
      beatFlash.classList.remove('on');
      void beatFlash.offsetWidth;
      beatFlash.classList.add('on');
    }
    lastBeat = beat;
    playBtn.textContent = playing ? '❚❚ Pause' : '▶ Play';
    playBtn.setAttribute('aria-label', playing ? 'Pause preview' : 'Play preview');
  });
  playBtn.addEventListener('click', () => (player.isPlaying ? player.pause() : void player.play()));

  const ticks = beatmap.beatsMs
    .filter((b) => b <= plan.totalMs)
    .map((b) => h('i', { class: 'tick', style: { left: `${(b / plan.totalMs) * 100}%` } }));
  const cutMarks = plan.shots
    .slice(1)
    .map((s) => h('i', { class: 'cut', style: { left: `${(s.startMs / plan.totalMs) * 100}%` } }));
  const scrub = h('input', {
    class: 'scrub',
    type: 'range',
    min: '0',
    max: String(plan.totalMs),
    value: '0',
    step: '10',
    'aria-label': 'Scrub preview',
    oninput: (e: Event) => player.seek(Number((e.target as HTMLInputElement).value)),
  });
  const { onBeat, cuts } = cutsOnBeat(plan, beatmap);

  const el = h(
    'section',
    { class: 'screen screen-preview', 'aria-labelledby': 'h-preview' },
    h('p', { class: 'kicker' }, 'Screening'),
    h('h2', { id: 'h-preview', tabindex: '-1' }, 'Watch it cut'),
    h(
      'div',
      { class: 'frame' },
      h('div', { class: 'frame-edge', 'aria-hidden': 'true' }),
      canvas,
      h('div', { class: 'frame-hud' }, counter, beatFlash),
    ),
    h('div', { class: 'play-row' }, playBtn),
    h(
      'div',
      { class: 'timeline' },
      h('div', { class: 'track-bar', 'aria-hidden': 'true' }, ...ticks, ...cutMarks, playhead),
      scrub,
      h(
        'div',
        { class: 'timeline-meta' },
        clock,
        h('span', { class: 'sync', 'data-testid': 'beat-sync' }, `${onBeat}/${cuts} cuts on beat`),
      ),
    ),
    h(
      'p',
      { class: 'lede small' },
      `Tick marks are beats; bright marks are cuts. ${beatmap.bpm} BPM.`,
    ),
  );
  return { el, destroy: () => player.destroy() };
}
