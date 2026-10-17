import { DEFAULT_MIN_PHOTOS, LOOKS, LOOK_ORDER, minPhotosOf } from '../../looks';
import { h } from '../dom';
import type { LookId } from '../seams/types';

export interface LookActions {
  onLook: (id: LookId) => void;
}

// The line under a chip's name: what it works with, in plain words.
function tagFor(id: LookId, photos: number): string | null {
  const min = minPhotosOf(LOOKS[id]);
  if (photos < min) return `needs ${min} photos`;
  return min === 1 ? 'works with one photo' : null;
}

/**
 * One chip per look, under the reel: tap one and the preview above is cut and drawn that way.
 * `photos` is how many different photos the reel is cut from; a look that needs more is greyed out
 * and says how many.
 */
export function looksRow(selected: LookId, a: LookActions, photos: number): HTMLElement {
  const fewest = Math.min(...LOOK_ORDER.map((id) => minPhotosOf(LOOKS[id])));
  return h(
    'section',
    { class: 'looks', 'aria-labelledby': 'h-looks', 'data-testid': 'looks' },
    h('h3', { id: 'h-looks' }, 'Look'),
    h(
      'div',
      { class: 'look-row', role: 'group', 'aria-labelledby': 'h-looks' },
      ...LOOK_ORDER.map((id) => {
        const tag = tagFor(id, photos);
        return h(
          'button',
          {
            class: `look-chip${id === selected ? ' is-on' : ''}`,
            type: 'button',
            'aria-pressed': String(id === selected),
            'data-look': id,
            'data-testid': `look-${id}`,
            disabled: photos < minPhotosOf(LOOKS[id]),
            onclick: () => a.onLook(id),
          },
          h('span', { class: 'look-name' }, LOOKS[id].name),
          tag && h('span', { class: 'look-tag' }, tag),
        );
      }),
    ),
    h('p', { class: 'lede small', 'data-testid': 'look-blurb' }, LOOKS[selected].blurb),
    photos < DEFAULT_MIN_PHOTOS &&
      photos >= fewest &&
      h(
        'p',
        { class: 'lede small', 'data-testid': 'few-photos-note' },
        `With ${photos} ${photos === 1 ? 'photo' : 'photos'}, only the looks marked "works with one photo" can be used.`,
      ),
  );
}
