import { h } from '../dom';
import {
  dropReasonText,
  groupLeftOut,
  MIN_PHOTOS,
  type LeftOutGroup,
  type LeftOutKind,
} from '../logic';
import type { Photo, State } from '../store';

export interface PickActions {
  onToggle: (id: string) => void;
  onMove: (from: number, to: number) => void;
}

const REMOVED_TEXT = 'Taken out by you';

// One line of help per group: what the reason means and what a tap does.
const GROUP_HELP: Record<LeftOutKind, string> = {
  'not-selected': 'Next best after the ones in your reel. Tap one to put it back.',
  removed: 'You took these out. Tap one to put it back.',
  'near-duplicate': 'Each is next to the photo it lost to. Tap one to keep it too.',
  blurry: 'Soft or moving, though a little blur can be the look. Tap to keep one anyway.',
  underexposed: 'Tap to keep one anyway.',
  overexposed: 'Tap to keep one anyway.',
  'decode-failed': 'These could not be opened.',
};
const groupTitle = (kind: LeftOutKind) =>
  kind === 'removed' ? REMOVED_TEXT : dropReasonText(kind);

function thumb(p: Photo) {
  return h('img', { src: p.url, alt: '', draggable: 'false', loading: 'lazy', decoding: 'async' });
}

/** A left-out photo; tapping it puts it back in the reel. */
function outTile(p: Photo, why: string, a: PickActions) {
  return h(
    'li',
    { class: 'tile tile-out' },
    h(
      'button',
      {
        class: 'tile-img tile-add',
        type: 'button',
        'aria-label': `Add back ${p.file.name}. Left out because: ${why}`,
        onclick: () => a.onToggle(p.id),
      },
      thumb(p),
      h('span', { class: 'tile-plus', 'aria-hidden': 'true' }, '+'),
    ),
  );
}

/** Near-duplicates, clustered under the kept photo they lost to so the call can be judged by eye. */
function duplicatePairs(
  group: LeftOutGroup<Photo>,
  byId: Map<string, Photo>,
  inReel: Set<string>,
  a: PickActions,
) {
  const clusters = new Map<string, Photo[]>();
  for (const p of group.items) {
    const key = p.score.duplicateOf ?? '';
    clusters.set(key, [...(clusters.get(key) ?? []), p]);
  }
  return [...clusters].map(([winnerId, dupes]) => {
    const winner = byId.get(winnerId);
    return h(
      'li',
      { class: 'pair', 'data-testid': 'duplicate-pair' },
      winner &&
        h(
          'figure',
          { class: 'pair-winner' },
          h('div', { class: 'tile-img' }, thumb(winner)),
          h('figcaption', {}, inReel.has(winnerId) ? 'In your reel' : 'Not in your reel'),
        ),
      h(
        'ul',
        { class: 'pair-lost' },
        ...dupes.map((p) => outTile(p, dropReasonText('near-duplicate'), a)),
      ),
    );
  });
}

function leftOutGroup(
  group: LeftOutGroup<Photo>,
  byId: Map<string, Photo>,
  inReel: Set<string>,
  a: PickActions,
) {
  const title = groupTitle(group.kind);
  return h(
    'section',
    { class: 'leftout-group', 'data-reason': group.kind, 'aria-label': title },
    h('h4', { class: 'leftout-title' }, `${title} · ${group.items.length}`),
    h('p', { class: 'lede small' }, GROUP_HELP[group.kind]),
    group.kind === 'near-duplicate'
      ? h('ul', { class: 'pairs' }, ...duplicatePairs(group, byId, inReel, a))
      : h('ul', { class: 'grid grid-out' }, ...group.items.map((p) => outTile(p, title, a))),
  );
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
        ...groupLeftOut(out).map((g) => leftOutGroup(g, byId, new Set(s.order), a)),
      ),
  );
}
