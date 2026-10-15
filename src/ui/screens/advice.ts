import type { SetAdvice } from '../../curation/advice';
import { h } from '../dom';

/** What is strong about the set and where an extra shot would help. Rules, not a model. */
export function adviceCard(advice: SetAdvice): HTMLElement {
  const list = (cls: string, items: string[]) =>
    h('ul', { class: `advice-list ${cls}` }, ...items.map((t) => h('li', {}, t)));
  return h(
    'section',
    { class: 'advice', 'aria-labelledby': 'h-advice', 'data-testid': 'advice' },
    h('h3', { id: 'h-advice' }, 'About your photos'),
    h('p', { class: 'lede small' }, advice.summary),
    advice.strengths.length > 0 && h('h4', {}, 'Strong'),
    advice.strengths.length > 0 && list('advice-good', advice.strengths),
    h('h4', {}, 'Could be better'),
    advice.tips.length > 0
      ? list(
          'advice-tips',
          advice.tips.map((t) => t.text),
        )
      : h(
          'p',
          { class: 'lede small', 'data-testid': 'advice-none' },
          'Nothing to fix. This set looks ready.',
        ),
  );
}
