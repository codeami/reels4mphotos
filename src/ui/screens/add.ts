import { h } from '../dom';
import { LOOKS, LOOK_ORDER, minPhotosOf } from '../../looks';
import { FEWEST_PHOTOS, MAX_PHOTOS, MIN_PHOTOS } from '../logic';
import type { Skipped, State } from '../store';

export interface AddActions {
  onFiles: (files: File[]) => void;
}

/** Files that could not be used, each with why: a skipped file is reported, never dropped silently. */
export function skippedChips(skipped: Skipped[]): HTMLElement {
  return h(
    'ul',
    { class: 'chips', 'aria-label': 'Skipped files' },
    ...skipped.map((k) =>
      h(
        'li',
        { class: 'chip chip-warn' },
        h('span', { class: 'chip-reason' }, k.reason),
        h('span', { class: 'chip-name' }, k.name),
      ),
    ),
  );
}

// The names of the looks that work with a single photo, for the line on the first screen.
const SINGLE_PHOTO_NAMES = LOOK_ORDER.filter((id) => minPhotosOf(LOOKS[id]) <= FEWEST_PHOTOS).map(
  (id) => LOOKS[id].name,
);

function joinNames(names: readonly string[]): string {
  return names.length < 2
    ? names.join('')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
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
      'p',
      { class: 'lede small', 'data-testid': 'single-photo-note' },
      `Only have one photo? ${joinNames(SINGLE_PHOTO_NAMES)} work with a single photo.`,
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
      h('span', { class: 'drop-sub' }, `${FEWEST_PHOTOS}–${MAX_PHOTOS} photos · JPEG, PNG or HEIC`),
    ),
    input,
    s.notice && h('p', { class: 'notice', role: 'alert' }, s.notice),
    s.skipped.length > 0 && skippedChips(s.skipped),
  );
}
