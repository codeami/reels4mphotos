import { h } from '../dom';
import { LENGTHS } from '../logic';
import type { State } from '../store';

export interface CustomizeActions {
  onCustomize: (step: 'pick' | 'track') => void;
  onLength: (ms: number) => void;
}

function action(label: string, value: string, onclick: () => void, testid: string) {
  return h(
    'button',
    { class: 'customize-btn', type: 'button', 'data-testid': testid, onclick },
    h('span', { class: 'customize-label' }, label),
    h('span', { class: 'customize-value' }, value),
  );
}

/**
 * Everything the user may change about the reel that is already playing. None of it is required:
 * the preview above is a finished reel on the default track.
 */
export function customizeBlock(s: State, a: CustomizeActions): HTMLElement {
  return h(
    'section',
    { class: 'customize', 'aria-labelledby': 'h-customize' },
    h('h3', { id: 'h-customize' }, 'Customize'),
    h(
      'div',
      { class: 'customize-actions' },
      action('Music', s.track?.title ?? '', () => a.onCustomize('track'), 'customize-music'),
      action(
        'Photos',
        `${s.order.length} in reel`,
        () => a.onCustomize('pick'),
        'customize-photos',
      ),
    ),
    h(
      'fieldset',
      { class: 'length' },
      h('legend', {}, 'Length'),
      ...LENGTHS.map((l) =>
        h(
          'label',
          { class: 'length-opt' },
          h('input', {
            type: 'radio',
            name: 'length',
            value: l.id,
            checked: l.ms === s.lengthMs,
            onchange: () => a.onLength(l.ms),
          }),
          h('span', { class: 'length-label' }, l.label),
          h('span', { class: 'length-sub' }, `${l.ms / 1000} s`),
        ),
      ),
    ),
  );
}
