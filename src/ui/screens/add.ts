import { h } from '../dom';
import { MAX_PHOTOS, MIN_PHOTOS } from '../logic';
import type { State } from '../store';

export interface AddActions {
  onFiles: (files: File[]) => void;
}

export function addScreen(s: State, a: AddActions): HTMLElement {
  const input = h('input', {
    type: 'file',
    // "image/*" alone. Adding "image/heic" makes Safari convert every pick to HEIC.
    accept: 'image/*',
    multiple: true,
    id: 'photo-input',
    class: 'visually-hidden',
    onchange: (e: Event) => {
      const el = e.target as HTMLInputElement;
      a.onFiles([...(el.files ?? [])]);
      el.value = '';
    },
  });
  return h(
    'section',
    { class: 'screen', 'aria-labelledby': 'h-add' },
    h('p', { class: 'kicker' }, 'Roll 01'),
    h('h2', { id: 'h-add', tabindex: '-1' }, 'Start with your best frames'),
    h(
      'p',
      { class: 'lede' },
      `Choose ${MIN_PHOTOS} to ${MAX_PHOTOS} photos. We pick about ten and cut them to a beat.`,
    ),
    h(
      'label',
      { class: 'drop', for: 'photo-input' },
      h(
        'span',
        { class: 'drop-frame', 'aria-hidden': 'true' },
        h('span', { class: 'drop-plus' }, '+'),
      ),
      h('span', { class: 'drop-title' }, s.busy ?? 'Add photos'),
      h('span', { class: 'drop-sub' }, `${MIN_PHOTOS}–${MAX_PHOTOS} photos · JPEG, PNG or HEIC`),
    ),
    input,
    s.notice && h('p', { class: 'notice', role: 'alert' }, s.notice),
    s.skipped.length > 0 &&
      h(
        'ul',
        { class: 'chips', 'aria-label': 'Skipped files' },
        ...s.skipped.map((k) =>
          h(
            'li',
            { class: 'chip chip-warn' },
            h('span', { class: 'chip-reason' }, k.reason),
            h('span', { class: 'chip-name' }, k.name),
          ),
        ),
      ),
  );
}
