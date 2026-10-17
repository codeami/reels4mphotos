import { h } from '../dom';
import type { State } from '../store';

export interface ExportActions {
  onStart: () => void;
  onWithoutMusic: (on: boolean) => void;
  onShare: () => void;
  onSaved: () => void;
  onRestart: () => void;
  onAskClear: () => void;
  onCancelClear: () => void;
  onClear: () => void;
  canShare: (file: File) => boolean;
}

function download(file: File, url: string) {
  const a = h('a', { href: url, download: file.name });
  document.body.append(a);
  a.click();
  a.remove();
}

function clearOffer(a: ExportActions) {
  return h(
    'section',
    { class: 'clear-offer' },
    h('p', { class: 'lede small' }, 'Finished? You can clear what this app holds.'),
    h(
      'button',
      { class: 'btn btn-ghost', type: 'button', 'data-testid': 'clear', onclick: a.onAskClear },
      'Clear app copies',
    ),
  );
}

/** Says exactly what goes and what stays. A web app cannot delete anything in Photos. */
function clearConfirm(a: ExportActions) {
  return h(
    'section',
    {
      class: 'clear-confirm',
      role: 'alertdialog',
      'aria-labelledby': 'h-clear',
      'data-testid': 'clear-confirm',
    },
    h('h3', { id: 'h-clear', tabindex: '-1' }, 'Clear the copies this app holds?'),
    h('p', {}, 'This removes these from this app, on this phone:'),
    h(
      'ul',
      { class: 'clear-list' },
      h('li', {}, 'The photos you added.'),
      h('li', {}, 'The preview frames.'),
      h('li', {}, 'The reel plan.'),
      h('li', {}, 'The exported reel video. Save it first.'),
    ),
    h(
      'p',
      { class: 'clear-keeps' },
      h('strong', {}, 'Not deleted: '),
      'your original photos in your Photos library. A web app cannot delete them. To delete them, open Photos and delete them yourself.',
    ),
    h(
      'div',
      { class: 'clear-actions' },
      h(
        'button',
        {
          class: 'btn btn-primary',
          type: 'button',
          'data-testid': 'clear-confirm-yes',
          onclick: a.onClear,
        },
        'Clear app copies',
      ),
      h(
        'button',
        {
          class: 'btn btn-ghost',
          type: 'button',
          'data-testid': 'clear-keep',
          onclick: a.onCancelClear,
        },
        'Keep',
      ),
    ),
  );
}

const ADD_SONG_LINE = 'Add a song inside Instagram when you post.';

/** The cuts were timed to the chosen track's beats, music or not. Says which, in plain words. */
function cutsFollowLine(s: State): string {
  const track = s.track;
  return track
    ? `Cuts follow the beat of ${track.title} (${Math.round(track.beatmap.bpm)} BPM), so pick a song with a similar pace.`
    : 'Cuts follow the beat of the track you chose.';
}

/** A tick box above the Export button: leave the music out and add a song in Instagram instead. */
function withoutMusicOption(s: State, a: ExportActions) {
  return h(
    'label',
    { class: 'no-music' },
    h('input', {
      type: 'checkbox',
      'data-testid': 'no-music',
      checked: s.withoutMusic,
      onchange: (e: Event) => a.onWithoutMusic((e.target as HTMLInputElement).checked),
    }),
    h('span', { class: 'no-music-label' }, 'Export without music'),
    h('p', { class: 'no-music-help', 'data-testid': 'no-music-help' }, ADD_SONG_LINE),
    s.withoutMusic &&
      h('p', { class: 'no-music-help', 'data-testid': 'cuts-follow' }, cutsFollowLine(s)),
  );
}

export function exportScreen(s: State, a: ExportActions): HTMLElement {
  const e = s.exp;
  const head = [
    h('p', { class: 'kicker' }, 'Lab'),
    h(
      'h2',
      { id: 'h-export', tabindex: '-1' },
      e.kind === 'done'
        ? 'Your reel is ready'
        : e.kind === 'cleared'
          ? 'App copies cleared'
          : 'Export your reel',
    ),
  ];
  let body: Array<Node | false>;

  if (e.kind === 'rendering') {
    const pct = Math.round(e.progress * 100);
    body = [
      h('p', { class: 'lede' }, 'Rendering 1080×1920 at 30 fps. Keep this tab open.'),
      h(
        'div',
        {
          class: 'progress',
          role: 'progressbar',
          'aria-valuemin': '0',
          'aria-valuemax': '100',
          'aria-valuenow': String(pct),
          'aria-label': 'Export progress',
        },
        h('div', { class: 'progress-fill', style: { width: `${pct}%` } }),
      ),
      h('p', { class: 'progress-num', 'aria-hidden': 'true' }, `${pct}%`),
    ];
  } else if (e.kind === 'done') {
    const canShare = a.canShare(e.file);
    body = [
      e.silent &&
        (e.withoutMusic
          ? h(
              'div',
              { class: 'hint', role: 'status', 'data-testid': 'silent-hint' },
              h('strong', {}, 'No music in this video, as you asked. '),
              ADD_SONG_LINE,
              ' ',
              cutsFollowLine(s),
            )
          : h(
              'div',
              { class: 'hint', role: 'status', 'data-testid': 'silent-hint' },
              h('strong', {}, 'This video has no sound. '),
              'Add sound in Instagram: pick a track from its music library when you post.',
            )),
      h('p', { class: 'lede' }, `${e.file.name} · ${(e.file.size / 1048576).toFixed(1)} MB`),
      h(
        'button',
        {
          class: 'btn btn-primary',
          type: 'button',
          'data-testid': 'download',
          onclick: () => {
            download(e.file, e.url);
            a.onSaved();
          },
        },
        'Save video',
      ),
      e.saved &&
        h(
          'div',
          { class: 'hint hint-ok', role: 'status', 'data-testid': 'saved-next' },
          h('strong', {}, 'Saved. '),
          'Next: open Instagram and pick the reel from your camera roll. If it landed in Files instead, use Share, then Save Video, to put it in Photos.',
        ),
      canShare &&
        h(
          'button',
          { class: 'btn btn-ghost', type: 'button', 'data-testid': 'share', onclick: a.onShare },
          'Share… (AirDrop, Messages)',
        ),
      h('button', { class: 'btn btn-quiet', type: 'button', onclick: a.onRestart }, 'Make another'),
      s.confirmClear ? clearConfirm(a) : clearOffer(a),
    ];
  } else if (e.kind === 'cleared') {
    body = [
      h(
        'p',
        { class: 'lede', role: 'status', 'data-testid': 'cleared' },
        'Done. This app no longer holds your photos or your reel.',
      ),
      h(
        'p',
        { class: 'lede', 'data-testid': 'originals-note' },
        'Your original photos are still in your Photos library. To delete them, open Photos and delete them yourself.',
      ),
      h(
        'button',
        { class: 'btn btn-primary', type: 'button', onclick: a.onRestart },
        'Start again',
      ),
    ];
  } else {
    body = [
      e.kind === 'error' && h('p', { class: 'notice', role: 'alert' }, e.message),
      h(
        'p',
        { class: 'lede' },
        `${s.order.length} photos · ${(s.plan ? s.plan.totalMs / 1000 : 0).toFixed(0)} seconds · 9:16`,
      ),
      withoutMusicOption(s, a),
      h(
        'button',
        { class: 'btn btn-primary', type: 'button', 'data-testid': 'export', onclick: a.onStart },
        e.kind === 'error' ? 'Try again' : 'Export MP4',
      ),
    ];
  }
  return h('section', { class: 'screen', 'aria-labelledby': 'h-export' }, ...head, ...body);
}
