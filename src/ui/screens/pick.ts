import { h } from '../dom';
import { MIN_PHOTOS } from '../logic';
import type { Photo, State } from '../store';

export interface PickActions {
  onToggle: (id: string) => void;
  onMove: (from: number, to: number) => void;
  onBack: () => void;
}

const pct = (n: number) => `${Math.round(n * 100)}`;

function thumb(p: Photo) {
  return h('img', { src: p.url, alt: '', draggable: 'false', loading: 'lazy', decoding: 'async' });
}

export function pickScreen(s: State, a: PickActions): HTMLElement {
  const byId = new Map(s.photos.map((p) => [p.id, p]));
  const inReel = s.order.map((id) => byId.get(id)).filter((p): p is Photo => !!p);
  const out = s.photos.filter((p) => !s.order.includes(p.id));

  const tiles = inReel.map((p, i) => {
    const n = String(i + 1).padStart(2, '0');
    const last = i === inReel.length - 1;
    return h(
      'li',
      { class: 'tile', 'data-tile': '', 'data-id': p.id },
      h(
        'div',
        { class: 'tile-img' },
        thumb(p),
        h('span', { class: 'tile-num', 'aria-hidden': 'true' }, n),
        h(
          'button',
          {
            class: 'tile-handle',
            type: 'button',
            'data-handle': '',
            'data-for': p.id,
            'aria-label': `Drag photo ${i + 1} to reorder`,
            onkeydown: (e: Event) => {
              const k = (e as KeyboardEvent).key;
              if (k === 'ArrowUp' || k === 'ArrowLeft') {
                e.preventDefault();
                if (i > 0) a.onMove(i, i - 1);
              }
              if (k === 'ArrowDown' || k === 'ArrowRight') {
                e.preventDefault();
                if (!last) a.onMove(i, i + 1);
              }
            },
          },
          h('span', { 'aria-hidden': 'true' }, '⠿'),
        ),
      ),
      h(
        'div',
        { class: 'tile-bar' },
        h(
          'button',
          {
            class: 'mini',
            type: 'button',
            'data-key': `up-${p.id}`,
            disabled: i === 0,
            'aria-label': `Move photo ${i + 1} earlier`,
            onclick: () => a.onMove(i, i - 1),
          },
          '←',
        ),
        h(
          'button',
          {
            class: 'mini mini-out',
            type: 'button',
            'aria-label': `Remove photo ${i + 1} from the reel`,
            onclick: () => a.onToggle(p.id),
          },
          'Remove',
        ),
        h(
          'button',
          {
            class: 'mini',
            type: 'button',
            'data-key': `down-${p.id}`,
            disabled: last,
            'aria-label': `Move photo ${i + 1} later`,
            onclick: () => a.onMove(i, i + 1),
          },
          '→',
        ),
      ),
    );
  });

  const list = h(
    'ol',
    { class: 'grid', 'data-reel-list': '', 'aria-label': 'Photos in your reel, in play order' },
    ...tiles,
  );

  return h(
    'section',
    { class: 'screen', 'aria-labelledby': 'h-pick' },
    h('p', { class: 'kicker' }, 'Contact sheet'),
    h('h2', { id: 'h-pick', tabindex: '-1' }, `${inReel.length} in your reel`),
    h(
      'p',
      { class: 'lede' },
      'Drag the grip to reorder, or use the arrows. Remove anything you don’t want.',
    ),
    inReel.length < MIN_PHOTOS &&
      h('p', { class: 'notice', role: 'status' }, `Keep at least ${MIN_PHOTOS} photos for a reel.`),
    list,
    out.length > 0 &&
      h(
        'div',
        { class: 'leftout' },
        h('h3', {}, `Left out · ${out.length}`),
        h('p', { class: 'lede small' }, 'Tap a photo to put it back in.'),
        h(
          'ul',
          { class: 'grid grid-out' },
          ...out.map((p) =>
            h(
              'li',
              { class: 'tile tile-out' },
              h(
                'button',
                {
                  class: 'tile-img tile-add',
                  type: 'button',
                  'aria-label': `Add back ${p.file.name}. Left out because: ${p.score.reason ?? 'ranked lower'}`,
                  onclick: () => a.onToggle(p.id),
                },
                thumb(p),
                h('span', { class: 'tile-plus', 'aria-hidden': 'true' }, '+'),
              ),
              h('p', { class: 'why' }, p.score.reason ?? 'Ranked lower'),
              h('p', { class: 'score' }, `score ${pct(p.score.score)}`),
            ),
          ),
        ),
      ),
  );
}
