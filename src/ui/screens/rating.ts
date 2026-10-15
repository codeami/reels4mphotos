import { h } from '../dom';
import { RATINGS, type RatingState } from '../rating';

export interface RatingActions {
  onRate: (value: number) => void;
}

/** 1 to 5 under the playing reel. A low rating asks for another version, up to the cap. */
export function ratingBlock(r: RatingState, a: RatingActions): HTMLElement {
  return h(
    'section',
    { class: 'rating', 'aria-labelledby': 'h-rating', 'data-testid': 'rating' },
    h('h3', { id: 'h-rating' }, 'How is this reel?'),
    h(
      'div',
      { class: 'rating-row', role: 'group', 'aria-label': 'Rate this reel from 1 to 5' },
      ...RATINGS.map((n) =>
        h(
          'button',
          {
            class: `rating-btn${r.value === n ? ' is-on' : ''}`,
            type: 'button',
            'data-rate': String(n),
            'aria-pressed': String(r.value === n),
            'aria-label': `Rate ${n} out of 5`,
            onclick: () => a.onRate(n),
          },
          String(n),
        ),
      ),
    ),
    h(
      'p',
      { class: 'lede small', role: 'status', 'data-testid': 'rating-note' },
      r.note ?? 'Not right? Rate 1 to 4 for a new version. 5 keeps this one.',
    ),
  );
}
