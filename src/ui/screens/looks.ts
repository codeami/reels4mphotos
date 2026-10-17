import { LOOKS, LOOK_ORDER } from '../../looks';
import { h } from '../dom';
import type { LookId } from '../seams/types';

export interface LookActions {
  onLook: (id: LookId) => void;
}

/** One chip per look, under the reel: tap one and the preview above is cut and drawn that way. */
export function looksRow(selected: LookId, a: LookActions): HTMLElement {
  return h(
    'section',
    { class: 'looks', 'aria-labelledby': 'h-looks', 'data-testid': 'looks' },
    h('h3', { id: 'h-looks' }, 'Look'),
    h(
      'div',
      { class: 'look-row', role: 'group', 'aria-labelledby': 'h-looks' },
      ...LOOK_ORDER.map((id) =>
        h(
          'button',
          {
            class: `look-chip${id === selected ? ' is-on' : ''}`,
            type: 'button',
            'aria-pressed': String(id === selected),
            'data-look': id,
            'data-testid': `look-${id}`,
            onclick: () => a.onLook(id),
          },
          LOOKS[id].name,
        ),
      ),
    ),
    h('p', { class: 'lede small', 'data-testid': 'look-blurb' }, LOOKS[selected].blurb),
  );
}
