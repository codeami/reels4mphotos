import { h } from '../dom';
import { checkCount, MAX_PHOTOS, MIN_PHOTOS } from '../logic';
import type { Staged, Thumbs } from '../staging';

export interface ReviewActions {
  onToggle: (id: number) => void;
}

/** Count line for the grid, e.g. "12 of 14 photos kept". */
export const keptSummary = (list: readonly Staged[]) =>
  `${list.filter((x) => x.kept).length} of ${list.length} photos kept`;

/** Big tiles, two per row on a phone. Each tile is one tap target: tap to remove, tap again to keep. */
export function reviewScreen(list: readonly Staged[], thumbs: Thumbs, a: ReviewActions) {
  const kept = list.filter((x) => x.kept).length;
  const check = checkCount(kept);
  return h(
    'section',
    { class: 'screen', 'aria-labelledby': 'h-review' },
    h('p', { class: 'kicker' }, 'Roll 01'),
    h('h2', { id: 'h-review', tabindex: '-1' }, keptSummary(list)),
    h(
      'p',
      { class: 'lede' },
      `Tap a photo to take it out. Tap it again to keep it. Keep ${MIN_PHOTOS} to ${MAX_PHOTOS}.`,
    ),
    !check.ok && h('p', { class: 'notice', role: 'alert' }, check.message),
    h(
      'ul',
      { class: 'review-grid', 'aria-label': 'Photos you picked' },
      ...list.map((x, i) =>
        h(
          'li',
          { class: 'review-item' },
          h(
            'button',
            {
              class: `review-tile${x.kept ? '' : ' is-out'}`,
              type: 'button',
              'data-review-tile': '',
              'aria-pressed': String(x.kept),
              'aria-label': `Photo ${i + 1}, ${x.file.name}. ${x.kept ? 'Kept. Tap to take out.' : 'Taken out. Tap to keep.'}`,
              onclick: () => a.onToggle(x.id),
            },
            thumbs.canvasFor(x.id),
            h('span', { class: 'review-mark', 'aria-hidden': 'true' }, x.kept ? '✓' : '✕'),
          ),
        ),
      ),
    ),
  );
}
