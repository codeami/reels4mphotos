import { h } from '../dom';
import type { State } from '../store';

export interface ExportActions {
  onStart: () => void;
  onShare: () => void;
  onRestart: () => void;
  canShare: (file: File) => boolean;
}

function download(file: File, url: string) {
  const a = h('a', { href: url, download: file.name });
  document.body.append(a);
  a.click();
  a.remove();
}

export function exportScreen(s: State, a: ExportActions): HTMLElement {
  const e = s.exp;
  const head = [h('p', { class: 'kicker' }, 'Lab'), h('h2', { id: 'h-export', tabindex: '-1' }, e.kind === 'done' ? 'Your reel is ready' : 'Export your reel')];
  let body: Array<Node | false>;

  if (e.kind === 'rendering') {
    const pct = Math.round(e.progress * 100);
    body = [
      h('p', { class: 'lede' }, 'Rendering 1080×1920 at 30 fps. Keep this tab open.'),
      h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct), 'aria-label': 'Export progress' },
        h('div', { class: 'progress-fill', style: `width:${pct}%` })),
      h('p', { class: 'progress-num', 'aria-hidden': 'true' }, `${pct}%`),
    ];
  } else if (e.kind === 'done') {
    const canShare = a.canShare(e.file);
    body = [
      e.silent && h('div', { class: 'hint', role: 'status', 'data-testid': 'silent-hint' },
        h('strong', {}, 'This video has no sound. '), 'Add sound in Instagram: pick a track from its music library when you post.'),
      h('p', { class: 'lede' }, `${e.file.name} · ${(e.file.size / 1048576).toFixed(1)} MB`),
      canShare && h('button', { class: 'btn btn-primary', type: 'button', 'data-testid': 'share', onclick: a.onShare }, 'Share'),
      h('button', { class: `btn ${canShare ? 'btn-ghost' : 'btn-primary'}`, type: 'button', 'data-testid': 'download', onclick: () => download(e.file, e.url) }, 'Download MP4'),
      !canShare && h('p', { class: 'lede small' }, 'Sharing files is not available here, so download and post from your gallery.'),
      h('button', { class: 'btn btn-quiet', type: 'button', onclick: a.onRestart }, 'Make another'),
    ];
  } else {
    body = [
      e.kind === 'error' && h('p', { class: 'notice', role: 'alert' }, e.message),
      h('p', { class: 'lede' }, `${s.order.length} photos · ${(s.plan ? s.plan.totalMs / 1000 : 0).toFixed(0)} seconds · 9:16`),
      h('button', { class: 'btn btn-primary', type: 'button', 'data-testid': 'export', onclick: a.onStart }, e.kind === 'error' ? 'Try again' : 'Export MP4'),
    ];
  }
  return h('section', { class: 'screen', 'aria-labelledby': 'h-export' }, ...head, ...body);
}
