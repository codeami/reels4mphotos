import { h } from '../dom';
import type { Engines, State } from '../store';

export interface TrackActions {
  onChoose: (id: string) => void;
  loadTrack: Engines['loadTrack'];
}

// One shared element so only one sample plays at a time.
let sample: HTMLAudioElement | null = null;
export function stopSample() { sample?.pause(); sample = null; }

export function trackScreen(s: State, tracks: Engines['tracks'], a: TrackActions): HTMLElement {
  const items = tracks.map((t, i) => {
    const active = s.trackId === t.id;
    const play = h('button', {
      class: 'mini mini-play', type: 'button', 'aria-label': `Preview ${t.title}`,
      onclick: async (e: Event) => {
        const btn = e.currentTarget as HTMLButtonElement;
        if (sample && btn.dataset.playing === '1') { stopSample(); btn.dataset.playing = '0'; btn.textContent = '▶ Sample'; return; }
        stopSample();
        document.querySelectorAll<HTMLButtonElement>('.mini-play').forEach((b) => { b.dataset.playing = '0'; b.textContent = '▶ Sample'; });
        btn.textContent = 'Loading…';
        try {
          const lt = await a.loadTrack(t.id);
          sample = new Audio(lt.audioUrl);
          sample.addEventListener('ended', () => { btn.dataset.playing = '0'; btn.textContent = '▶ Sample'; });
          await sample.play();
          btn.dataset.playing = '1'; btn.textContent = '❚❚ Stop';
        } catch {
          btn.textContent = 'Can’t play';
        }
      },
    }, '▶ Sample');
    return h('li', { class: `track${active ? ' is-active' : ''}` },
      h('label', { class: 'track-main' },
        h('input', { type: 'radio', name: 'track', value: t.id, checked: active, onchange: () => a.onChoose(t.id) }),
        h('span', { class: 'track-idx', 'aria-hidden': 'true' }, String(i + 1).padStart(2, '0')),
        h('span', { class: 'track-text' }, h('span', { class: 'track-title' }, t.title), h('span', { class: 'track-mood' }, t.mood)),
      ),
      play,
    );
  });
  return h('section', { class: 'screen', 'aria-labelledby': 'h-track' },
    h('p', { class: 'kicker' }, 'Soundtrack'),
    h('h2', { id: 'h-track', tabindex: '-1' }, 'Pick the beat'),
    h('p', { class: 'lede' }, 'Cuts land on this track’s beats. Tap Sample to hear it.'),
    h('ul', { class: 'tracks', role: 'presentation' }, ...items),
  );
}
